import Foundation

/// A single measured field inside a diagnostic result (e.g. "Cycle Count" -> "552").
public struct DiagnosticMetric: Codable, Identifiable, Sendable, Equatable {
    public let name: String
    public let value: String

    public init(name: String, value: String) {
        self.name = name
        self.value = value
    }

    public var id: String { "\(name)|\(value)" }
}

/// Outcome of one diagnostic module.
public struct DiagnosticResult: Codable, Identifiable, Sendable, Equatable {
    public let id: UUID
    public let kind: DiagnosticKind
    public var status: DiagnosticStatus
    public var summary: String
    public var metrics: [DiagnosticMetric]
    public var technicianNotes: String
    public let timestamp: Date

    public init(
        id: UUID = UUID(),
        kind: DiagnosticKind,
        status: DiagnosticStatus = .notStarted,
        summary: String = "",
        metrics: [DiagnosticMetric] = [],
        technicianNotes: String = "",
        timestamp: Date = Date()
    ) {
        self.id = id
        self.kind = kind
        self.status = status
        self.summary = summary
        self.metrics = metrics
        self.technicianNotes = technicianNotes
        self.timestamp = timestamp
    }

    public func metric(_ name: String) -> String? {
        metrics.first(where: { $0.name == name })?.value
    }
}
