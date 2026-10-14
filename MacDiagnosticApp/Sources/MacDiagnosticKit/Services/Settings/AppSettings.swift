import Foundation

/// Persistent application settings (offline, JSON file in Application Support).
public struct AppSettings: Codable, Sendable, Equatable {
    public var companyName: String
    public var batteryThresholds: BatteryThresholds
    /// When enabled, run/verdict buttons on test pages use their accent (current)
    /// color background; when disabled they use a plain white/neutral background.
    public var accentTestButtons: Bool

    // MARK: Report delivery (only used when the technician opts in)

    /// Default recipient for the "Email Report" mailto composer.
    public var reportEmailRecipient: String
    /// Google Apps Script web-app endpoint (HTTPS) that appends each report
    /// as a row in a Google Sheet. Leave empty to disable.
    public var sheetsWebhookURL: String
    /// When enabled (and a webhook is configured), each finished session is
    /// POSTed to the sheet automatically after it is saved.
    public var autoSendToSheetAfterRun: Bool

    public init(
        companyName: String = "",
        batteryThresholds: BatteryThresholds = BatteryThresholds(),
        accentTestButtons: Bool = true,
        reportEmailRecipient: String = "",
        sheetsWebhookURL: String = "",
        autoSendToSheetAfterRun: Bool = false
    ) {
        self.companyName = companyName
        self.batteryThresholds = batteryThresholds
        self.accentTestButtons = accentTestButtons
        self.reportEmailRecipient = reportEmailRecipient
        self.sheetsWebhookURL = sheetsWebhookURL
        self.autoSendToSheetAfterRun = autoSendToSheetAfterRun
    }

    private enum CodingKeys: String, CodingKey {
        case companyName, batteryThresholds, accentTestButtons
        case reportEmailRecipient, sheetsWebhookURL, autoSendToSheetAfterRun
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        companyName = try container.decodeIfPresent(String.self, forKey: .companyName) ?? ""
        batteryThresholds = try container.decodeIfPresent(BatteryThresholds.self, forKey: .batteryThresholds) ?? BatteryThresholds()
        accentTestButtons = try container.decodeIfPresent(Bool.self, forKey: .accentTestButtons) ?? true
        reportEmailRecipient = try container.decodeIfPresent(String.self, forKey: .reportEmailRecipient) ?? ""
        sheetsWebhookURL = try container.decodeIfPresent(String.self, forKey: .sheetsWebhookURL) ?? ""
        autoSendToSheetAfterRun = try container.decodeIfPresent(Bool.self, forKey: .autoSendToSheetAfterRun) ?? false
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