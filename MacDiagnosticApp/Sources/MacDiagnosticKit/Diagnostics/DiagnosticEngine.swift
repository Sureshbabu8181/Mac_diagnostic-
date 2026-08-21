import Foundation

/// Orchestrates a diagnostic run. Runs automated modules sequentially,
/// time-stamps everything, and exposes manual-required placeholders for the
/// technician phases. Fully local and stateless except for the supplied
/// provider list.
@MainActor
public final class DiagnosticEngine: ObservableObject, @unchecked Sendable {
    public private(set) var session: DiagnosticSession
    private let registry: any DiagnosticProviding
    private(set) var manualQueue: [DiagnosticKind] = []
    public private(set) var currentManualKind: DiagnosticKind?

    public init(registry: any DiagnosticProviding, device: DeviceInfo, technician: String, appVersion: String) {
        self.registry = registry
        self.session = DiagnosticSession(device: device, technicianName: technician, appVersion: appVersion)
    }

    // MARK: - Automated run

    /// Runs every automated module in the registry, inserting manual tests as
    /// `.manualRequired` placeholders in the defined workflow order.
    public func runAutomated() async {
        let ordered = DiagnosticKind.allCases

        for kind in ordered {
            if kind.isManual {
                if let provider = registry.manual(for: kind) {
                    insertManualPlaceholder(provider: provider)
                }
                continue
            }
            await runAutomated(kind)
        }
        recomputeOverall()
    }

    public func runAutomated(_ kind: DiagnosticKind) async {
        guard let provider = registry.automated(for: kind) else { return }
        upsert(result: DiagnosticResult(kind: kind, status: .running, summary: "Running…"))
        let result = await provider.run()
        upsert(result: result)
        recomputeOverall()
    }

    private func insertManualPlaceholder(provider: any ManualDiagnosticProvider) {
        manualQueue.append(provider.meta.kind)
        upsert(result: DiagnosticResult(
            kind: provider.meta.kind,
            status: .manualRequired,
            summary: "Manual technician test required."
        ))
        recomputeOverall()
    }

    /// Records a manual test as pending (NOT TESTED) so it appears in results
    /// before the technician runs it. Safe to call more than once.
    public func insertManualPlaceholder(_ kind: DiagnosticKind) {
        guard !manualQueue.contains(kind) else { return }
        manualQueue.append(kind)
        upsert(result: DiagnosticResult(
            kind: kind,
            status: .manualRequired,
            summary: "Manual technician test required."
        ))
        recomputeOverall()
    }

    // MARK: - Manual verdicts

    /// Manual tests not yet completed, in workflow order. Read-only peek — does
    /// not consume the queue (use `nextManualKind()` to consume).
    public var remainingManualKinds: [DiagnosticKind] { manualQueue }

    public func nextManualKind() -> DiagnosticKind? {
        guard !manualQueue.isEmpty else { return nil }
        currentManualKind = manualQueue.removeFirst()
        return currentManualKind
    }

    public func finishManual(_ kind: DiagnosticKind, status: DiagnosticStatus, summary: String, notes: String = "") {
        let metrics = existingMetrics(for: kind)
        let id = session.result(for: kind)?.id ?? UUID()
        upsert(result: DiagnosticResult(
            id: id,
            kind: kind,
            status: status,
            summary: summary,
            metrics: metrics,
            technicianNotes: notes
        ))
        recomputeOverall()
    }

    /// Merges a completed manual verdict (e.g. produced on a dedicated
    /// single-test screen) back into this session's result set.
    public func adopt(manualResult result: DiagnosticResult) {
        guard result.kind.isManual else { return }
        upsert(result: result)
        recomputeOverall()
    }

    private func existingMetrics(for kind: DiagnosticKind) -> [DiagnosticMetric] {
        session.result(for: kind)?.metrics ?? []
    }

    public func addNotes(_ notes: String, for kind: DiagnosticKind) {
        guard var result = session.result(for: kind) else { return }
        result.technicianNotes = notes
        upsert(result: result)
    }

    // MARK: - Lifecycle

    public func finishSession() {
        session.endedAt = Date()
        recomputeOverall()
    }

    private func recomputeOverall() {
        session.overall = DiagnosticSession.computeOverall(from: session.results)
    }

    private func upsert(result: DiagnosticResult) {
        if let idx = session.results.firstIndex(where: { $0.kind == result.kind }) {
            session.results[idx] = result
        } else {
            session.results.append(result)
        }
    }
}