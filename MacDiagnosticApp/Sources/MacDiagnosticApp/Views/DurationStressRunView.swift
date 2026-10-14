import SwiftUI
import MacDiagnosticKit

/// Shared duration-selectable runner for the Fan Test and RAM Stress Test:
/// pick 30 s or 60 s, watch live CPU load + temperature, get full metrics.
struct DurationStressRunView: View {
    enum Mode {
        case fan
        case ram

        var title: String {
            switch self {
            case .fan: "Fan Test"
            case .ram: "RAM Stress Test"
            }
        }
        var subtitle: String {
            switch self {
            case .fan: "Applies maximum combined heat load so the fans ramp to high speed, then observes cooling. Listen/feel for fan spin-up during the load phase."
            case .ram: "Saturates a large fraction of installed RAM with multi-threaded pattern write/read verification to expose memory faults and measure real bandwidth."
            }
        }
        var icon: String {
            switch self {
            case .fan: "fanblades.fill"
            case .ram: "memorychip"
            }
        }
        var tint: Color {
            switch self {
            case .fan: .cyan
            case .ram: .purple
            }
        }
        var kind: DiagnosticKind {
            switch self {
            case .fan: .fanTest
            case .ram: .ramStress
            }
        }
    }

    let mode: Mode
    @ObservedObject var vm: SessionRunViewModel

    @State private var selectedDuration = 30
    @State private var isRunning = false
    @State private var elapsedSeconds = 0
    @State private var currentCPULoad: Double = 0
    @State private var currentTemp: Double? = nil
    @State private var cpuHistory: [Double] = []
    @State private var tempHistory: [Double] = []
    @State private var result: DiagnosticResult? = nil
    @State private var testTimer: Timer?
    @State private var monitorTimer: Timer?
    @State private var startTime: Date?
    @State private var diagnosticTask: Task<Void, Never>?

    /// Load phase + baseline + cooldown overhead shown in the progress bar.
    private var totalSeconds: Int { selectedDuration + 10 }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                header
                if let result {
                    resultPanel(result)
                } else if isRunning {
                    runningPanel
                } else {
                    configPanel
                }
                liveCharts
            }
            .padding(24)
        }
        .frame(minWidth: 700, minHeight: 500)
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: mode.icon)
                .font(.system(size: 36))
                .foregroundStyle(mode.tint)
            VStack(alignment: .leading) {
                Text(mode.title).font(.system(size: 32, weight: .heavy))
                Text(mode.subtitle).font(.callout).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(mode.tint.opacity(0.3), lineWidth: 1))
    }

    // MARK: - Config

    private var configPanel: some View {
        VStack(spacing: 16) {
            Text("Select Test Duration").font(.title3.bold())

            HStack(spacing: 12) {
                ForEach([30, 60], id: \.self) { seconds in
                    Button {
                        selectedDuration = seconds
                    } label: {
                        VStack(spacing: 2) {
                            Text("\(seconds)s").font(.title2.bold()).monospaced()
                            Text(seconds == 30 ? "Quick" : "Extended").font(.caption)
                        }
                        .frame(width: 110, height: 56)
                    }
                    .buttonStyle(.bordered)
                    .tint(selectedDuration == seconds ? mode.tint : nil)
                    .background(selectedDuration == seconds ? mode.tint.opacity(0.12) : .clear)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }

            switch mode {
            case .fan:
                Text("Runs \(selectedDuration)s of maximum CPU+GPU+RAM load followed by a cooldown observation. Fans should ramp to high speed during the load; temperature must rise under load and fall after. Fan RPM is not readable via public APIs — confirm audibly.")
                    .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
            case .ram:
                Text("Pattern-stresses min(50% of installed RAM, 4 GB) across 8 threads for \(selectedDuration)s with continuous write/read verification. Reports aggregate bandwidth and every integrity error.")
                    .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }

            Button {
                startTest()
            } label: {
                Label("START \(mode.title.uppercased())", systemImage: "play.fill")
                    .font(.headline)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent)
            .tint(mode.tint)
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .controlBackgroundColor)))
    }

    // MARK: - Running

    private var runningPanel: some View {
        VStack(spacing: 16) {
            HStack {
                ProgressView().controlSize(.large)
                VStack(alignment: .leading) {
                    Text("\(mode.title) Running…").font(.title3.bold())
                    Text("Elapsed: \(elapsedSeconds)s / \(totalSeconds)s")
                        .font(.callout.monospaced()).foregroundStyle(.secondary)
                }
                Spacer()
                Button("Stop Early") { stopTest() }
                    .buttonStyle(.bordered).tint(.red)
            }
            ProgressView(value: Double(elapsedSeconds), total: Double(totalSeconds))
                .progressViewStyle(.linear).tint(mode.tint)
            HStack(spacing: 30) {
                liveStat(icon: "cpu.fill", label: "CPU Load",
                         value: String(format: "%.1f%%", currentCPULoad),
                         color: currentCPULoad > 80 ? .red : .green)
                liveStat(icon: "thermometer.medium", label: "Temperature",
                         value: currentTemp.map { String(format: "%.1f°C", $0) } ?? "—",
                         color: liveTempColor)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(mode.tint, lineWidth: 1.5))
    }

    private var liveTempColor: Color {
        guard let temp = currentTemp else { return .gray }
        if temp > 50 { return .red }
        if temp > 40 { return .orange }
        return .green
    }

    // MARK: - Result

    private func resultPanel(_ result: DiagnosticResult) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: result.status == .pass ? "checkmark.circle.fill" :
                        result.status == .warning ? "exclamationmark.triangle.fill" :
                        "xmark.circle.fill")
                    .font(.title)
                    .foregroundStyle(result.status == .pass ? .green :
                                     result.status == .warning ? .orange : .red)
                VStack(alignment: .leading) {
                    Text("\(mode.title) Complete").font(.title3.bold())
                    Text(result.summary).font(.callout).foregroundStyle(.secondary)
                }
                Spacer()
                StatusBadge(status: result.status)
            }
            Divider()
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 8) {
                ForEach(result.metrics) { metric in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(metric.name).font(.caption).foregroundStyle(.secondary)
                        Text(metric.value).font(.callout.monospaced())
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(8)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color(nsColor: .textBackgroundColor)))
                }
            }
            HStack {
                Button("Run Again") {
                    self.result = nil
                    resetState()
                }
                .buttonStyle(.bordered)

                Button(vm.didSave ? "Saved ✓" : "Save to History") {
                    vm.recordAutomatedResult(result)
                }
                .buttonStyle(.borderedProminent)
                .tint(mode.tint)
                .disabled(vm.didSave)

                if vm.didSave {
                    Text("Saved ✓").font(.caption).foregroundStyle(.green)
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.green.opacity(0.4), lineWidth: 1.5))
    }

    // MARK: - Charts

    private var liveCharts: some View {
        HStack(alignment: .top, spacing: 16) {
            chartCard(title: "CPU Load Over Time", color: .blue,
                      data: cpuHistory, maxValue: 100, unit: "%")
            chartCard(title: "Temperature Over Time", color: .orange,
                      data: tempHistory,
                      maxValue: max(50, (tempHistory.max() ?? 0) + 5),
                      unit: "°C")
        }
    }

    private func chartCard(title: String, color: Color, data: [Double], maxValue: Double, unit: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title).font(.headline)
                Spacer()
                if let latest = data.last {
                    Text(String(format: "%.1f\(unit)", latest))
                        .font(.caption.monospaced()).foregroundStyle(color)
                }
            }
            if data.isEmpty {
                Text("Data will appear once test starts…")
                    .font(.caption).foregroundStyle(.secondary)
                    .frame(maxHeight: .infinity)
            } else {
                SparklineChart(data: data, maxValue: maxValue, color: color)
                    .frame(height: 120)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color(nsColor: .controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(nsColor: .separatorColor), lineWidth: 0.5))
    }

    private func liveStat(icon: String, label: String, value: String, color: Color) -> some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: icon).foregroundStyle(color)
                Text(label).font(.caption).foregroundStyle(.secondary)
            }
            Text(value).font(.title3.bold()).monospaced().foregroundStyle(color)
        }
        .frame(width: 140)
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 8).fill(color.opacity(0.08)))
    }

    // MARK: - Control

    private func startTest() {
        isRunning = true
        result = nil
        elapsedSeconds = 0
        cpuHistory = []
        tempHistory = []
        startTime = Date()

        monitorTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in
            currentCPULoad = SystemSensors.cpuLoadPercent()
            currentTemp = SystemSensors.temperatureCelsius()
            cpuHistory.append(currentCPULoad)
            if let t = currentTemp { tempHistory.append(t) }
        }
        testTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { timer in
            if elapsedSeconds < totalSeconds {
                elapsedSeconds += 1
            } else {
                timer.invalidate()
            }
        }

        let duration = selectedDuration
        diagnosticTask = Task {
            let diagResult: DiagnosticResult
            switch mode {
            case .fan:
                var diag = FanTestDiagnostic()
                diag.loadDurationSeconds = duration
                diagResult = await diag.run()
            case .ram:
                var diag = RAMStressTestDiagnostic()
                diag.durationSeconds = duration
                diagResult = await diag.run()
            }
            await MainActor.run {
                guard !Task.isCancelled else { return }
                self.result = diagResult
                self.finishUI()
            }
        }
    }

    private func stopTest() {
        diagnosticTask?.cancel()
        finishUI()
    }

    private func finishUI() {
        testTimer?.invalidate()
        monitorTimer?.invalidate()
        isRunning = false
        elapsedSeconds = 0
    }

    private func resetState() {
        elapsedSeconds = 0
        cpuHistory = []
        tempHistory = []
        currentCPULoad = 0
        currentTemp = nil
    }
}

// MARK: - Containers

struct FanTestContainer: View {
    @EnvironmentObject var appModel: AppModel
    @StateObject private var vm = SessionRunViewModel(
        engine: DiagnosticEngine(
            registry: DefaultRegistry.make(),
            device: DeviceInfo(),
            technician: "Technician",
            appVersion: AppMetadata.version
        ),
        store: nil
    )

    var body: some View {
        DurationStressRunView(mode: .fan, vm: vm)
            .onAppear {
                vm.bind(
                    engine: DiagnosticEngine(
                        registry: DefaultRegistry.make(),
                        device: appModel.device,
                        technician: appModel.technician?.name ?? "Technician",
                        appVersion: appModel.appVersion
                    ),
                    store: appModel.store
                )
            }
    }
}

struct RAMStressTestContainer: View {
    @EnvironmentObject var appModel: AppModel
    @StateObject private var vm = SessionRunViewModel(
        engine: DiagnosticEngine(
            registry: DefaultRegistry.make(),
            device: DeviceInfo(),
            technician: "Technician",
            appVersion: AppMetadata.version
        ),
        store: nil
    )

    var body: some View {
        DurationStressRunView(mode: .ram, vm: vm)
            .onAppear {
                vm.bind(
                    engine: DiagnosticEngine(
                        registry: DefaultRegistry.make(),
                        device: appModel.device,
                        technician: appModel.technician?.name ?? "Technician",
                        appVersion: appModel.appVersion
                    ),
                    store: appModel.store
                )
            }
    }
}
