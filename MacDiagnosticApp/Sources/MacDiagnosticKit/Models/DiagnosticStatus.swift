import Foundation

/// Single source of truth for the outcome of any test.
public enum DiagnosticStatus: String, Codable, CaseIterable, Sendable {
    case notStarted
    case running
    case pass
    case warning
    case fail
    case skipped
    case notAvailable
    case manualRequired

    public var displayName: String {
        switch self {
        case .notStarted: "NOT TESTED"
        case .running: "RUNNING"
        case .pass: "PASS"
        case .warning: "WARNING"
        case .fail: "FAIL"
        case .skipped: "SKIPPED"
        case .notAvailable: "NOT AVAILABLE"
        case .manualRequired: "MANUAL REQUIRED"
        }
    }

    /// True for statuses that still require technician action.
    public var isPending: Bool {
        self == .notStarted || self == .running || self == .manualRequired
    }

    public var isComplete: Bool {
        !isPending
    }
}
