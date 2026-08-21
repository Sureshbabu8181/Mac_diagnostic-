import Foundation

/// A full diagnostic run on one device, as recorded for history/reports.
public struct DiagnosticSession: Codable, Identifiable, Sendable, Equatable {
    public let id: UUID
    public let device: DeviceInfo
    public var technicianName: String
    public let startedAt: Date
    public var endedAt: Date?
    public var appVersion: String
    public var results: [DiagnosticResult]
    public var overall: OverallResult

    public struct OverallResult: Codable, Sendable, Equatable {
        public enum Verdict: String, Codable, Sendable {
            case pass
            case passWithWarning
            case fail
            case manualRequired
            case inProgress
        }

        public let verdict: Verdict
        public let failedTests: [DiagnosticKind]
        public let warningTests: [DiagnosticKind]
        public let manualTests: [DiagnosticKind]

        public init(
            verdict: Verdict,
            failedTests: [DiagnosticKind] = [],
            warningTests: [DiagnosticKind] = [],
            manualTests: [DiagnosticKind] = []
        ) {
            self.verdict = verdict
            self.failedTests = failedTests
            self.warningTests = warningTests
            self.manualTests = manualTests
        }

        public var displayName: String {
            switch verdict {
            case .pass: "PASS"
            case .passWithWarning: "PASS WITH WARNING"
            case .fail: "FAIL"
            case .manualRequired: "MANUAL REQUIRED"
            case .inProgress: "IN PROGRESS"
            }
        }
    }

    public init(
        id: UUID = UUID(),
        device: DeviceInfo,
        technicianName: String,
        startedAt: Date = Date(),
        appVersion: String
    ) {
        self.id = id
        self.device = device
        self.technicianName = technicianName
        self.startedAt = startedAt
        self.appVersion = appVersion
        self.results = []
        self.overall = OverallResult(verdict: .inProgress)
    }

    public func result(for kind: DiagnosticKind) -> DiagnosticResult? {
        results.first(where: { $0.kind == kind })
    }

    /// Documented overall rule:
    /// - any FAIL            -> FAIL
    /// - any MANUAL_REQUIRED -> MANUAL REQUIRED (unless already FAIL)
    /// - any WARNING         -> PASS WITH WARNING
    /// - otherwise           -> PASS
    public static func computeOverall(from results: [DiagnosticResult]) -> OverallResult {
        let failures = results.filter { $0.status == .fail }.map(\.kind)
        let warnings = results.filter { $0.status == .warning }.map(\.kind)
        let manuals = results.filter { $0.status == .manualRequired }.map(\.kind)

        if !failures.isEmpty {
            return OverallResult(verdict: .fail, failedTests: failures, warningTests: warnings, manualTests: manuals)
        }
        if !manuals.isEmpty {
            return OverallResult(verdict: .manualRequired, failedTests: [], warningTests: warnings, manualTests: manuals)
        }
        if !warnings.isEmpty {
            return OverallResult(verdict: .passWithWarning, warningTests: warnings, manualTests: manuals)
        }
        return OverallResult(verdict: .pass, manualTests: manuals)
    }
}
