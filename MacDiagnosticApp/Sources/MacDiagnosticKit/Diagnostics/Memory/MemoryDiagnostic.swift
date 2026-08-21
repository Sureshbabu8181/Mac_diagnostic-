import Foundation
import Darwin.Mach

/// Memory / system resource readouts. Clearly NOT a physical RAM stress test.
public struct MemoryDiagnostic: AutomatedDiagnosticProvider {
    public let meta = DiagnosticMeta(
        kind: .memory,
        title: "Memory",
        whyItMatters: "Reports installed RAM, usage, memory pressure and swap. A full hardware memory test requires Apple Diagnostic mode (reboot); this module only reads public statistics.",
        isManual: false
    )

    public init() {}

    public func run() async -> DiagnosticResult {
        var metrics: [DiagnosticMetric] = []

        let total = ProcessInfo.processInfo.physicalMemory
        metrics.append(DiagnosticMetric(name: "Installed RAM", value: gigaBytes(total)))
        metrics.append(DiagnosticMetric(name: "Architecture", value: Sysctl.string("hw.machine") ?? DeviceInfo.unavailable))

        let vm = vmStats()
        metrics.append(DiagnosticMetric(name: "Free", value: gigaBytes(vm.freeBytes)))
        metrics.append(DiagnosticMetric(name: "Active", value: gigaBytes(vm.activeBytes)))
        metrics.append(DiagnosticMetric(name: "Inactive", value: gigaBytes(vm.inactiveBytes)))
        metrics.append(DiagnosticMetric(name: "Wired", value: gigaBytes(vm.wiredBytes)))
        metrics.append(DiagnosticMetric(name: "Compressed", value: gigaBytes(vm.compressedBytes)))

        var used = vm.freeBytes + vm.inactiveBytes
        if used < total { used -= 0 } // keep used meaningful
        let pressure = pressurePercent(totalBytes: total, vm: vm)
        metrics.append(DiagnosticMetric(name: "Memory Pressure", value: pressure.rawValue))

        let swap = swapUsage()
        metrics.append(DiagnosticMetric(name: "Swap Used", value: swap.usedText))
        metrics.append(DiagnosticMetric(name: "Swap Total", value: swap.totalText))

        let thermal = ProcessInfo.processInfo.thermalState
        metrics.append(DiagnosticMetric(name: "Thermal State", value: thermal.displayName))

        var status: DiagnosticStatus = .pass
        var summary = "Memory statistics collected. Note: a full hardware RAM test requires Apple Diagnostic mode (boot-time), not this application."

        if pressure == .high || pressure == .critical {
            status = .warning
            summary += " High memory pressure detected."
        }
        if thermal == .critical {
            status = .warning
            summary += " System thermal state critical."
        }

        return DiagnosticResult(kind: .memory, status: status, summary: summary, metrics: metrics)
    }

    // MARK: - vm_statistics

    enum Pressure: String {
        case nominal = "Nominal"
        case fair = "Fair"
        case high = "High"
        case critical = "Critical"
    }

    struct VM {
        let freeBytes: UInt64
        let activeBytes: UInt64
        let inactiveBytes: UInt64
        let wiredBytes: UInt64
        let compressedBytes: UInt64
    }

    func vmStats() -> VM {
        var info = vm_statistics64_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<vm_statistics64_data_t>.size / MemoryLayout<integer_t>.size)
        let result = withUnsafeMutablePointer(to: &info) { ptr in
            ptr.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { intPtr in
                host_statistics64(mach_host_self(), HOST_VM_INFO64, intPtr, &count)
            }
        }
        let pageSize = UInt64(Sysctl.int("hw.pagesize") ?? Int(getpagesize()))
        guard result == KERN_SUCCESS else {
            return VM(freeBytes: 0, activeBytes: 0, inactiveBytes: 0, wiredBytes: 0, compressedBytes: 0)
        }
        return VM(
            freeBytes: UInt64(info.free_count) * pageSize,
            activeBytes: UInt64(info.active_count) * pageSize,
            inactiveBytes: UInt64(info.inactive_count) * pageSize,
            wiredBytes: UInt64(info.wire_count) * pageSize,
            compressedBytes: UInt64(info.compressor_page_count) * pageSize
        )
    }

    /// Documented approximation: wired + active + compressed over total RAM is a
    /// machine-usage proxy for memory pressure; it is NOT the kernel's pressure level.
    func pressurePercent(totalBytes: UInt64, vm: VM) -> Pressure {
        guard totalBytes > 0 else { return .nominal }
        let busy = Double(vm.wiredBytes + vm.activeBytes + vm.compressedBytes) / Double(totalBytes)
        switch busy {
        case 0..<0.7: return .nominal
        case 0.7..<0.85: return .fair
        case 0.85..<0.95: return .high
        default: return .critical
        }
    }

    // MARK: - swap

    struct Swap {
        var usedBytes: UInt64 = 0
        var totalBytes: UInt64 = 0
        var usedText: String { gigaBytes(usedBytes) }
        var totalText: String { gigaBytes(totalBytes) }
    }

    func swapUsage() -> Swap {
        var info = xsw_usage()
        var infoSize = MemoryLayout<xsw_usage>.size
        guard sysctlbyname("vm.swapusage", &info, &infoSize, nil, 0) == 0 else { return Swap() }
        return Swap(
            usedBytes: UInt64(info.xsu_used) * 1024,
            totalBytes: UInt64(info.xsu_total) * 1024
        )
    }
}

extension ProcessInfo.ThermalState {
    var displayName: String {
        switch self {
        case .nominal: "Nominal"
        case .fair: "Fair"
        case .serious: "Serious"
        case .critical: "Critical"
        @unknown default: "Unknown"
        }
    }
}