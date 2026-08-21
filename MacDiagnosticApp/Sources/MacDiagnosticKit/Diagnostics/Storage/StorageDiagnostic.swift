import Foundation

/// Read-only storage diagnostics. Never erases, partitions, or writes.
public struct StorageDiagnostic: AutomatedDiagnosticProvider {
    public let meta = DiagnosticMeta(
        kind: .storage,
        title: "Storage",
        whyItMatters: "Verifies storage is readable, reports capacity/usage, encryption and file system. SMART health is not exposed by public macOS APIs — internal flash health is reported as NOT AVAILABLE.",
        isManual: false
    )

    public init() {}

    public func run() async -> DiagnosticResult {
        var metrics: [DiagnosticMetric] = []
        var warnings: [String] = []
        var failures: [String] = []

        let volumes = enumerableVolumes()
        if volumes.isEmpty {
            failures.append("No readable mount points.")
        }

        for volume in volumes {
            metrics.append(DiagnosticMetric(name: "Volume", value: volume.name))
            metrics.append(DiagnosticMetric(name: "File System", value: volume.fileSystem))
            metrics.append(DiagnosticMetric(name: "Capacity", value: volume.capacityText))
            metrics.append(DiagnosticMetric(name: "Used", value: volume.usedText))
            metrics.append(DiagnosticMetric(name: "Free", value: volume.freeText))
            metrics.append(DiagnosticMetric(name: "Encrypted", value: "NOT AVAILABLE"))
            if volume.isRemovable {
                metrics.append(DiagnosticMetric(name: "Type", value: "Removable"))
            }

            if let freeRatio = volume.freeRatio, freeRatio < 0.05 {
                warnings.append("\(volume.name): less than 5% free space.")
            }
        }

        var status: DiagnosticStatus = .pass
        var summary = "Readable storage verified. Internal flash SMART health is not available through macOS public APIs."
        if !failures.isEmpty {
            status = .fail
            summary = failures.joined(separator: " ")
        } else if !warnings.isEmpty {
            status = .warning
            summary = (summary + " " + warnings.joined(separator: " ")).trimmingCharacters(in: .whitespaces)
        }

        return DiagnosticResult(kind: .storage, status: status, summary: summary, metrics: metrics)
    }

    // MARK: - Volume model

    public struct VolumeInfo {
        let name: String
        let fileSystem: String
        let totalBytes: UInt64
        let usedBytes: UInt64
        let freeBytes: UInt64
        let isRemovable: Bool

        var freeRatio: Double? {
            guard totalBytes > 0 else { return nil }
            return Double(freeBytes) / Double(totalBytes)
        }

        var capacityText: String { StorageDiagnostic.formatBytes(totalBytes) }
        var usedText: String { StorageDiagnostic.formatBytes(usedBytes) }
        var freeText: String { StorageDiagnostic.formatBytes(freeBytes) }
    }

    private static func formatBytes(_ bytes: UInt64) -> String {
        ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }

    public func enumerableVolumes() -> [VolumeInfo] {
        let keys: [URLResourceKey] = [
            .volumeNameKey, .volumeTotalCapacityKey, .volumeAvailableCapacityForImportantUsageKey,
            .volumeIsRemovableKey,
        ]
        let fm = FileManager.default
        var result: [VolumeInfo] = []

        guard let urls = fm.mountedVolumeURLs(includingResourceValuesForKeys: keys, options: [.skipHiddenVolumes]) else {
            return result
        }

        for url in urls {
            guard let values = try? url.resourceValues(forKeys: Set(keys)) else { continue }
            let total = UInt64(values.volumeTotalCapacity ?? 0)
            let free = UInt64(values.volumeAvailableCapacityForImportantUsage ?? 0)
            let totalInt = (values.volumeTotalCapacity ?? 0)
            let freeInt = (values.volumeAvailableCapacityForImportantUsage ?? 0)
            if totalInt == 0 && freeInt == 0 { continue }

            let fsName = fileSystemName(at: url.path) ?? "unknown"
            result.append(VolumeInfo(
                name: values.volumeName ?? url.path,
                fileSystem: fsName,
                totalBytes: total,
                usedBytes: total > free ? total - free : 0,
                freeBytes: free,
                isRemovable: values.volumeIsRemovable ?? false
            ))
        }
        return result
    }

    private func fileSystemName(at path: String) -> String? {
        var stat = statfs()
        guard statfs(path, &stat) == 0 else { return nil }
        return withUnsafePointer(to: &stat.f_fstypename.0) { ptr in
            String(cString: ptr)
        }
    }
}