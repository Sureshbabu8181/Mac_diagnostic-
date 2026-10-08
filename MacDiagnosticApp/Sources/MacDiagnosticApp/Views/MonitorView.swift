import SwiftUI
import MacDiagnosticKit

/// Real-time system monitor screen with live charts for temperature,
/// CPU load, memory, frequency, network, and battery health over time.
struct MonitorView: View {
    @ObservedObject var vm: SessionRunViewModel
    @EnvironmentObject var appModel: AppModel

    @State private var isMonitoring = false
    @State private var elapsedSeconds = 0
    @State private var duration = 30

    // Live data
    @State private var cpuHistory: [Double] = []
    @State private var memHistory: [Double] = []
    @State private var tempHistory: [Double] = []
    @State private var freqHistory: [Double] = []
    @State private var netInHistory: [Double] = []
    @State private var batteryHistory: [Double] = []

    // Current values
    @State private var currentCPU: Double = 0
    @State private var currentMem: Double = 0
    @State private var currentTemp: Double? = nil
    @State private var currentFreq: Double? = nil
    @State private var batteryHealth: Double? = nil
    @State private var batteryCycles: Int = 0

    @State private var sampleTimer: Timer?
    @State private var testTimer: Timer?
    @State private var startTime: Date?
    @State private var result: DiagnosticResult? = nil

    private let durations = [15, 30, 60]

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                header

                if let result {
                    resultPanel(result)
                } else if isMonitoring {
                    monitoringPanel
                } else {
                    configPanel
                }

                liveChartsSection

                if isMonitoring || !cpuHistory.isEmpty {
                    batterySection
                }

                if isMonitoring || !cpuHistory.isEmpty {
                    networkSection
                }
            }
            .padding(24)
        }
        .frame(minWidth: 720, minHeight: 500)
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.system(size: 36))
                    .foregroundStyle(.blue)
                VStack(alignment: .leading) {
                    Text("System Monitor")
                        .font(.system(size: 32, weight: .heavy))
                    Text("Track temperature, power, load, frequency, battery health, and network performance over time.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }

            HStack(spacing: 20) {
                featureBadge("thermometer", "Temperature & Power", .orange)
                featureBadge("cpu", "Load & Performance", .blue)
                featureBadge("battery.100", "Battery Health", .green)
                featureBadge("network", "Network Performance", .purple)
            }
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.blue.opacity(0.3), lineWidth: 1))
    }

    private func featureBadge(_ icon: String, _ label: String, _ color: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).foregroundStyle(color)
            Text(label).font(.caption)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Capsule().fill(color.opacity(0.1)))
    }

    // MARK: - Config Panel

    private var configPanel: some View {
        VStack(spacing: 16) {
            Text("Configure Monitoring Session")
                .font(.title3.bold())

            HStack(spacing: 12) {
                ForEach(durations, id: \.self) { dur in
                    if duration == dur {
                        Button("\(dur)s") { duration = dur }
                            .buttonStyle(.borderedProminent)
                    } else {
                        Button("\(dur)s") { duration = dur }
                            .buttonStyle(.bordered)
                    }
                }
            }

            Text("Samples will be collected every 1 second for \(duration) seconds. Charts will update in real time.")
                .font(.caption)
                .foregroundStyle(.secondary)

            Button {
                startMonitoring()
            } label: {
                Label("START MONITORING", systemImage: "play.fill")
                    .font(.headline)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent)
            .tint(.blue)
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .controlBackgroundColor)))
    }

    // MARK: - Monitoring Panel

    private var monitoringPanel: some View {
        VStack(spacing: 14) {
            HStack {
                ProgressView()
                    .controlSize(.large)
                VStack(alignment: .leading) {
                    Text("Monitoring…")
                        .font(.title3.bold())
                    Text("\(elapsedSeconds)s / \(duration)s · \(cpuHistory.count) samples collected")
                        .font(.callout.monospaced())
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("Stop") {
                    stopMonitoring()
                }
                .buttonStyle(.bordered)
                .tint(.red)
            }

            ProgressView(value: Double(elapsedSeconds), total: Double(duration))
                .progressViewStyle(.linear)
                .tint(.blue)

            HStack(spacing: 20) {
                liveMetric(icon: "cpu.fill", label: "CPU Load",
                           value: String(format: "%.1f%%", currentCPU),
                           color: currentCPU > 80 ? .red : .green)
                liveMetric(icon: "memorychip", label: "Memory",
                           value: String(format: "%.1f%%", currentMem),
                           color: currentMem > 85 ? .orange : .green)
                liveMetric(icon: "thermometer", label: "Temperature",
                           value: currentTemp.map { String(format: "%.1f°C", $0) } ?? "—",
                           color: tempColor)
                liveMetric(icon: "speedometer", label: "Performance",
                           value: currentFreq.map { String(format: "%.1f Mops", $0) } ?? "—",
                           color: .blue)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.blue, lineWidth: 1.5))
    }

    private var tempColor: Color {
        guard let t = currentTemp else { return .gray }
        if t > 50 { return .red }
        if t > 40 { return .orange }
        return .green
    }

    private func liveMetric(icon: String, label: String, value: String, color: Color) -> some View {
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
                    Text("Monitoring Complete")
                        .font(.title3.bold())
                    Text(result.summary)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                StatusBadge(status: result.status)
            }

            Divider()

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
                    recordResult(result)
                }
                .buttonStyle(.borderedProminent)
                .disabled(vm.didSave)

                if vm.didSave {
                    Text("Saved ✓").font(.caption).foregroundStyle(.green)
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.blue.opacity(0.4), lineWidth: 1.5))
    }

    // MARK: - Charts Section

    private var liveChartsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Performance Over Time", systemImage: "chart.xyaxis.line")
                    .font(.headline)
                Spacer()
                if !cpuHistory.isEmpty {
                    Text("\(cpuHistory.count) samples")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 2), spacing: 12) {
                chartCard(title: "CPU Load", icon: "cpu.fill", color: .blue,
                          data: cpuHistory, maxValue: 100, unit: "%")

                chartCard(title: "Memory Usage", icon: "memorychip", color: .green,
                          data: memHistory, maxValue: 100, unit: "%")

                chartCard(title: "Temperature", icon: "thermometer", color: .orange,
                          data: tempHistory, maxValue: max(50, (tempHistory.max() ?? 0) + 5), unit: "°C")

                chartCard(title: "CPU Performance", icon: "speedometer", color: .purple,
                          data: freqHistory, maxValue: max(1, (freqHistory.max() ?? 1) * 1.15), unit: " Mops/s")
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .controlBackgroundColor)))
    }

    private func chartCard(title: String, icon: String, color: Color, data: [Double], maxValue: Double, unit: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: icon).foregroundStyle(color)
                Text(title).font(.subheadline.bold())
                Spacer()
                if let latest = data.last {
                    Text(String(format: "%.1f%@", latest, unit))
                        .font(.caption.monospaced())
                        .foregroundStyle(color)
                }
            }

            if data.isEmpty {
                Text("Waiting for data…")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(height: 80, alignment: .center)
                    .frame(maxWidth: .infinity)
            } else {
                SparklineChart(data: data, maxValue: maxValue, color: color)
                    .frame(height: 80)
            }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color(nsColor: .textBackgroundColor)))
    }

    // MARK: - Battery Section

    private var batterySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Battery Health", systemImage: "battery.100")
                .font(.headline)

            HStack(spacing: 30) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Health").font(.caption).foregroundStyle(.secondary)
                    if let health = batteryHealth {
                        Text(String(format: "%.0f%%", health))
                            .font(.title2.bold())
                            .foregroundStyle(batteryHealthColor)
                    } else {
                        Text("NOT AVAILABLE").font(.title2.bold()).foregroundStyle(.gray)
                    }
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("Cycle Count").font(.caption).foregroundStyle(.secondary)
                    Text("\(batteryCycles)")
                        .font(.title2.bold())
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("Degradation").font(.caption).foregroundStyle(.secondary)
                    if let health = batteryHealth {
                        Text(health >= 80 ? "Good" : health >= 60 ? "Fair" : "Poor")
                            .font(.title2.bold())
                            .foregroundStyle(batteryHealthColor)
                    } else {
                        Text("—").font(.title2.bold())
                    }
                }

                if !batteryHistory.isEmpty {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Trend").font(.caption).foregroundStyle(.secondary)
                        SparklineChart(data: batteryHistory, maxValue: 100, color: .green)
                            .frame(width: 150, height: 40)
                    }
                }

                Spacer()
            }

            if let health = batteryHealth {
                // Health bar
                ProgressView(value: health, total: 100)
                    .progressViewStyle(.linear)
                    .tint(batteryHealthColor)
                    .frame(width: 300)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .controlBackgroundColor)))
    }

    private var batteryHealthColor: Color {
        guard let h = batteryHealth else { return .gray }
        if h >= 80 { return .green }
        if h >= 60 { return .orange }
        return .red
    }

    // MARK: - Network Section

    private var networkSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Network Performance", systemImage: "network")
                .font(.headline)

            if netInHistory.isEmpty {
                Text("Network data will appear during monitoring…")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                HStack(spacing: 30) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Received").font(.caption).foregroundStyle(.secondary)
                        Text(String(format: "%.2f MB", netInHistory.last ?? 0))
                            .font(.title2.bold().monospaced())
                            .foregroundStyle(.blue)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Samples").font(.caption).foregroundStyle(.secondary)
                        Text("\(netInHistory.count)")
                            .font(.title2.bold().monospaced())
                    }

                    SparklineChart(data: netInHistory, maxValue: max(1, netInHistory.max() ?? 1), color: .blue)
                        .frame(width: 200, height: 50)

                    Spacer()
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .controlBackgroundColor)))
    }

    // MARK: - Monitoring Control

    private func startMonitoring() {
        isMonitoring = true
        result = nil
        resetState()
        startTime = Date()

        // Sample timer
        sampleTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            currentCPU = getCPULoad()
            currentMem = getMemoryUsage()
            currentTemp = getTemperature()
            currentFreq = getFrequency()

            cpuHistory.append(currentCPU)
            memHistory.append(currentMem)
            if let t = currentTemp { tempHistory.append(t) }
            if let f = currentFreq { freqHistory.append(f) }

            // Battery
            if let battery = getBatteryHealth() {
                batteryHealth = battery.health
                batteryCycles = battery.cycleCount
                batteryHistory.append(battery.health)
            }

            // Network
            netInHistory.append(getNetworkInMB())
        }

        // Duration timer
        testTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { timer in
            elapsedSeconds += 1
            if elapsedSeconds >= duration {
                timer.invalidate()
                finishMonitoring()
            }
        }
    }

    private func stopMonitoring() {
        sampleTimer?.invalidate()
        testTimer?.invalidate()
        isMonitoring = false
        finishMonitoring()
    }

    private func finishMonitoring() {
        sampleTimer?.invalidate()
        testTimer?.invalidate()
        isMonitoring = false

        Task {
            let diagResult = await MonitorDiagnostic().run()
            await MainActor.run {
                self.result = diagResult
            }
        }
    }

    private func recordResult(_ result: DiagnosticResult) {
        vm.recordAutomatedResult(result)
    }

    private func resetState() {
        elapsedSeconds = 0
        cpuHistory = []
        memHistory = []
        tempHistory = []
        freqHistory = []
        netInHistory = []
        batteryHistory = []
        currentCPU = 0
        currentMem = 0
        currentTemp = nil
        currentFreq = nil
        batteryHealth = nil
        batteryCycles = 0
    }

    // MARK: - System Readings

    private func getCPULoad() -> Double {
        SystemSensors.cpuLoadPercent()
    }

    private func getMemoryUsage() -> Double {
        var stats = vm_statistics64()
        var count = mach_msg_type_number_t(MemoryLayout<vm_statistics64>.size / MemoryLayout<integer_t>.size)
        let result = withUnsafeMutablePointer(to: &stats) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics64(mach_host_self(), HOST_VM_INFO64, $0, &count)
            }
        }
        guard result == KERN_SUCCESS else { return 0 }
        let pageSize = UInt64(getpagesize())
        let totalMemory = ProcessInfo.processInfo.physicalMemory
        let usedMemory = UInt64(stats.active_count + stats.wire_count) * pageSize
        return totalMemory > 0 ? (Double(usedMemory) / Double(totalMemory)) * 100 : 0
    }

    private func getTemperature() -> Double? {
        SystemSensors.temperatureCelsius()
    }

    private func getFrequency() -> Double? {
        SystemSensors.throughputMOps(iterations: 500_000)
    }

    private func getBatteryHealth() -> (health: Double, cycleCount: Int)? {
        let readings = BatteryReader().read()
        guard let health = readings.healthPercent, health > 0, health <= 100 else { return nil }
        return (health, readings.cycleCount ?? 0)
    }

    private func getNetworkInMB() -> Double {
        let task = Process()
        task.launchPath = "/usr/bin/netstat"
        task.arguments = ["-ib"]
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = Pipe()
        do {
            try task.run()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            task.waitUntilExit()
            guard let output = String(data: data, encoding: .utf8) else { return 0 }

            var totalBytes: Int64 = 0
            for line in output.components(separatedBy: "\n") {
                let parts = line.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
                if parts.count >= 10, parts[0] != "Name" {
                    // Find the bytes in column (usually index 7 or 8)
                    if let bytesIn = Int64(parts[7]) {
                        totalBytes += bytesIn
                    }
                }
            }
            return Double(totalBytes) / (1024 * 1024)
        } catch {}
        return 0
    }
}

// MARK: - Container (creates its own view model)

struct MonitorContainer: View {
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
        MonitorView(vm: vm)
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
