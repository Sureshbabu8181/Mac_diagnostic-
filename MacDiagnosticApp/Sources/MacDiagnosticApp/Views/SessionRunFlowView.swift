import SwiftUI
import MacDiagnosticKit

/// Orchestrates one full session: automated run, then guided manual tests,
/// then overall result + export.
struct SessionRunFlowView: View {
    @EnvironmentObject var appModel: AppModel
    @StateObject private var vm: SessionRunViewModel
    @State private var didStart = false
    private let singleKind: DiagnosticKind?
    private let onManualFinished: ((DiagnosticResult) -> Void)?

    init(singleKind: DiagnosticKind? = nil, onManualFinished: ((DiagnosticResult) -> Void)? = nil) {
        self.singleKind = singleKind
        self.onManualFinished = onManualFinished
        let engine = DiagnosticEngine(
            registry: DefaultRegistry.make(),
            device: DeviceInfo(),
            technician: "Technician",
            appVersion: AppMetadata.version
        )
        _vm = StateObject(wrappedValue: SessionRunViewModel(engine: engine, store: nil))
    }

    var body: some View {
        Group {
            switch vm.phase {
            case .preparing:
                ProgressView(singleKind == nil ? "Preparing session…" : "Preparing \(singleKind?.displayName ?? "") test…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .running:
                UnifiedSessionView(vm: vm)
            case .automatedRunning:
                AutomatedRunView(vm: vm)
            case .manual(let kind):
                manualView(for: kind)
            case .finished:
                SessionResultView(vm: vm, singleKind: singleKind)
            }
        }
        .navigationTitle(singleKind == nil ? "Diagnostic Session" : singleKind!.displayName)
        .onChange(of: vm.phase) { _, newPhase in
            if newPhase == .finished, let kind = singleKind, kind.isManual,
               let result = vm.engine.session.result(for: kind) {
                onManualFinished?(result)
            }
        }
        .onAppear {
            guard !didStart else { return }
            didStart = true
            if let engine = appModel.makeEngine() {
                vm.bind(engine: engine, store: appModel.store)
            }
            Task {
                if let singleKind {
                    await vm.startSingle(singleKind)
                } else {
                    await vm.start()
                }
            }
        }
    }

    @ViewBuilder
    private func manualView(for kind: DiagnosticKind) -> some View {
        switch kind {
        case .display: DisplayTestView(vm: vm)
        case .keyboard: KeyboardTestView(vm: vm)
        case .trackpad: TrackpadTestView(vm: vm)
        case .speakers: SpeakerTestView(vm: vm)
        case .microphone: MicrophoneTestView(vm: vm)
        case .camera: CameraTestView(vm: vm)
        default: Text("No manual test defined for \(kind.displayName)")
        }
    }
}

extension AppModel {
    func makeEngine() -> DiagnosticEngine? {
        DiagnosticEngine(registry: DefaultRegistry.make(), device: device, technician: technician?.name ?? "Technician", appVersion: appVersion)
    }
}

// MARK: - Automated run status

struct AutomatedRunView: View {
    @ObservedObject var vm: SessionRunViewModel

    var body: some View {
        VStack(spacing: 16) {
            Text("Running automated diagnostics…")
                .font(.title2.bold())
            ProgressView().controlSize(.large)
            ForEach(DiagnosticKind.allCases.filter { !$0.isManual }, id: \.self) { kind in
                if let result = vm.engine.session.result(for: kind) {
                    HStack {
                        Text(kind.displayName)
                        Spacer()
                        StatusBadge(status: result.status)
                    }
                    .font(.callout)
                }
            }
            .frame(maxWidth: 420)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct StatusCounts {
    let pass: Int
    let warning: Int
    let fail: Int
    let notTested: Int
    let notAvailable: Int

    init(session: DiagnosticSession) {
        var pass = 0, warning = 0, fail = 0, notTested = 0, notAvailable = 0
        for result in session.results {
            switch result.status {
            case .pass: pass += 1
            case .warning: warning += 1
            case .fail: fail += 1
            case .notAvailable: notAvailable += 1
            default: notTested += 1
            }
        }
        self.pass = pass
        self.warning = warning
        self.fail = fail
        self.notTested = notTested
        self.notAvailable = notAvailable
    }
}

// MARK: - Result + export

struct SessionResultView: View {
    @ObservedObject var vm: SessionRunViewModel
    @EnvironmentObject var appModel: AppModel
    var singleKind: DiagnosticKind? = nil

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(singleKind == nil ? "Overall Result" : "Test Result")
                    .font(.title.bold())
                Text(vm.engine.session.overall.displayName)
                    .font(.system(size: 28, weight: .heavy))
                    .foregroundStyle(verdictColor)

                if singleKind == nil {
                    summaryStrip
                }

                if singleKind == .battery {
                    BatteryVerdictPanel(vm: vm)
                }

                Divider()

                let kinds = singleKind.map { [$0] } ?? DiagnosticKind.allCases
                ForEach(kinds, id: \.self) { kind in
                    if let result = vm.engine.session.result(for: kind) {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(kind.displayName).font(.headline)
                                Spacer()
                                StatusBadge(status: result.status)
                            }
                            if !result.summary.isEmpty {
                                Text(result.summary).font(.callout).foregroundStyle(.secondary)
                            }
                            if !result.technicianNotes.isEmpty {
                                Text("Notes: \(result.technicianNotes)").font(.caption)
                            }
                            ForEach(result.metrics, id: \.id) { metric in
                                HStack {
                                    Text(metric.name).foregroundStyle(.secondary).frame(width: 180, alignment: .leading)
                                    Text(metric.value)
                                    Spacer()
                                }
                                .font(.callout)
                            }
                        }
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color(nsColor: .controlBackgroundColor)))
                    }
                }

                HStack {
                    if singleKind?.isManual == true {
                        Text("Auto-saved to history ✓")
                            .font(.callout)
                            .foregroundStyle(.green)
                    } else {
                        Button(vm.didSave ? "Saved ✓" : "Save to History") {
                            _ = vm.finish()
                        }
                        .testActionButton()
                        .disabled(vm.didSave)
                    }

                    Button("Export PDF / JSON / CSV…") {
                        let panel = NSOpenPanel()
                        panel.canChooseDirectories = true
                        panel.canChooseFiles = false
                        guard panel.runModal() == .OK, let url = panel.url else { return }
                        Task { await vm.exportReport(to: url, formats: [.pdf, .json, .csv], companyName: appModel.settings.companyName) }
                    }
                    .buttonStyle(.bordered)

                    if let message = vm.lastSaveMessage {
                        Text(message).font(.caption).foregroundStyle(.red)
                    } else if vm.didSave {
                        Text("Session saved to local history.").font(.caption).foregroundStyle(.green)
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: 720, alignment: .leading)
        }
    }

    private var summaryStrip: some View {
        HStack(spacing: 24) {
            let counts = StatusCounts(session: vm.engine.session)
            summaryItem(count: counts.pass, label: "PASS", color: .green)
            summaryItem(count: counts.warning, label: "WARNING", color: .orange)
            summaryItem(count: counts.fail, label: "FAIL", color: .red)
            summaryItem(count: counts.notTested, label: "NOT TESTED", color: .secondary)
            summaryItem(count: counts.notAvailable, label: "NOT AVAILABLE", color: .gray)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .center)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .controlBackgroundColor)))
    }

    private func summaryItem(count: Int, label: String, color: Color) -> some View {
        VStack {
            Text("\(count)").font(.title2.bold()).foregroundStyle(color)
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
    }

    private var verdictColor: Color {
        switch vm.engine.session.overall.verdict {
        case .pass: .green
        case .passWithWarning: .orange
        case .fail: .red
        case .manualRequired: .blue
        case .inProgress: .secondary
        }
    }
}

// MARK: - Shared manual test chrome

/// Technician confirmation panel on the single Battery test page: choose the
/// Battery Condition exactly as shown in System Settings (Normal / Service
/// recommended), add notes, then record a verdict. The verdict and condition
/// are stored into the session result.
struct BatteryVerdictPanel: View {
    @ObservedObject var vm: SessionRunViewModel
    @State private var condition = "Normal"
    @State private var notes = ""
    @State private var recorded: DiagnosticStatus?

    private static let conditions = ["Normal", "Service recommended", "Replace soon", "Replace now"]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Battery Condition (as shown in System Settings → Battery)")
                .font(.headline)

            if let status = recorded {
                HStack {
                    Text("Recorded: ").foregroundStyle(.secondary)
                    StatusBadge(status: status)
                    Text("— Condition: \(condition)")
                        .foregroundStyle(.secondary)
                }
                .font(.callout)
            } else {
                Picker("Battery Condition", selection: $condition) {
                    ForEach(Self.conditions, id: \.self) { Text($0) }
                }
                .labelsHidden()

                HStack(alignment: .top) {
                    VStack(alignment: .leading) {
                        Text("Technician Notes")
                        TextEditor(text: $notes)
                            .frame(height: 48)
                            .scrollContentBackground(.hidden)
                            .background(RoundedRectangle(cornerRadius: 6).fill(Color(nsColor: .textBackgroundColor)))
                    }
                    .frame(width: 280)

                    Spacer()

                    HStack(spacing: 8) {
                        Button("PASS") { record(.pass) }
                            .tint(.green).testActionButton()
                        Button("FAIL") { record(.fail) }
                            .tint(.red).testActionButton()
                        Button("SKIP") { record(.skipped) }
                            .buttonStyle(.bordered)
                    }
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color(nsColor: .controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.accentColor, lineWidth: 1.5))
        .onAppear {
            if let metric = vm.engine.session.result(for: .battery)?.metrics.first(where: { $0.name == "macOS Condition" })?.value,
               Self.conditions.contains(metric) {
                condition = metric
            }
        }
    }

    private func record(_ status: DiagnosticStatus) {
        vm.recordBatteryVerdict(status: status, condition: condition, notes: notes)
        recorded = status
    }
}

// MARK: - Shared manual test chrome

struct ManualTestContainer<Content: View>: View {
    let title: String
    let whyItMatters: String
    let kind: DiagnosticKind
    @ObservedObject var vm: SessionRunViewModel
    @ViewBuilder var content: Content
    @State private var notes = ""

    var body: some View {
        VStack(spacing: 12) {
            Text(title)
                .font(.largeTitle.bold())
            Text(whyItMatters)
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Divider()

            content

            Divider()

            HStack(alignment: .top) {
                VStack(alignment: .leading) {
                    Text("Technician Notes")
                    TextEditor(text: $notes)
                        .frame(height: 52)
                        .scrollContentBackground(.hidden)
                        .background(RoundedRectangle(cornerRadius: 6).fill(Color(nsColor: .textBackgroundColor)))
                }
                .frame(width: 280)

                Spacer()

                VStack(spacing: 8) {
                    HStack {
                        Button("PASS") { vm.advanceManual(status: .pass) }
                            .tint(.green).testActionButton()
                        Button("FAIL") { vm.advanceManual(status: .fail) }
                            .tint(.red).testActionButton()
                        Button("SKIP") { vm.skipManual() }
                            .buttonStyle(.bordered)
                    }
                    Text("Next: \(kind.displayName) test")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(20)
        .onChange(of: notes) { _, newValue in
            vm.currentNotes = newValue
        }
    }
}