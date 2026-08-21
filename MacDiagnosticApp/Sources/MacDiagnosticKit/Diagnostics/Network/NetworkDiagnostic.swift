import Foundation
import Network
import SystemConfiguration
import CoreBluetooth

/// Network adapter, IP, connectivity and Bluetooth availability. Never reads
/// Wi-Fi passwords or credentials.
public struct NetworkDiagnostic: AutomatedDiagnosticProvider {
    public let meta = DiagnosticMeta(
        kind: .network,
        title: "Network",
        whyItMatters: "Confirms network adapters exist, have addresses and reach the local topology. Passwords/credentials are never read or logged.",
        isManual: false
    )

    public init() {}

    public func run() async -> DiagnosticResult {
        var metrics: [DiagnosticMetric] = []

        let interfaces = interfaceAddresses()
        if interfaces.isEmpty {
            metrics.append(DiagnosticMetric(name: "Interfaces", value: "None found"))
        }
        for iface in interfaces {
            metrics.append(DiagnosticMetric(name: "Interface", value: iface.name))
            metrics.append(DiagnosticMetric(name: "Status", value: iface.hasIPv4 || iface.hasIPv6 ? "Active" : "No address"))
            if let ipv4 = iface.ipv4 {
                metrics.append(DiagnosticMetric(name: "IPv4", value: ipv4))
            }
            if let ipv6 = iface.ipv6 {
                metrics.append(DiagnosticMetric(name: "IPv6", value: ipv6))
            }
        }

        if let gateway = defaultGateway() {
            metrics.append(DiagnosticMetric(name: "Gateway", value: gateway))
        }
        if let dns = dnsServers(), !dns.isEmpty {
            metrics.append(DiagnosticMetric(name: "DNS", value: dns.joined(separator: ", ")))
        }

        let path = await currentPath()
        var pending: [String] = []
        metrics.append(DiagnosticMetric(name: "Path Status", value: path?.status == .satisfied ? "Satisfied" : "Unsatisfied"))
        if let path {
            metrics.append(DiagnosticMetric(name: "Explorer", value: path.isExpensive ? "Expensive" : "Default"))
            var families: [String] = []
            if path.supportsIPv4 { families.append("IPv4") }
            if path.supportsIPv6 { families.append("IPv6") }
            metrics.append(DiagnosticMetric(name: "Families", value: families.isEmpty ? "None" : families.joined(separator: ", ")))
            var media: [String] = []
            if path.usesInterfaceType(.wifi) { media.append("Wi-Fi") }
            if path.usesInterfaceType(.wiredEthernet) { media.append("Ethernet") }
            metrics.append(DiagnosticMetric(name: "Active Media", value: media.isEmpty ? "None detected" : media.joined(separator: ", ")))
            if path.status != .satisfied {
                pending.append("No active network path; check Wi-Fi/Ethernet connection.")
            }
        }

        let bt = bluetoothState()
        var btLabel = "Not available"
        switch bt {
        case .poweredOn: btLabel = "On"
        case .poweredOff: btLabel = "Off"
        case .unauthorized: btLabel = "Permission denied"
        case .resetting: btLabel = "Resetting"
        case .unsupported: btLabel = "Not supported"
        case .unknown: btLabel = "Unknown"
        @unknown default: btLabel = "Unknown"
        }
        metrics.append(DiagnosticMetric(name: "Bluetooth", value: btLabel))

        let status: DiagnosticStatus = pending.isEmpty ? .pass : .warning
        return DiagnosticResult(
            kind: .network,
            status: status,
            summary: pending.isEmpty ? "Adapters detected and addresses assigned." : pending.joined(separator: " "),
            metrics: metrics
        )
    }

    // MARK: - getifaddrs

    struct Interface {
        let name: String
        var ipv4: String?
        var ipv6: String?
        var hasIPv4: Bool { ipv4 != nil }
        var hasIPv6: Bool { ipv6 != nil }
    }

    func interfaceAddresses() -> [Interface] {
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifaddr) == 0 else { return [] }
        defer { freeifaddrs(ifaddr) }

        var result: [String: Interface] = [:]
        var ptr = ifaddr
        while let current = ptr {
            defer { ptr = current.pointee.ifa_next }
            guard let addr = current.pointee.ifa_addr else { continue }
            let name = String(cString: current.pointee.ifa_name)
            if name.hasPrefix("lo") { continue }

            var iface = result[name] ?? Interface(name: name)
            if addr.pointee.sa_family == UInt8(AF_INET) {
                var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                if getnameinfo(addr, socklen_t(addr.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
                    iface.ipv4 = host.withUnsafeBufferPointer { String(cString: $0.baseAddress!) }
                }
            } else if addr.pointee.sa_family == UInt8(AF_INET6) {
                var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                if getnameinfo(addr, socklen_t(addr.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
                    iface.ipv6 = host.withUnsafeBufferPointer { String(cString: $0.baseAddress!) }
                }
            }
            result[name] = iface
        }
        return Array(result.values).filter { $0.hasIPv4 || $0.hasIPv6 }
    }

    func defaultGateway() -> String? {
        guard let store = SCDynamicStoreCreate(nil, "MacDiagnostic" as CFString, nil, nil),
              let value = SCDynamicStoreCopyValue(store, "State:/Network/Global/IPv4" as CFString),
              let dict = value as? [String: Any]
        else { return nil }
        return dict["Router"] as? String
    }

    func dnsServers() -> [String]? {
        guard let store = SCDynamicStoreCreate(nil, "MacDiagnostic" as CFString, nil, nil),
              let value = SCDynamicStoreCopyValue(store, "State:/Network/Global/DNS" as CFString),
              let dict = value as? [String: Any]
        else { return nil }
        return dict["ServerAddresses"] as? [String]
    }

    func currentPath() async -> NWPath? {
        let monitor = NWPathMonitor()
        let box = PathBox()
        monitor.pathUpdateHandler = { box.update($0) }
        monitor.start(queue: DispatchQueue.global(qos: .userInitiated))
        let path = await box.waitForFirst()
        monitor.cancel()
        return path
    }

    func bluetoothState() -> CBManagerState {
        CBCentralManager(delegate: nil, queue: nil, options: [CBCentralManagerOptionShowPowerAlertKey: false]).state
    }
}

/// Small concurrency-safe box for the first NWPath update.
private final class PathBox: @unchecked Sendable {
    private var value: NWPath?
    private let lock = NSLock()
    private var continuation: CheckedContinuation<NWPath?, Never>?

    func update(_ path: NWPath) {
        lock.lock()
        guard value == nil else { lock.unlock(); return }
        value = path
        let cont = continuation
        continuation = nil
        lock.unlock()
        cont?.resume(returning: path)
    }

    func waitForFirst() async -> NWPath? {
        await withCheckedContinuation { continuation in
            lock.lock()
            if let value {
                lock.unlock()
                continuation.resume(returning: value)
            } else {
                self.continuation = continuation
                lock.unlock()
            }
        }
    }
}