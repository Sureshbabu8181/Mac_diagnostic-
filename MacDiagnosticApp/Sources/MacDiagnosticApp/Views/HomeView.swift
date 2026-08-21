import SwiftUI
import MacDiagnosticKit

/// Home screen is the diagnostics page. "RUN ALL DIAGNOSTICS" runs automated
/// modules in place (results appear on the module cards), and manual modules
/// are completed inline below — no separate session page.
struct HomeView: View {
    @EnvironmentObject var appModel: AppModel
    @State private var technicianChooserPresented = false
    @EnvironmentObject var runner: HomeDiagnosticsRunner
    @State private var showReport = false

    private let columns = Array(repeating: GridItem(.fixed(150)), count: 4)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                deviceCard
                actionCard
                moduleGrid
                if runner.hasStarted {
                    runFooter
                }
            }
            .padding(24)
        }
        .navigationTitle("MAC DIAGNOSTIC CENTER")
        .sheet(isPresented: $technicianChooserPresented) {
            TechnicianPickerView(onSelect: { appModel.selectTechnician($0) })
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading) {
                Text("MAC DIAGNOSTIC CENTER")
                    .font(.largeTitle.bold())
                Text("Technician: \(appModel.technician?.name ?? "—")")
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if runner.hasStarted {
                VStack(alignment: .trailing) {
                    Text("Overall: \(runner.overall)").font(.headline)
                    if let session = runner.session {
                        let counts = StatusCounts(session: session)
                        Text("\(counts.pass) PASS · \(counts.warning) WARN · \(counts.fail) FAIL · \(counts.notTested) NOT TESTED")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Button(appModel.technician == nil ? "Select Technician" : appModel.technician!.name) {
                technicianChooserPresented = true
            }
            .buttonStyle(.bordered)
        }
    }

    private var deviceCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Device Information", systemImage: "macmini").font(.title3.bold())
            Grid(alignment: .leading, horizontalSpacing: 32, verticalSpacing: 6) {
                GridRow { info("Device Name", appModel.device.computerName); info("Host Name", appModel.device.hostName) }
                GridRow { info("Mac Model", appModel.device.modelName); info("Model ID", appModel.device.modelIdentifier) }
                GridRow { info("Serial Number", appModel.device.serialNumber); info("Chip", appModel.device.chip) }
                GridRow { info("macOS", appModel.device.osVersion); info("Memory", appModel.device.memoryGB) }
                GridRow { info("Storage", appModel.device.storageGB); info("Architecture", appModel.device.architecture) }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .textBackgroundColor)))
    }

    private func info(_ key: String, _ value: String) -> some View {
        VStack(alignment: .leading) {
            Text(key).font(.caption).foregroundStyle(.secondary)
            Text(value.isEmpty ? "NOT AVAILABLE" : value).font(.body.monospaced())
        }
    }

    private var actionCard: some View {
        HStack(spacing: 12) {
            Button {
                Task {
                    await runner.runAll(
                        device: appModel.device,
                        technician: appModel.technician?.name ?? "Technician",
                        appVersion: appModel.appVersion
                    )
                }
            } label: {
                Label(runner.isRunningAll ? "RUNNING DIAGNOSTICS…" : "RUN ALL DIAGNOSTICS",
                      systemImage: runner.isRunningAll ? "progress.indicator" : "play.fill")
                    .font(.headline)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
            }
            .buttonStyle(.borderedProminent)
            .disabled(appModel.technician == nil || runner.isRunningAll)

            if runner.isRunningAll {
                ProgressView().controlSize(.small)
            }

            NavigationLink(value: RootView.Route.history) {
                Label("Diagnostic History", systemImage: "clock")
            }
            .buttonStyle(.bordered)

            NavigationLink(value: RootView.Route.settings) {
                Label("Settings", systemImage: "gearshape")
            }
            .buttonStyle(.bordered)

            if appModel.technician == nil {
                Text("Select a technician to start a session.").foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(nsColor: .separatorColor), lineWidth: 0.5))
    }

    private var moduleGrid: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Diagnostic Modules — click to run a single test")
                .font(.title3.bold())
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(DiagnosticKind.allCases, id: \.self) { kind in
                    NavigationLink(value: RootView.Route.singleTest(kind)) {
                        ModuleCard(kind: kind, status: currentStatus(kind), result: runner.results[kind])
                    }
                    .buttonStyle(.plain)
                    .disabled(runner.runningKinds.contains(kind))
                }
            }
        }
    }

    private func currentStatus(_ kind: DiagnosticKind) -> DiagnosticStatus {
        if runner.runningKinds.contains(kind) { return .running }
        return runner.results[kind]?.status ?? .notStarted
    }

    // MARK: - Save / export

    private var runFooter: some View {
        VStack(spacing: 8) {
            if runner.isRunningAll {
                Text("Running automated diagnostics…").font(.callout).foregroundStyle(.secondary)
            } else {
                Text("All tests complete. Open the consolidated report or export it.").font(.callout).foregroundStyle(.green)
            }

            HStack {
                Button("View Consolidated Report") { showReport = true }
                    .buttonStyle(.borderedProminent)
                    .disabled(runner.isRunningAll)

                Button(runner.didSave ? "Saved ✓" : "Save to History") {
                    _ = runner.save(to: appModel.store)
                }
                .buttonStyle(.bordered)
                .disabled(runner.isRunningAll || runner.didSave)

                Button("Export PDF / JSON / CSV…") {
                    let panel = NSOpenPanel()
                    panel.canChooseDirectories = true
                    panel.canChooseFiles = false
                    guard panel.runModal() == .OK, let url = panel.url else { return }
                    runner.export(to: url, companyName: appModel.settings.companyName)
                }
                .buttonStyle(.bordered)
                .disabled(runner.isRunningAll)

                if let message = runner.lastSaveMessage {
                    Text(message).font(.caption).foregroundStyle(.red)
                } else if runner.didSave {
                    Text("Session saved to local history.").font(.caption).foregroundStyle(.green)
                } else if let export = runner.lastExport {
                    Text(export).font(.caption).foregroundStyle(.green)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .controlBackgroundColor)))
        .sheet(isPresented: $showReport) {
            ConsolidatedReportView(runner: runner, companyName: appModel.settings.companyName, store: appModel.store)
        }
    }
}

/// Consolidated report shown after all tests complete. Summarizes every module
/// and offers Save-to-History and PDF/JSON/CSV export.
struct ConsolidatedReportView: View {
    @ObservedObject var runner: HomeDiagnosticsRunner
    let companyName: String
    let store: DiagnosticStore?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Consolidated Report")
                    .font(.title.bold())
                Spacer()
                if let session = runner.session {
                    Text(session.overall.displayName)
                        .font(.headline)
                        .foregroundStyle(verdictColor(session.overall.verdict))
                }
                Button("Close") { dismiss() }.buttonStyle(.bordered)
            }

            if let session = runner.session {
                deviceInfoSection(session)

                let counts = StatusCounts(session: session)
                HStack(spacing: 20) {
                    countItem(counts.pass, "PASS", .green)
                    countItem(counts.warning, "WARNING", .orange)
                    countItem(counts.fail, "FAIL", .red)
                    countItem(counts.notTested, "NOT TESTED", .secondary)
                    countItem(counts.notAvailable, "NOT AVAILABLE", .gray)
                }
                .padding(.vertical, 4)

                Divider()

                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(DiagnosticKind.allCases, id: \.self) { kind in
                            if let result = session.result(for: kind) {
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack {
                                        Image(systemName: ModuleCard.icon(kind))
                                        Text(kind.displayName).font(.headline)
                                        Spacer()
                                        StatusBadge(status: result.status)
                                    }
                                    if !result.summary.isEmpty {
                                        Text(result.summary).font(.callout).foregroundStyle(.secondary)
                                    }
                                    ForEach(result.metrics, id: \.id) { metric in
                                        HStack {
                                            Text(metric.name).foregroundStyle(.secondary).frame(width: 200, alignment: .leading)
                                            Text(metric.value).font(.callout.monospaced())
                                            Spacer()
                                        }
                                    }
                                }
                                .padding(8)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(RoundedRectangle(cornerRadius: 8).fill(Color(nsColor: .controlBackgroundColor)))
                            }
                        }
                    }
                }

                HStack {
                    Button(runner.didSave ? "Saved ✓" : "Save to History") {
                        _ = runner.save(to: store)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(runner.didSave)

                    Button("Export PDF / JSON / CSV…") {
                        let panel = NSOpenPanel()
                        panel.canChooseDirectories = true
                        panel.canChooseFiles = false
                        guard panel.runModal() == .OK, let url = panel.url else { return }
                        runner.export(to: url, companyName: companyName)
                    }
                    .buttonStyle(.bordered)

                    if let message = runner.lastSaveMessage {
                        Text(message).font(.caption).foregroundStyle(.red)
                    }
                    if runner.didSave {
                        Text("Session saved to local history.").font(.caption).foregroundStyle(.green)
                    }
                    if let export = runner.lastExport {
                        Text(export).font(.caption).foregroundStyle(.green)
                    }
                }
            } else {
                Text("No session results available.").foregroundStyle(.secondary)
            }
        }
        .padding(20)
        .frame(width: 760, height: 640)
    }

    private func deviceInfoSection(_ session: DiagnosticSession) -> some View {
        let device = session.device
        return VStack(alignment: .leading, spacing: 6) {
            Label("Device & Technician", systemImage: "macmini.and.cursorarrow")
                .font(.headline)
            Grid(alignment: .leading, horizontalSpacing: 32, verticalSpacing: 4) {
                GridRow { reportItem("Technician", session.technicianName) ; reportItem("Date", session.startedAt.formatted(date: .numeric, time: .shortened)) }
                GridRow { reportItem("Device Name", device.computerName); reportItem("Host Name", device.hostName) }
                GridRow { reportItem("Model", device.modelName); reportItem("Model ID", device.modelIdentifier) }
                GridRow { reportItem("Serial", device.serialNumber); reportItem("macOS", device.osVersion) }
                GridRow { reportItem("Chip", device.chip); reportItem("Memory", device.memoryGB) }
                GridRow { reportItem("Storage", device.storageGB); reportItem("Architecture", device.architecture) }
            }
            .font(.callout)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color(nsColor: .controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(nsColor: .separatorColor), lineWidth: 0.5))
    }

    private func reportItem(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value.isEmpty ? "NOT AVAILABLE" : value).font(.body.monospaced())
        }
    }

    private func countItem(_ count: Int, _ label: String, _ color: Color) -> some View {
        VStack {
            Text("\(count)").font(.title2.bold()).foregroundStyle(color)
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
    }

    private func verdictColor(_ verdict: DiagnosticSession.OverallResult.Verdict) -> Color {
        switch verdict {
        case .pass: .green
        case .passWithWarning: .orange
        case .fail: .red
        case .manualRequired: .blue
        case .inProgress: .secondary
        }
    }
}

/// Runs diagnostics and keeps results on the home screen.
@MainActor
final class HomeDiagnosticsRunner: ObservableObject, @unchecked Sendable {
    @Published private(set) var results: [DiagnosticKind: DiagnosticResult] = [:]
    @Published private(set) var runningKinds: Set<DiagnosticKind> = []
    @Published private(set) var isRunningAll = false
    @Published private(set) var hasStarted = false
    @Published private(set) var didSave = false
    @Published private(set) var lastSaveMessage: String?
    @Published private(set) var lastExport: String?

    private var engine: DiagnosticEngine?
    private var store: DiagnosticStore?
    private var pendingDevice = DeviceInfo()
    private var pendingTechnician = "Technician"
    private var pendingAppVersion = AppMetadata.version

    var session: DiagnosticSession? { engine?.session }

    var overall: String { engine?.session.overall.displayName ?? "NOT STARTED" }

    /// Stores the app's device/technician/history context used for both the
    /// run-all engine and any manual results adopted from dedicated test pages.
    func bind(store: DiagnosticStore?, device: DeviceInfo, technician: String, appVersion: String) {
        self.store = store
        pendingDevice = device
        pendingTechnician = technician
        pendingAppVersion = appVersion
    }

    private func ensureEngine() {
        guard engine == nil else { return }
        let engine = DiagnosticEngine(registry: DefaultRegistry.make(), device: pendingDevice,
                                      technician: pendingTechnician, appVersion: pendingAppVersion)
        self.engine = engine
    }

    func runAll(device: DeviceInfo, technician: String, appVersion: String) async {
        guard !isRunningAll else { return }
        let engine = DiagnosticEngine(registry: DefaultRegistry.make(), device: device,
                                      technician: technician, appVersion: appVersion)
        self.engine = engine
        isRunningAll = true
        hasStarted = true
        didSave = false
        lastSaveMessage = nil
        lastExport = nil
        results = [:]
        defer { isRunningAll = false }

        for kind in DiagnosticKind.allCases where !kind.isManual {
            runningKinds.insert(kind)
            await engine.runAutomated(kind)
            results[kind] = engine.session.result(for: kind)
            runningKinds.remove(kind)
        }
        for kind in DiagnosticKind.allCases where kind.isManual {
            engine.insertManualPlaceholder(kind)
            results[kind] = engine.session.result(for: kind)
        }
    }

    func runSingle(_ kind: DiagnosticKind, device: DeviceInfo, technician: String, appVersion: String) async {
        guard !kind.isManual else { return }
        guard let provider = DefaultRegistry.make().automated(for: kind) else { return }
        runningKinds.insert(kind)
        let result = await provider.run()
        results[kind] = result
        runningKinds.remove(kind)
    }

    /// Merges a manual verdict recorded on the dedicated single-test screen
    /// (old flow) back into the consolidated home session so the report shows
    /// PASS/FAIL instead of NOT TESTED — and auto-saves to local history.
    func adoptResult(_ result: DiagnosticResult) {
        guard result.kind.isManual else { return }
        ensureEngine()
        guard let engine, result.kind.isManual else { return }
        engine.adopt(manualResult: result)
        results[result.kind] = engine.session.result(for: result.kind)
        hasStarted = true
        save(to: store)
    }

    @discardableResult
    func save(to store: DiagnosticStore?) -> Bool {
        guard let session else { lastSaveMessage = "No session to save."; return false }
        guard let store else { lastSaveMessage = "No local store available; session was not saved."; return false }
        do {
            try store.save(session)
            didSave = true
            lastSaveMessage = nil
            return true
        } catch {
            lastSaveMessage = "Failed to save session: \(error.localizedDescription)"
            return false
        }
    }

    func export(to directory: URL, companyName: String) {
        guard let session else { lastExport = "No session to export."; return }
        do {
            let written = try ReportExporter().export(session, to: directory,
                                                      formats: [.pdf, .json, .csv],
                                                      companyName: companyName)
            lastExport = "Exported \(written.count) file(s) to \(directory.path)"
        } catch {
            lastExport = error.localizedDescription
        }
    }
}

struct ModuleCard: View {
    let kind: DiagnosticKind
    let status: DiagnosticStatus
    let result: DiagnosticResult?

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: Self.icon(kind)).font(.title2)
            Text(kind.displayName).font(.headline)
            StatusBadge(status: status)
            if status == .running {
                ProgressView().progressViewStyle(.circular).controlSize(.small)
            } else if let result, !result.summary.isEmpty {
                Text(result.summary)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                if let top = result.metrics.first {
                    HStack(spacing: 4) {
                        Text(top.name).font(.caption2).foregroundStyle(.secondary)
                        Text(top.value).font(.caption2.monospaced()).lineLimit(1)
                    }
                }
            }
        }
        .frame(width: 140)
        .frame(minHeight: 92)
        .padding(.vertical, 6)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color(nsColor: .controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(nsColor: .separatorColor), lineWidth: 0.5))
    }

    private func icon(_ kind: DiagnosticKind) -> String {
        Self.icon(kind)
    }

    static func icon(_ kind: DiagnosticKind) -> String {
        switch kind {
        case .battery: "battery.100"
        case .display: "display"
        case .keyboard: "keyboard"
        case .trackpad: "trackpad"
        case .speakers: "speaker.wave.2"
        case .microphone: "mic"
        case .camera: "camera"
        case .ports: "cable.connector"
        case .storage: "internaldrive"
        case .memory: "memorychip"
        case .network: "network"
        case .system: "gear"
        }
    }
}

struct StatusBadge: View {
    let status: DiagnosticStatus
    var body: some View {
        Text(status.displayName)
            .font(.caption.bold())
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.12), in: Capsule())
    }

    private var color: Color {
        switch status {
        case .pass: .green
        case .warning: .orange
        case .fail: .red
        case .running, .notStarted: .secondary
        case .notAvailable: .gray
        case .skipped: .secondary
        case .manualRequired: .blue
        }
    }
}
