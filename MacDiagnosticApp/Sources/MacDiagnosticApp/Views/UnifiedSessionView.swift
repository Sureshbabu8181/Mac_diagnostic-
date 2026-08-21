import SwiftUI
import MacDiagnosticKit

/// Single "Run All Diagnostics" screen. Shows every automated module's live
/// PASS / WARNING / FAIL / NOT AVAILABLE result below the header, and the
/// manual modules (camera, sound, microphone, keyboard, display, trackpad)
/// below that — each completed inline without leaving the page.
struct UnifiedSessionView: View {
    @ObservedObject var vm: SessionRunViewModel
    @State private var expanded: DiagnosticKind?

    private var automatedKinds: [DiagnosticKind] { DiagnosticKind.allCases.filter { !$0.isManual } }
    private var manualKinds: [DiagnosticKind] { DiagnosticKind.allCases.filter(\.isManual) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header

                Text("Automated Results")
                    .font(.title2.bold())
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    ForEach(automatedKinds, id: \.self) { kind in
                        autoCard(for: kind)
                    }
                }
                .frame(maxWidth: .infinity)

                if !manualKinds.isEmpty {
                    Text("Manual Tests — complete below")
                        .font(.title2.bold())
                    ForEach(manualKinds, id: \.self) { kind in
                        manualCard(for: kind)
                    }
                }

                footer
            }
            .padding(24)
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Diagnostics")
                    .font(.largeTitle.bold())
                Text("Overall: \(vm.engine.session.overall.displayName)")
                    .font(.title3.bold())
                    .foregroundStyle(overallColor)
            }
            Spacer()
            let counts = StatusCounts(session: vm.engine.session)
            HStack(spacing: 18) {
                headerItem(count: counts.pass, label: "PASS", color: .green)
                headerItem(count: counts.warning, label: "WARNING", color: .orange)
                headerItem(count: counts.fail, label: "FAIL", color: .red)
                headerItem(count: counts.notTested, label: "NOT TESTED", color: .secondary)
                headerItem(count: counts.notAvailable, label: "N/A", color: .gray)
            }
            .padding()
            .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .controlBackgroundColor)))
        }
    }

    private func headerItem(count: Int, label: String, color: Color) -> some View {
        VStack {
            Text("\(count)").font(.title2.bold()).foregroundStyle(color)
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
    }

    private var overallColor: Color {
        switch vm.engine.session.overall.verdict {
        case .pass: .green
        case .passWithWarning: .orange
        case .fail: .red
        case .manualRequired: .blue
        case .inProgress: .secondary
        }
    }

    // MARK: - Automated card

    private func autoCard(for kind: DiagnosticKind) -> some View {
        let result = vm.engine.session.result(for: kind)
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: ModuleCard.icon(kind)).foregroundStyle(.secondary)
                Text(kind.displayName).font(.headline).lineLimit(1)
                Spacer()
                StatusBadge(status: result?.status ?? .notStarted)
            }
            if let result, !result.summary.isEmpty, !result.status.isPending {
                Text(result.summary).font(.caption).foregroundStyle(.secondary).lineLimit(3)
            }
            if result?.status == .running {
                ProgressView().progressViewStyle(.circular).controlSize(.small)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color(nsColor: .textBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(nsColor: .separatorColor), lineWidth: 0.5))
    }

    // MARK: - Manual card

    private func manualCard(for kind: DiagnosticKind) -> some View {
        @State var notes = ""
        let result = vm.engine.session.result(for: kind)
        let isExpanded = expanded == kind
        let done = result?.status.isComplete ?? false

        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: ModuleCard.icon(kind)).foregroundStyle(.secondary)
                Text(kind.displayName).font(.headline)
                if done { Text(result?.status.displayName ?? "").font(.caption.bold()).foregroundStyle(.green) }
                Spacer()
                Button(isExpanded ? "Close" : "Start Test") {
                    withAnimation { expanded = isExpanded ? nil : kind }
                }
                .buttonStyle(.bordered)
            }

            if isExpanded {
                Divider()
                inlineTest(for: kind)

                HStack(alignment: .top) {
                    TextEditor(text: $notes)
                        .frame(height: 44)
                        .scrollContentBackground(.hidden)
                        .background(RoundedRectangle(cornerRadius: 6).fill(Color(nsColor: .textBackgroundColor)))
                    HStack(spacing: 10) {
                        Button("PASS") { record(kind, status: .pass, notes: notes) }
                            .tint(.green).testActionButton()
                        Button("FAIL") { record(kind, status: .fail, notes: notes) }
                            .tint(.red).testActionButton()
                        Button("SKIP") { record(kind, status: .skipped, notes: notes) }
                            .buttonStyle(.bordered)
                    }
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color(nsColor: .controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(isExpanded ? Color.accentColor : Color(nsColor: .separatorColor),
                                                            lineWidth: isExpanded ? 1.5 : 0.5))
    }

    private func record(_ kind: DiagnosticKind, status: DiagnosticStatus, notes: String) {
        vm.recordManualVerdict(kind: kind, status: status, notes: notes)
        withAnimation { expanded = nil }
    }

    @ViewBuilder
    private func inlineTest(for kind: DiagnosticKind) -> some View {
        switch kind {
        case .display: DisplayInlineTest()
        case .keyboard: KeyboardInlineCapture()
        case .trackpad: TrackpadInlineCapture()
        case .speakers: SpeakersInlineTest()
        case .microphone: MicrophoneInlineTest()
        case .camera: CameraInlineTest()
        default: EmptyView()
        }
    }

    // MARK: - Footer

    private var footer: some View {
        VStack(spacing: 8) {
            if !vm.remainingManual.isEmpty {
                Text("\(vm.remainingManual.count) manual test(s) remaining: \(vm.remainingManual.map(\.displayName).joined(separator: ", "))")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else {
                Text("All tests complete.")
                    .font(.callout)
                    .foregroundStyle(.green)
            }

            HStack {
                Button(vm.didSave ? "Saved ✓" : "Save to History") {
                    _ = vm.finish()
                }
                .testActionButton()
                .disabled(vm.didSave || !vm.remainingManual.isEmpty)

                Button("Export PDF / JSON / CSV…") {
                    let panel = NSOpenPanel()
                    panel.canChooseDirectories = true
                    panel.canChooseFiles = false
                    guard panel.runModal() == .OK, let url = panel.url else { return }
                    Task { await vm.exportReport(to: url, formats: [.pdf, .json, .csv]) }
                }
                .buttonStyle(.bordered)
                .disabled(!vm.remainingManual.isEmpty)

                if let message = vm.lastSaveMessage {
                    Text(message).font(.caption).foregroundStyle(.red)
                } else if vm.didSave {
                    Text("Session saved to local history.").font(.caption).foregroundStyle(.green)
                }
            }
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Inline manual tests

struct DisplayInlineTest: View {
    @State private var index = 0
    private let patterns: [(String, Color)] = [
        ("Black", .black), ("White", .white), ("Red", .red), ("Green", .green),
        ("Blue", .blue), ("Gray", Color(white: 0.5)),
    ]

    var body: some View {
        VStack(spacing: 8) {
            Rectangle()
                .fill(patterns[index].1)
                .frame(height: 120)
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color(nsColor: .separatorColor)))
            HStack {
                Button("Previous") { index = (index - 1 + patterns.count) % patterns.count }
                Button("Next") { index = (index + 1) % patterns.count }
                Text(patterns[index].0).font(.callout)
            }
            .buttonStyle(.bordered)
            Text("Inspect for dead/stuck pixels, uniformity and flicker.")
                .font(.caption).foregroundStyle(.secondary)
        }
    }
}

struct KeyboardInlineCapture: View {
    @StateObject private var capture = KeyboardCapture()

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text("Untested: \(capture.untestedKeys().count)")
                Text("Repeated: \(capture.repeatedKeys.count)").foregroundStyle(.orange)
                Text("Stuck: \(capture.stuckKeys.count)").foregroundStyle(.red)
                Spacer()
                Button(capture.running ? "Reset" : "Start") { capture.reset() }
                    .buttonStyle(.bordered)
            }
            .font(.callout)

            let rows = Dictionary(grouping: capture.layout, by: \.row)
            ScrollView([.horizontal, .vertical]) {
                VStack(alignment: .leading, spacing: 3) {
                    ForEach(rows.keys.sorted(), id: \.self) { row in
                        HStack(spacing: 3) {
                            ForEach(rows[row]!.sorted(by: { $0.column < $1.column }), id: \.id) { key in
                                KeyCapView(
                                    label: key.label,
                                    isPressed: capture.pressed.contains(key.keyCode),
                                    isDone: capture.completed.contains(key.keyCode),
                                    isRepeated: capture.repeatedKeys.contains(key.keyCode)
                                )
                                .frame(width: key.width * 34, height: 24)
                            }
                        }
                    }
                }
                .padding(2)
            }
            .frame(maxHeight: 220)
        }
        .onAppear { capture.start() }
        .onDisappear { capture.stop() }
    }
}

struct TrackpadInlineCapture: View {
    @StateObject private var capture = TrackpadCapture()

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 16) {
                stat("Left", capture.leftClicks)
                stat("Right", capture.rightClicks)
                stat("Scroll", capture.scrollEvents)
                stat("Pinch", capture.magnifications)
                stat("Rotate", capture.rotations)
                stat("Force", capture.forceClicks)
                Button(capture.running ? "Reset" : "Start") { capture.start() }
                    .buttonStyle(.bordered)
            }
            Text("Move the pointer, click, scroll with two fingers, pinch, rotate and force-click.")
                .font(.caption).foregroundStyle(.secondary)
        }
        .onAppear { capture.start() }
        .onDisappear { capture.stop() }
    }

    private func stat(_ label: String, _ value: Int) -> some View {
        VStack {
            Text("\(value)").font(.headline.bold())
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
    }
}

struct SpeakersInlineTest: View {
    @StateObject private var player = SpeakerTonePlayer()
    @State private var outputDevice = "—"

    var body: some View {
        VStack(spacing: 10) {
            LabeledContent("Output Device") { Text(outputDevice) }
            HStack(spacing: 12) {
                ForEach(SpeakerTone.allCases) { tone in
                    Button(tone.label) { player.play(tone) }.testActionButton()
                }
                Button("Stop") { player.stop() }.buttonStyle(.bordered).disabled(!player.isPlaying)
            }
            Text(player.isPlaying ? "Playing… listen carefully." : "Press a channel to test the speaker.")
                .font(.caption).foregroundStyle(.secondary)
        }
        .onAppear { outputDevice = AudioDeviceProbe.defaultOutput()?.name ?? "NOT AVAILABLE" }
        .onDisappear { player.stop() }
    }
}

struct MicrophoneInlineTest: View {
    @StateObject private var monitor = MicrophoneMonitor()
    @State private var devices: [MicrophoneDeviceInfo] = []
    @State private var permission = PermissionManager.status(for: .microphone)

    var body: some View {
        VStack(spacing: 10) {
            if permission.granted {
                VStack(spacing: 8) {
                    Text(devices.map(\.name).joined(separator: ", ").isEmpty
                         ? "Input: NOT AVAILABLE" : "Input: \(devices.map(\.name).joined(separator: ", "))")
                        .font(.callout)
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4).fill(Color(nsColor: .controlBackgroundColor))
                        RoundedRectangle(cornerRadius: 4).fill(Color.green)
                            .frame(width: 240 * min(1, max(0, CGFloat(monitor.level))))
                    }
                    .frame(height: 10)
                    HStack(spacing: 10) {
                        Button(monitor.isRecording ? "Stop Recording" : "START TEST") {
                            if monitor.isRecording { monitor.stopRecording() } else { monitor.startMonitoring(); monitor.startRecording() }
                        }
                        .testActionButton()
                        Button("PLAYBACK") { monitor.playback() }
                            .buttonStyle(.bordered)
                            .disabled(monitor.lastRecordingURL == nil)
                        Button("STOP TEST") { monitor.deleteRecording() }.buttonStyle(.bordered)
                    }
                }
            } else {
                Text(permission.message).font(.callout)
                if permission.notDetermined {
                    Button("Grant Microphone Permission") {
                        Task {
                            _ = await PermissionManager.request(.microphone)
                            reload()
                        }
                    }
                    .buttonStyle(.borderedProminent)
                } else {
                    Button("Open System Settings") { PermissionManager.openSettings() }.buttonStyle(.bordered)
                }
            }
        }
        .onAppear { reload() }
        .onDisappear { monitor.deleteRecording() }
    }

    private func reload() {
        permission = PermissionManager.status(for: .microphone)
        devices = MicrophoneProbe.devices()
    }
}

struct CameraInlineTest: View {
    @StateObject private var monitor = CameraMonitor()
    @State private var permission = PermissionManager.status(for: .camera)

    var body: some View {
        VStack(spacing: 10) {
            if permission.granted {
                if monitor.isRunning {
                    CameraPreviewRepresentable(layer: monitor.previewLayer)
                        .frame(width: 420, height: 250)
                        .border(Color(nsColor: .separatorColor), width: 1)
                    HStack(spacing: 24) {
                        Text("Frames Received: \(monitor.frameCount)")
                        Text(monitor.resolution.isEmpty ? "Resolution: N/A" : "Resolution: \(monitor.resolution)")
                    }
                    .font(.callout)
                } else {
                    if let err = monitor.lastError {
                        Text(err).foregroundStyle(.red).font(.callout)
                    }
                    Button("Enable Camera") { monitor.configure() }
                        .testActionButton()
                }
            } else {
                Text(permission.message).font(.callout)
                if permission.notDetermined {
                    Button("Grant Camera Permission") {
                        Task {
                            _ = await PermissionManager.request(.camera)
                            permission = PermissionManager.status(for: .camera)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                } else {
                    Button("Open System Settings") { PermissionManager.openSettings() }.buttonStyle(.bordered)
                }
            }
        }
        .onAppear { permission = PermissionManager.status(for: .camera) }
        .onDisappear { monitor.stop() }
    }
}