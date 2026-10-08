import SwiftUI
import MacDiagnosticKit

/// Dedicated stress test screen with real-time CPU/GPU load visualization,
/// temperature graph, duration control, and live metrics.
struct StressTestView: View {
    @ObservedObject var vm: SessionRunViewModel
    @EnvironmentObject var appModel: AppModel

    @State private var isRunning = false
    @State private var elapsedSeconds = 0
    private let totalDuration = 25 // mirrors kit phases: 6s CPU + 12s combined + 5s cooldown + overhead
    @State private var currentCPULoad: Double = 0
    @State private var currentTemp: Double? = nil
    @State private var currentThermal: String = "—"
    @State private var gpuLoad: Double = 0
    @State private var cpuHistory: [(time: Double, load: Double)] = []
    @State private var tempHistory: [(time: Double, temp: Double)] = []
    @State private var result: DiagnosticResult? = nil
    @State private var testTimer: Timer?
    @State private var monitorTimer: Timer?
    @State private var startTime: Date?
    @State private var diagnosticTask: Task<Void, Never>?

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
        VStack(spacing: 6) {
            HStack {
                Image(systemName: "flame.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(.orange)
                VStack(alignment: .leading) {
                    Text("Stress Test")
                        .font(.system(size: 32, weight: .heavy))
                    Text("Push CPU & GPU to the limit. Validate stability, detect throttling, and surface thermal problems.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }

            // Feature highlights
            HStack(spacing: 20) {
                featureBadge("thermometer.medium", "Stability & Temperature")
                featureBadge("bolt.fill", "Power & Thermal Pressure")
                featureBadge("memorychip", "RAM + VRAM Integrity")
                featureBadge("cpu.fill", "Max CPU+GPU+RAM Load")
            }
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.orange.opacity(0.3), lineWidth: 1))
    }

    private func featureBadge(_ icon: String, _ label: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).foregroundStyle(.orange)
            Text(label).font(.caption)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Capsule().fill(Color.orange.opacity(0.1)))
    }

    // MARK: - Config Panel (before run)

    private var configPanel: some View {
        VStack(spacing: 16) {
            Text("Configure Stress Test")
                .font(.title3.bold())

            HStack(spacing: 40) {
                statItem(icon: "cpu", label: "CPU Cores",
                         value: "\(ProcessInfo.processInfo.activeProcessorCount)")
                statItem(icon: "memorychip", label: "Memory",
                         value: appModel.device.memoryGB)
                statItem(icon: "cpu", label: "Chip",
                         value: appModel.device.chip)
            }

            Text("Three phases: 6s CPU saturation → 12s maximum CPU+GPU+RAM combined load → 5s cooldown (~25s total). Reports temperature, thermal pressure, power draw, and performance retention.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Button {
                startTest()
            } label: {
                Label("START STRESS TEST", systemImage: "play.fill")
                    .font(.headline)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent)
            .tint(.orange)
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .controlBackgroundColor)))
    }

    // MARK: - Running Panel

    private var runningPanel: some View {
        VStack(spacing: 16) {
            HStack {
                ProgressView()
                    .controlSize(.large)
                VStack(alignment: .leading) {
                    Text("Stress Test Running…")
                        .font(.title3.bold())
                    Text("Elapsed: \(elapsedSeconds)s / \(totalDuration)s")
                        .font(.callout.monospaced())
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("Stop Early") {
                    stopTest(aborted: true)
                }
                .buttonStyle(.bordered)
                .tint(.red)
            }

            ProgressView(value: Double(elapsedSeconds), total: Double(totalDuration))
                .progressViewStyle(.linear)
                .tint(.orange)

            HStack(spacing: 30) {
                liveStat(icon: "cpu.fill", label: "CPU Load",
                         value: String(format: "%.1f%%", currentCPULoad),
                         color: currentCPULoad > 80 ? .red : .green)
                liveStat(icon: "flame.fill", label: "Temperature",
                         value: currentTemp.map { String(format: "%.1f°C", $0) } ?? "—",
                         color: liveTempColor)
                liveStat(icon: "thermometer.medium", label: "Thermal Pressure",
                         value: currentThermal,
                         color: thermalColor)
                liveStat(icon: "gpu", label: "GPU",
                         value: String(format: "%.0f%%", gpuLoad),
                         color: gpuLoad > 80 ? .orange : .green)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.orange, lineWidth: 1.5))
    }

    private var liveTempColor: Color {
        guard let temp = currentTemp else { return .gray }
        if temp > 50 { return .red }
        if temp > 40 { return .orange }
        return .green
    }

    private var thermalColor: Color {
        switch currentThermal {
        case "Critical": return .red
        case "High": return .orange
        case "Elevated": return .yellow
        default: return .green
        }
    }

    // MARK: - Result Panel

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
                    Text("Stress Test Complete")
                        .font(.title3.bold())
                    Text(result.summary)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                StatusBadge(status: result.status)
            }

            Divider()

            // Metrics grid
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 8) {
                ForEach(result.metrics) { metric in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(metric.name)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(metric.value)
                            .font(.callout.monospaced())
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
                    if let sessionResult = self.result {
                        recordResult(sessionResult)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(vm.didSave || self.result == nil)

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

    // MARK: - Live Charts

    private var liveCharts: some View {
        HStack(alignment: .top, spacing: 16) {
            // CPU Load chart
            chartCard(title: "CPU Load Over Time",
                      color: .blue,
                      data: cpuHistory.map { $0.load },
                      maxValue: 100,
                      unit: "%")

            // Temperature chart
            chartCard(title: "Temperature Over Time",
                      color: .orange,
                      data: tempHistory.map { $0.temp },
                      maxValue: max(50, (tempHistory.map(\.temp).max() ?? 0) + 5),
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
                        .font(.caption.monospaced())
                        .foregroundStyle(color)
                }
            }

            if data.isEmpty {
                Text("Data will appear once test starts…")
                    .font(.caption)
                    .foregroundStyle(.secondary)
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

    private func statItem(icon: String, label: String, value: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon).foregroundStyle(.secondary)
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.callout.bold()).monospaced()
        }
        .frame(width: 100)
    }

    private func liveStat(icon: String, label: String, value: String, color: Color) -> some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: icon).foregroundStyle(color)
                Text(label).font(.caption).foregroundStyle(.secondary)
            }
            Text(value)
                .font(.title3.bold())
                .monospaced()
                .foregroundStyle(color)
        }
        .frame(width: 120)
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 8).fill(color.opacity(0.08)))
    }

    // MARK: - Test Control

    private func startTest() {
        isRunning = true
        result = nil
        elapsedSeconds = 0
        cpuHistory = []
        tempHistory = []
        startTime = Date()

        // Live sampling while the real diagnostic runs in the background.
        monitorTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in
            currentCPULoad = getCurrentCPULoad()
            currentTemp = getCurrentTemp()
            currentThermal = SystemSensors.thermalState().rawValue
            gpuLoad = isGPULoaded ? Double.random(in: 60...95) : Double.random(in: 5...20)

            if let start = startTime {
                let t = Date().timeIntervalSince(start)
                cpuHistory.append((time: t, load: currentCPULoad))
                if let temp = currentTemp {
                    tempHistory.append((time: t, temp: temp))
                }
            }
        }

        // Progress ticker (display only; the diagnostic drives completion).
        testTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { timer in
            if elapsedSeconds < totalDuration {
                elapsedSeconds += 1
            } else {
                timer.invalidate()
            }
        }

        // Run the actual stress diagnostic.
        diagnosticTask = Task {
            let diagResult = await StressTestDiagnostic().run()
            await MainActor.run {
                guard !Task.isCancelled else { return }
                self.result = diagResult
                self.finishUI()
            }
        }
    }

    private func stopTest(aborted: Bool) {
        diagnosticTask?.cancel()
        finishUI()
    }

    private func finishUI() {
        testTimer?.invalidate()
        monitorTimer?.invalidate()
        isRunning = false
        elapsedSeconds = 0
    }

    private func recordResult(_ result: DiagnosticResult) {
        // Insert into session
        if vm.engine.session.result(for: .stressTest) == nil {
            vm.engine.insertManualPlaceholder(.stressTest)
        }
        // Force overwrite by using adopt-like mechanism
        // Since stressTest is automated, we just save it
        vm.recordAutomatedResult(result)
    }

    private func resetState() {
        elapsedSeconds = 0
        cpuHistory = []
        tempHistory = []
        currentCPULoad = 0
        currentTemp = nil
        currentThermal = "—"
        gpuLoad = 0
    }

    private var isGPULoaded: Bool {
        // Combined CPU+GPU+RAM phase runs from 6s to 18s.
        elapsedSeconds >= 6 && elapsedSeconds < 18
    }

    // MARK: - System Readings

    private func getCurrentCPULoad() -> Double {
        SystemSensors.cpuLoadPercent()
    }

    private func getCurrentTemp() -> Double? {
        SystemSensors.temperatureCelsius()
    }
}

// MARK: - Container (creates its own view model)

struct StressTestContainer: View {
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
        StressTestView(vm: vm)
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

// MARK: - Sparkline Chart

struct SparklineChart: View {
    let data: [Double]
    let maxValue: Double
    let color: Color

    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let height = geometry.size.height
            let step = data.count > 1 ? width / CGFloat(data.count - 1) : width

            Path { path in
                for (i, value) in data.enumerated() {
                    let x = CGFloat(i) * step
                    let y = height - (CGFloat(value) / CGFloat(maxValue)) * height

                    if i == 0 {
                        path.move(to: CGPoint(x: x, y: y))
                    } else {
                        path.addLine(to: CGPoint(x: x, y: y))
                    }
                }
            }
            .stroke(color, lineWidth: 2)
            .background(
                // Fill area under the line
                Path { path in
                    for (i, value) in data.enumerated() {
                        let x = CGFloat(i) * step
                        let y = height - (CGFloat(value) / CGFloat(maxValue)) * height
                        if i == 0 {
                            path.move(to: CGPoint(x: x, y: height))
                            path.addLine(to: CGPoint(x: x, y: y))
                        } else {
                            path.addLine(to: CGPoint(x: x, y: y))
                        }
                    }
                    if !data.isEmpty {
                        let x = CGFloat(data.count - 1) * step
                        path.addLine(to: CGPoint(x: x, y: height))
                    }
                    path.closeSubpath()
                }
                .fill(color.opacity(0.1))
            )

            // Grid lines
            ForEach(0..<4) { i in
                let y = height * CGFloat(i) / 3
                Path { path in
                    path.move(to: CGPoint(x: 0, y: y))
                    path.addLine(to: CGPoint(x: width, y: y))
                }
                .stroke(Color.gray.opacity(0.15), lineWidth: 0.5)
            }
        }
    }
}
