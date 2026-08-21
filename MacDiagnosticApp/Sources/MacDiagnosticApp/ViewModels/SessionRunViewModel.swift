import SwiftUI
import Combine
import MacDiagnosticKit

@MainActor
final class SessionRunViewModel: ObservableObject, @unchecked Sendable {
    enum Phase: Equatable {
        case preparing
        /// Run-all: automated run + inline manual completion all on one screen.
        case running
        /// Single automated test: brief in-progress screen.
        case automatedRunning
        /// Single manual test: full-screen guided test.
        case manual(kind: DiagnosticKind)
        case finished
    }

    @Published var phase: Phase = .preparing
    @Published var currentNotes = ""
    @Published var sortExports: [URL] = []
    @Published private(set) var lastSaveMessage: String?
    @Published private(set) var didSave = false

    private(set) var engine: DiagnosticEngine
    private(set) var store: DiagnosticStore?

    private var engineSink: AnyCancellable?

    init(engine: DiagnosticEngine, store: DiagnosticStore?) {
        self.engine = engine
        self.store = store
        // Forward engine publications (live result updates during the run) so
        // the unified dashboard refreshes as diagnostics complete.
        engineSink = engine.objectWillChange.sink { [weak self] _ in
            self?.objectWillChange.send()
        }
    }

    /// Replaces the placeholder engine/store with real instances once the app
    /// model has loaded device + technician + history store.
    func bind(engine realEngine: DiagnosticEngine, store realStore: DiagnosticStore?) {
        engine = realEngine
        store = realStore
        engineSink = realEngine.objectWillChange.sink { [weak self] _ in
            self?.objectWillChange.send()
        }
    }

    var remainingManual: [DiagnosticKind] { engine.remainingManualKinds }

    func start() async {
        phase = .running
        await engine.runAutomated()
        // Session stays in `.running`; manual tests are completed inline below
        // the automated results and verdicts are recorded in place.
    }

    /// Records a manual verdict from the inline dashboard.
    func recordManualVerdict(kind: DiagnosticKind, status: DiagnosticStatus, notes: String = "") {
        engine.finishManual(kind, status: status, summary: summaryFor(kind), notes: notes)
    }

    /// Runs exactly one diagnostic (individual test). Manual kinds go straight
    /// to their screen; automated kinds run and land on the result.
    func startSingle(_ kind: DiagnosticKind) async {
        if kind.isManual {
            currentNotes = ""
            phase = .manual(kind: kind)
        } else {
            phase = .automatedRunning
            await engine.runAutomated(kind)
            phase = .finished
        }
    }

    func advanceManual(status: DiagnosticStatus) {
        guard case let .manual(kind) = phase else { return }
        engine.finishManual(kind, status: status, summary: summaryFor(kind), notes: currentNotes)
        currentNotes = ""
        if let next = engine.nextManualKind() {
            phase = .manual(kind: next)
        } else {
            phase = .finished
        }
    }

    func skipManual() {
        advanceManual(status: .skipped)
    }

    /// Records a technician battery verdict (with the visually-confirmed
    /// battery condition) on the single battery test page, preserving the
    /// automated metrics and summary.
    func recordBatteryVerdict(status: DiagnosticStatus, condition: String, notes: String) {
        let existing = engine.session.result(for: .battery)?.summary ?? ""
        let summary = existing.isEmpty
            ? "Battery Condition: \(condition)."
            : "\(existing) Battery Condition: \(condition)."
        engine.finishManual(.battery, status: status, summary: summary, notes: notes)
    }

    @discardableResult
    func finish() -> Bool {
        engine.finishSession()
        guard let store else {
            lastSaveMessage = "No local store available; session was not saved."
            return false
        }
        do {
            try store.save(engine.session)
            didSave = true
            lastSaveMessage = nil
            return true
        } catch {
            lastSaveMessage = "Failed to save session: \(error.localizedDescription)"
            return false
        }
    }

    func exportReport(to directory: URL, formats: Set<ReportFormat>, companyName: String = "") async {
        let builder = ReportExporter()
        do {
            sortExports = try builder.export(engine.session, to: directory, formats: formats, companyName: companyName)
        } catch {
            AppLogger.shared.error("Export failed: \(error.localizedDescription)")
        }
    }

    private func summaryFor(_ kind: DiagnosticKind) -> String {
        kind.displayName + " — technician verdict recorded."
    }
}