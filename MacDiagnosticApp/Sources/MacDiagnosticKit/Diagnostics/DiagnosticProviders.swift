import Foundation

/// Metadata every diagnostic module exposes for the UI and registry.
public struct DiagnosticMeta: Sendable, Equatable {
    public let kind: DiagnosticKind
    public let title: String
    public let whyItMatters: String
    public let isManual: Bool
    public let needsPermission: PermissionKind?

    public init(
        kind: DiagnosticKind,
        title: String,
        whyItMatters: String,
        isManual: Bool,
        needsPermission: PermissionKind? = nil
    ) {
        self.kind = kind
        self.title = title
        self.whyItMatters = whyItMatters
        self.isManual = isManual
        self.needsPermission = needsPermission
    }
}

/// TCC-style permission a module may require.
public enum PermissionKind: String, Sendable, Equatable {
    case camera
    case microphone
}

// MARK: - Automated provider

/// A diagnostic that runs entirely in software and returns a result.
public protocol AutomatedDiagnosticProvider: Sendable {
    var meta: DiagnosticMeta { get }
    func run() async -> DiagnosticResult
}

// MARK: - Manual provider

/// A diagnostic that needs technician action. The UI owns the screens and
/// calls back with a verdict; there is no single `run()`.
public protocol ManualDiagnosticProvider: Sendable {
    var meta: DiagnosticMeta { get }
}

// MARK: - Registry

public protocol DiagnosticProviding: Sendable {
    var automated: [AutomatedDiagnosticProvider] { get }
    var manual: [ManualDiagnosticProvider] { get }
    var all: [DiagnosticMeta] { get }
    func automated(for kind: DiagnosticKind) -> AutomatedDiagnosticProvider?
    func manual(for kind: DiagnosticKind) -> ManualDiagnosticProvider?
}

public struct DiagnosticRegistry: DiagnosticProviding {
    public let automated: [AutomatedDiagnosticProvider]
    public let manual: [ManualDiagnosticProvider]

    public init(
        automated: [AutomatedDiagnosticProvider],
        manual: [ManualDiagnosticProvider]
    ) {
        self.automated = automated
        self.manual = manual
    }

    public var all: [DiagnosticMeta] {
        var metas = automated.map(\.meta)
        metas.append(contentsOf: manual.map(\.meta))
        return metas.sorted { $0.kind.rawValue < $1.kind.rawValue }
    }

    public func automated(for kind: DiagnosticKind) -> AutomatedDiagnosticProvider? {
        automated.first(where: { $0.meta.kind == kind })
    }

    public func manual(for kind: DiagnosticKind) -> ManualDiagnosticProvider? {
        manual.first(where: { $0.meta.kind == kind })
    }
}