import Foundation
import IOKit

/// Collects device / system information via public IOKit, sysctl and
/// Foundation APIs. Values missing from the OS are reported as
/// `DeviceInfo.unavailable` — never fabricated.
public struct SystemInfoService: Sendable {
    public init() {}

    public func collect() -> DeviceInfo {
        let modelId = Sysctl.string("hw.model") ?? DeviceInfo.unavailable
        let arch = Sysctl.string("hw.machine") ?? DeviceInfo.unavailable

        var info = DeviceInfo(
            modelIdentifier: modelId,
            architecture: arch
        )

        info.serialNumber = readExpertProperty("IOPlatformSerialNumber") ?? DeviceInfo.unavailable
        info.modelName = readExpertProperty("model") ?? inferModelName(from: modelId)
        info.chip = Sysctl.string("machdep.cpu.brand_string") ?? DeviceInfo.unavailable
        info.cpuName = info.chip
        info.gpuName = readGPUName() ?? DeviceInfo.unavailable

        if let mem = Sysctl.uint64("hw.memsize") {
            info.memoryGB = gigaBytes(mem)
        }

        info.storageGB = primaryVolumeStorage()

        let (version, build) = osVersion()
        info.osVersion = version
        info.osBuild = build

        info.computerName = Host.current().localizedName ?? DeviceInfo.unavailable
        info.hostName = Host.current().name ?? DeviceInfo.unavailable

        return info
    }

    // MARK: - Helpers

    private func readExpertProperty(_ name: String) -> String? {
        guard let service = IOKitSupport.firstService(matching: "IOPlatformExpertDevice") else { return nil }
        defer { IOObjectRelease(service) }
        return IOKitSupport.stringProperty(name, on: service)
    }

    /// Map chip brand to marketing name for display.
    private func inferModelName(from identifier: String) -> String {
        // Model identifier e.g. "Mac14,2". Best-effort mapping; unknown → identifier.
        return identifier
    }

    private func readGPUName() -> String? {
        var names: Set<String> = []
        IOKitSupport.forEachService(matching: "IOAccelerator") { service in
            if let name = IOKitSupport.stringProperty("model", on: service) {
                names.insert(name)
            } else if let name = IOKitSupport.stringProperty("IOClass", on: service) {
                names.insert(name)
            }
        }
        return names.isEmpty ? nil : names.sorted().joined(separator: ", ")
    }

    private func primaryVolumeStorage() -> String {
        let root = URL(fileURLWithPath: "/")
        guard let values = try? root.resourceValues(forKeys: [.volumeTotalCapacityKey]) else {
            return DeviceInfo.unavailable
        }
        // Total capacity of the primary volume (rounded to GB), or NOT AVAILABLE.
        guard let total = values.volumeTotalCapacity else { return DeviceInfo.unavailable }
        return String(format: "%.0f GB", Double(total) / 1_000_000_000)
    }

    private func osVersion() -> (String, String) {
        let version = ProcessInfo.processInfo.operatingSystemVersion
        let build = Sysctl.string("kern.osversion") ?? DeviceInfo.unavailable
        return ("\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)", build)
    }
}