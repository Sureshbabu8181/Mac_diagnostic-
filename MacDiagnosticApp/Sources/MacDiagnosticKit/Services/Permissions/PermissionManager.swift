import Foundation
import AppKit
import AVFoundation

/// Central permission provider. Requests TCC camera/microphone access only at
/// the moment the relevant test needs it, with clear instructions.
public enum PermissionManager {
    public enum Kind: Sendable {
        case camera
        case microphone
    }

    public struct Status: Sendable {
        public let granted: Bool
        public let denied: Bool
        public let notDetermined: Bool
        public let message: String
    }

    public static func status(for kind: Kind) -> Status {
        switch kind {
        case .camera:
            let s = CameraProbe.permissionStatus()
            return Status(
                granted: s == .authorized,
                denied: s == .denied,
                notDetermined: s == .notDetermined,
                message: permissionText(for: .camera, status: s)
            )
        case .microphone:
            let s = MicrophoneProbe.permissionStatus()
            return Status(
                granted: s == .authorized,
                denied: s == .denied,
                notDetermined: s == .notDetermined,
                message: permissionText(for: .microphone, status: s)
            )
        }
    }

    public static func request(_ kind: Kind) async -> Bool {
        switch kind {
        case .camera: return await CameraProbe.requestPermission()
        case .microphone: return await MicrophoneProbe.requestPermission()
        }
    }

    public static func openSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy"),
           NSWorkspace.shared.open(url) {
            // opened
        }
    }

    private static func permissionText(for kind: Kind, status: AVAuthorizationStatus) -> String {
        let name = kind == .camera ? "Camera" : "Microphone"
        switch status {
        case .authorized:
            return "\(name) permission granted."
        case .denied, .restricted:
            return "\(name) permission denied. Enable it in System Settings > Privacy & Security > \(name), then re-run the test."
        case .notDetermined:
            return "\(name) permission has not been requested yet."
        @unknown default:
            return "\(name) permission status unknown."
        }
    }
}