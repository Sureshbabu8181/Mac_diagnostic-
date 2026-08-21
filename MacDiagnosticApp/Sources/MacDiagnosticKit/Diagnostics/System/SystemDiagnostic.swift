import Foundation
import IOKit

/// System-level diagnostic information: panic history, USB/TB enumeration.
/// Output is minimized and redacted; no credentials or personal files.
public struct SystemDiagnostic: AutomatedDiagnosticProvider {
    public let meta = DiagnosticMeta(
        kind: .system,
        title: "System",
        whyItMatters: "Surfaces kernel panic history and USB/Thunderbolt enumeration to spot hardware-related instability.",
        isManual: false
    )

    public init() {}

    public func run() async -> DiagnosticResult {
        var metrics: [DiagnosticMetric] = []

        let panicFiles = panicReportFiles()
        metrics.append(DiagnosticMetric(name: "Panic Reports (30d)", value: "\(panicFiles)"))
        metrics.append(DiagnosticMetric(name: "Kernel Panics", value: panicFiles > 0 ? "Yes" : "None found"))

        let usb = usbDevices()
        metrics.append(DiagnosticMetric(name: "USB Devices", value: "\(usb.count)"))
        for device in usb.prefix(6) {
            metrics.append(DiagnosticMetric(name: "USB", value: device))
        }

        let thunderbolt = thunderboltDevices()
        metrics.append(DiagnosticMetric(name: "Thunderbolt Devices", value: "\(thunderbolt.count)"))
        for device in thunderbolt.prefix(4) {
            metrics.append(DiagnosticMetric(name: "Thunderbolt", value: device))
        }

        var status: DiagnosticStatus = .pass
        var summary = "No unexpected restart or panic reports found in the last 30 days."
        if panicFiles > 0 {
            status = .warning
            summary = "\(panicFiles) panic report(s) found in the last 30 days. Review before deploying to production."
        }

        return DiagnosticResult(kind: .system, status: status, summary: summary, metrics: metrics)
    }

    // MARK: - Panic reports

    func panicReportFiles() -> Int {
        let paths = [
            FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/DiagnosticReports"),
        ]
        let cutoff = Date().addingTimeInterval(-30 * 86_400)
        var count = 0
        let fm = FileManager.default
        for dir in paths {
            let files = (try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.creationDateKey, .contentModificationDateKey])) ?? []
            for file in files where file.pathExtension == "panic" || file.pathExtension == "ips" {
                guard let attrs = try? fm.attributesOfItem(atPath: file.path),
                      let mod = attrs[.modificationDate] as? Date
                else { continue }
                if mod >= cutoff { count += 1 }
            }
        }
        return count
    }

    // MARK: - USB / Thunderbolt

    func usbDevices() -> [String] {
        var names: [String] = []
        IOKitSupport.forEachService(matching: "IOUSBHostDevice") { service in
            if let name = IOKitSupport.stringProperty("USB Product Name", on: service) ?? IOKitSupport.stringProperty("IOUserClientName", on: service) {
                names.append(name)
            }
        }
        return names
    }

    func thunderboltDevices() -> [String] {
        var names: [String] = []
        // Apple Silicon exposes Thunderbolt bridges through the NHI class family.
        IOKitSupport.forEachService(matching: "AppleThunderboltNHIType") { service in
            if let name = IOKitSupport.stringProperty("name", on: service) ?? IOKitSupport.stringProperty("IOClass", on: service) {
                names.append(name)
            }
        }
        return names
    }
}