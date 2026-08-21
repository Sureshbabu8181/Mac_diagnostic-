import Foundation

public enum DiagnosticKind: String, Codable, CaseIterable, Identifiable, Sendable {
    case battery
    case display
    case keyboard
    case trackpad
    case speakers
    case microphone
    case camera
    case ports
    case storage
    case memory
    case network
    case system

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .battery: "Battery"
        case .display: "Display"
        case .keyboard: "Keyboard"
        case .trackpad: "Trackpad"
        case .speakers: "Speakers"
        case .microphone: "Microphone"
        case .camera: "Camera"
        case .ports: "Ports"
        case .storage: "Storage"
        case .memory: "Memory"
        case .network: "Network"
        case .system: "System"
        }
    }

    public var isManual: Bool {
        switch self {
        case .display, .keyboard, .trackpad, .speakers, .microphone, .camera:
            true
        default:
            false
        }
    }
}
