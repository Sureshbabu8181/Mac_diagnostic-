import Foundation

/// Persistent application settings (offline, JSON file in Application Support).
public struct AppSettings: Codable, Sendable, Equatable {
    public var companyName: String
    public var batteryThresholds: BatteryThresholds
    /// When enabled, run/verdict buttons on test pages use their accent (current)
    /// color background; when disabled they use a plain white/neutral background.
    public var accentTestButtons: Bool

    public init(companyName: String = "", batteryThresholds: BatteryThresholds = BatteryThresholds(), accentTestButtons: Bool = true) {
        self.companyName = companyName
        self.batteryThresholds = batteryThresholds
        self.accentTestButtons = accentTestButtons
    }

    private enum CodingKeys: String, CodingKey {
        case companyName, batteryThresholds, accentTestButtons
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        companyName = try container.decodeIfPresent(String.self, forKey: .companyName) ?? ""
        batteryThresholds = try container.decodeIfPresent(BatteryThresholds.self, forKey: .batteryThresholds) ?? BatteryThresholds()
        accentTestButtons = try container.decodeIfPresent(Bool.self, forKey: .accentTestButtons) ?? true
    }
}

public enum SettingsStore {
    private static var fileURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("MacDiagnosticApp", isDirectory: true)
            .appendingPathComponent("settings.json")
    }

    public static func load() -> AppSettings {
        guard let data = try? Data(contentsOf: fileURL) else { return AppSettings() }
        return (try? JSONDecoder().decode(AppSettings.self, from: data)) ?? AppSettings()
    }

    public static func save(_ settings: AppSettings) {
        let directory = fileURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        if let data = try? JSONEncoder().encode(settings) {
            try? data.write(to: fileURL, options: [.atomic])
        }
    }
}