import Foundation

/// Detected hardware/system summary. Values are "NOT AVAILABLE" when macOS
/// does not expose them; nothing is ever fabricated.
public struct DeviceInfo: Codable, Sendable, Equatable {
    public var modelName: String
    public var modelIdentifier: String
    public var serialNumber: String
    public var chip: String
    public var cpuName: String
    public var gpuName: String
    public var memoryGB: String
    public var storageGB: String
    public var osVersion: String
    public var osBuild: String
    public var architecture: String
    public var computerName: String
    public var hostName: String

    public static let unavailable = "NOT AVAILABLE"

    public init(
        modelName: String = unavailable,
        modelIdentifier: String = unavailable,
        serialNumber: String = unavailable,
        chip: String = unavailable,
        cpuName: String = unavailable,
        gpuName: String = unavailable,
        memoryGB: String = unavailable,
        storageGB: String = unavailable,
        osVersion: String = unavailable,
        osBuild: String = unavailable,
        architecture: String = unavailable,
        computerName: String = unavailable,
        hostName: String = unavailable
    ) {
        self.modelName = modelName
        self.modelIdentifier = modelIdentifier
        self.serialNumber = serialNumber
        self.chip = chip
        self.cpuName = cpuName
        self.gpuName = gpuName
        self.memoryGB = memoryGB
        self.storageGB = storageGB
        self.osVersion = osVersion
        self.osBuild = osBuild
        self.architecture = architecture
        self.computerName = computerName
        self.hostName = hostName
    }

    private enum CodingKeys: String, CodingKey {
        case modelName, modelIdentifier, serialNumber, chip, cpuName, gpuName
        case memoryGB, storageGB, osVersion, osBuild, architecture
        case computerName, hostName
    }

    /// Tolerant decode: fields added after older sessions were saved fall back
    /// to `unavailable` instead of failing the whole session load.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        modelName = try c.decodeIfPresent(String.self, forKey: .modelName) ?? Self.unavailable
        modelIdentifier = try c.decodeIfPresent(String.self, forKey: .modelIdentifier) ?? Self.unavailable
        serialNumber = try c.decodeIfPresent(String.self, forKey: .serialNumber) ?? Self.unavailable
        chip = try c.decodeIfPresent(String.self, forKey: .chip) ?? Self.unavailable
        cpuName = try c.decodeIfPresent(String.self, forKey: .cpuName) ?? Self.unavailable
        gpuName = try c.decodeIfPresent(String.self, forKey: .gpuName) ?? Self.unavailable
        memoryGB = try c.decodeIfPresent(String.self, forKey: .memoryGB) ?? Self.unavailable
        storageGB = try c.decodeIfPresent(String.self, forKey: .storageGB) ?? Self.unavailable
        osVersion = try c.decodeIfPresent(String.self, forKey: .osVersion) ?? Self.unavailable
        osBuild = try c.decodeIfPresent(String.self, forKey: .osBuild) ?? Self.unavailable
        architecture = try c.decodeIfPresent(String.self, forKey: .architecture) ?? Self.unavailable
        computerName = try c.decodeIfPresent(String.self, forKey: .computerName) ?? Self.unavailable
        hostName = try c.decodeIfPresent(String.self, forKey: .hostName) ?? Self.unavailable
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(modelName, forKey: .modelName)
        try c.encode(modelIdentifier, forKey: .modelIdentifier)
        try c.encode(serialNumber, forKey: .serialNumber)
        try c.encode(chip, forKey: .chip)
        try c.encode(cpuName, forKey: .cpuName)
        try c.encode(gpuName, forKey: .gpuName)
        try c.encode(memoryGB, forKey: .memoryGB)
        try c.encode(storageGB, forKey: .storageGB)
        try c.encode(osVersion, forKey: .osVersion)
        try c.encode(osBuild, forKey: .osBuild)
        try c.encode(architecture, forKey: .architecture)
        try c.encode(computerName, forKey: .computerName)
        try c.encode(hostName, forKey: .hostName)
    }
}
