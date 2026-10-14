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
    @Published private(set) var lastSendStatus: String?

    /// Snapshot of opt-in report-delivery settings, copied from AppModel when
    /// the flow binds so sending never races settings changes.
    struct ReportDelivery {
        var emailRecipient: String
        var sheetWebhookURL: String
        var autoSendToSheet: Bool
        var companyName: String
    }
    var reportDelivery: ReportDelivery?

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

    /// Records an automated diagnostic result (e.g. from Stress Test or Monitor)
    /// into the session without going through the standard runAutomated flow.
    func recordAutomatedResult(_ result: DiagnosticResult) {
        engine.adoptAutomated(result)
        didSave = false
        lastSaveMessage = nil
        _ = finish()
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
            autoSendToSheetIfConfigured()
            return true
        } catch {
            lastSaveMessage = "Failed to save session: \(error.localizedDescription)"
            return false
        }
    }

    // MARK: - Report delivery (email / Google Sheet)

    /// Opens the default mail client with the report prefilled (mailto:).
    func emailReport() async {
        let delivery = reportDelivery
        let opened = await ReportSender.openEmailComposer(
            recipient: delivery?.emailRecipient ?? "",
            session: engine.session,
            companyName: delivery?.companyName ?? ""
        )
        lastSendStatus = opened
            ? "Email composer opened — review and send."
            : "Could not open a mail client. Set a default Mail app in System Settings."
    }

    /// POSTs the session payload to the configured Google Sheet webhook.
    func sendToSheet() async {
        guard let delivery = reportDelivery,
              let url = URL(string: delivery.sheetWebhookURL),
              ReportSender.isValidSheetWebhook(url)
        else {
            lastSendStatus = "Set the Google Sheet webhook URL in Settings first."
            return
        }
        lastSendStatus = "Sending to Google Sheet…"
        do {
            try await ReportSender.sendToSheet(engine.session, webhookURL: url, companyName: delivery.companyName)
            lastSendStatus = "Sent to Google Sheet ✓"
        } catch {
            lastSendStatus = error.localizedDescription
        }
    }

    /// Fires automatically after a successful save when the technician enabled
    /// auto-send and configured a webhook in Settings.
    private func autoSendToSheetIfConfigured() {
        guard let delivery = reportDelivery, delivery.autoSendToSheet,
              let url = URL(string: delivery.sheetWebhookURL),
              ReportSender.isValidSheetWebhook(url)
        else { return }
        let session = engine.session
        let company = delivery.companyName
        Task { @MainActor in
            do {
                try await ReportSender.sendToSheet(session, webhookURL: url, companyName: company)
                lastSendStatus = "Auto-sent to Google Sheet ✓"
                AppLogger.shared.info("Auto-sent finished session report to Google Sheet")
            } catch {
                lastSendStatus = "Auto-send failed: \(error.localizedDescription)"
                AppLogger.shared.error("Auto-send to Google Sheet failed: \(error.localizedDescription)")
            }
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