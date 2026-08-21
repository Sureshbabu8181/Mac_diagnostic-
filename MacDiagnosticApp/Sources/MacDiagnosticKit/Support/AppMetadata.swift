import Foundation

/// Single source of app version. Reads the bundle's CFBundleShortVersionString
/// when packaged; falls back to a constant when run via SPM (no bundle).
public enum AppMetadata {
    public static let fallbackVersion = "1.0.1.1"

    public static var version: String {
        if let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
           !v.isEmpty {
            return v
        }
        return fallbackVersion
    }
}