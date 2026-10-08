import Foundation

/// Monitors key system and network performance indicators over time
/// to spot and resolve problems as they appear. Samples temperature,
/// power, load, frequency, battery health, and network performance.
public struct MonitorDiagnostic: AutomatedDiagnosticProvider {
    public let meta = DiagnosticMeta(
        kind: .monitor,
        title: "Monitor",
        whyItMatters: "Tracks temperature, power, load, frequency, battery health, and network performance over time to identify trends and spot problems early.",
        isManual: false
    )

    public init() {}

    public func run() async -> DiagnosticResult {
        let sampleCount = 10
        let intervalSeconds = 1.0

        // --- Collect samples over time ---
        var cpuLoadSamples: [Double] = []
        var memorySamples: [Double] = []
        var temperatureSamples: [Double] = []
        var throughputSamples: [Double] = []
        var powerSamples: [Double] = []
        var thermalStates: [SystemSensors.ThermalState] = []
        var batterySamples: [(health: Double, cycleCount: Int)] = []

        let startNetIn = networkBytes(receive: true)
        let startNetOut = networkBytes(receive: false)

        // Prime the tick-delta load counter so the first sample is a real window.
        _ = currentCPULoad()
        try? await Task.sleep(nanoseconds: 300_000_000)

        for i in 0..<sampleCount {
            if i > 0 {
                try? await Task.sleep(nanoseconds: UInt64(intervalSeconds * 1_000_000_000))
            }

            cpuLoadSamples.append(currentCPULoad())
            memorySamples.append(memoryUsagePercent())
            if let temp = SystemSensors.temperatureCelsius() {
                temperatureSamples.append(temp)
            }
            throughputSamples.append(SystemSensors.throughputMOps(iterations: 1_000_000, samples: 3))
            if let watts = SystemSensors.powerWatts() {
                powerSamples.append(watts)
            }
            thermalStates.append(SystemSensors.thermalState())
            if let battery = readBatteryHealth() {
                batterySamples.append(battery)
            }
        }

        let endNetIn = networkBytes(receive: true)
        let endNetOut = networkBytes(receive: false)
        let netInRate = endNetIn - startNetIn
        let netOutRate = endNetOut - startNetOut

        // --- Analyze samples ---
        var metrics: [DiagnosticMetric] = []
        var status: DiagnosticStatus = .pass
        var issues: [String] = []

        // CPU Load
        let avgCPULoad = cpuLoadSamples.isEmpty ? 0 : cpuLoadSamples.reduce(0, +) / Double(cpuLoadSamples.count)
        let maxCPULoad = cpuLoadSamples.max() ?? 0
        metrics.append(DiagnosticMetric(name: "Avg CPU Load", value: "\(String(format: "%.1f", avgCPULoad))%"))
        metrics.append(DiagnosticMetric(name: "Peak CPU Load", value: "\(String(format: "%.1f", maxCPULoad))%"))
        metrics.append(DiagnosticMetric(name: "CPU Load Samples", value: "\(cpuLoadSamples.count) over \(sampleCount)s"))

        if maxCPULoad > 95 {
            if status == .pass { status = .warning }
            issues.append("CPU load spiked to \(String(format: "%.1f", maxCPULoad))% (near saturation)")
        }

        // Memory
        let avgMemory = memorySamples.isEmpty ? 0 : memorySamples.reduce(0, +) / Double(memorySamples.count)
        let maxMemory = memorySamples.max() ?? 0
        metrics.append(DiagnosticMetric(name: "Avg Memory Usage", value: "\(String(format: "%.1f", avgMemory))%"))
        metrics.append(DiagnosticMetric(name: "Peak Memory Usage", value: "\(String(format: "%.1f", maxMemory))%"))

        if maxMemory > 90 {
            if status == .pass { status = .warning }
            issues.append("Memory usage peaked at \(String(format: "%.1f", maxMemory))% — risk of swapping")
        }

        // Temperature (SoC/battery sensor — works without root)
        if !temperatureSamples.isEmpty {
            let avgTemp = temperatureSamples.reduce(0, +) / Double(temperatureSamples.count)
            let maxTemp = temperatureSamples.max() ?? 0
            let minTemp = temperatureSamples.min() ?? 0
            metrics.append(DiagnosticMetric(name: "Avg Temperature", value: "\(String(format: "%.1f", avgTemp))°C"))
            metrics.append(DiagnosticMetric(name: "Max Temperature", value: "\(String(format: "%.1f", maxTemp))°C"))
            metrics.append(DiagnosticMetric(name: "Min Temperature", value: "\(String(format: "%.1f", minTemp))°C"))
            metrics.append(DiagnosticMetric(name: "Temp Range", value: "\(String(format: "%.1f", maxTemp - minTemp))°C"))

            if maxTemp > 50 {
                status = .fail
                issues.append("Temperature reached \(String(format: "%.1f", maxTemp))°C — critical")
            } else if maxTemp > 40 {
                if status == .pass { status = .warning }
                issues.append("Temperature reached \(String(format: "%.1f", maxTemp))°C — elevated")
            }
        } else {
            metrics.append(DiagnosticMetric(name: "Temperature", value: "Sensor not available on this model"))
        }

        // Kernel thermal pressure (works on every Mac, unprivileged)
        let worstThermal = thermalStates.max { a, b in
            let order = SystemSensors.ThermalState.allCases
            return order.firstIndex(of: a)! < order.firstIndex(of: b)!
        } ?? .nominal
        metrics.append(DiagnosticMetric(name: "Thermal Pressure", value: worstThermal.rawValue))
        switch worstThermal {
        case .critical:
            status = .fail
            issues.append("Kernel reported CRITICAL thermal pressure")
        case .serious:
            if status == .pass { status = .warning }
            issues.append("Kernel reported HIGH thermal pressure")
        case .fair:
            if status == .pass { status = .warning }
            issues.append("Kernel reported elevated thermal pressure")
        case .nominal:
            break
        }

        // Effective CPU performance (fixed-work throughput; drops when throttled)
        if !throughputSamples.isEmpty {
            let avgTP = throughputSamples.reduce(0, +) / Double(throughputSamples.count)
            metrics.append(DiagnosticMetric(name: "Avg Performance", value: "\(String(format: "%.1f", avgTP)) Mops/s"))

            // Compare first-half average vs second-half average: sustained
            // decline indicates throttling. Single-sample spread is scheduler
            // noise and is deliberately not flagged.
            if throughputSamples.count >= 4 {
                let half = throughputSamples.count / 2
                let firstHalf = Array(throughputSamples.prefix(throughputSamples.count - half))
                let secondHalf = Array(throughputSamples.suffix(half))
                let avgFirst = firstHalf.reduce(0, +) / Double(firstHalf.count)
                let avgSecond = secondHalf.reduce(0, +) / Double(secondHalf.count)
                let decline = avgFirst > 0 ? (1.0 - avgSecond / avgFirst) * 100 : 0
                if decline >= 0 {
                    metrics.append(DiagnosticMetric(name: "Performance Stability", value: "\(String(format: "%.1f", decline))% decline"))
                    if decline > 40 {
                        if status == .pass { status = .warning }
                        issues.append("CPU performance declined \(String(format: "%.1f", decline))% over the monitoring period — possible throttling")
                    }
                } else {
                    metrics.append(DiagnosticMetric(name: "Performance Stability", value: "\(String(format: "%.1f", -decline))% improvement"))
                }
            } else {
                metrics.append(DiagnosticMetric(name: "Performance Stability", value: "—"))
            }
        }

        // Nominal frequency when the platform exposes it (Intel; nil on Apple Silicon)
        if let mhz = SystemSensors.cpuFrequencyMHz() {
            metrics.append(DiagnosticMetric(name: "Nominal CPU Frequency", value: "\(String(format: "%.0f", mhz)) MHz"))
        }

        // Power draw
        if !powerSamples.isEmpty {
            let avgW = powerSamples.reduce(0, +) / Double(powerSamples.count)
            let peakW = powerSamples.max() ?? 0
            metrics.append(DiagnosticMetric(name: "Avg Power Draw", value: "\(String(format: "%.1f", avgW)) W"))
            metrics.append(DiagnosticMetric(name: "Peak Power Draw", value: "\(String(format: "%.1f", peakW)) W"))
        }

        // Network throughput
        let netInMB = Double(netInRate) / (1024 * 1024)
        let netOutMB = Double(netOutRate) / (1024 * 1024)
        metrics.append(DiagnosticMetric(name: "Network Received", value: "\(String(format: "%.2f", netInMB)) MB"))
        metrics.append(DiagnosticMetric(name: "Network Sent", value: "\(String(format: "%.2f", netOutMB)) MB"))

        // Check for network activity
        if netInRate == 0 && netOutRate == 0 {
            metrics.append(DiagnosticMetric(name: "Network Activity", value: "No traffic detected"))
        } else {
            metrics.append(DiagnosticMetric(name: "Network Activity", value: "Active"))
        }

        // Battery health
        if let latest = batterySamples.last {
            metrics.append(DiagnosticMetric(name: "Battery Health", value: "\(String(format: "%.0f", latest.health))%"))
            metrics.append(DiagnosticMetric(name: "Cycle Count", value: "\(latest.cycleCount)"))

            if latest.health < 50 {
                status = .fail
                issues.append("Battery health at \(String(format: "%.0f", latest.health))% — replacement needed")
            } else if latest.health < 80 {
                if status == .pass { status = .warning }
                issues.append("Battery health at \(String(format: "%.0f", latest.health))% — degraded")
            }

            // Check for capacity degradation trend
            if batterySamples.count >= 3 {
                let firstHalf = batterySamples.prefix(batterySamples.count / 2).map(\.health)
                let secondHalf = batterySamples.suffix(batterySamples.count / 2).map(\.health)
                let avgFirst = firstHalf.reduce(0, +) / Double(firstHalf.count)
                let avgSecond = secondHalf.reduce(0, +) / Double(secondHalf.count)
                if avgSecond < avgFirst - 1 {
                    issues.append("Battery capacity showing downward trend during monitoring")
                    if status == .pass { status = .warning }
                }
            }
        } else {
            metrics.append(DiagnosticMetric(name: "Battery Health", value: "NOT AVAILABLE"))
        }

        // Sample-by-sample summary
        metrics.append(DiagnosticMetric(name: "Monitoring Duration", value: "\(sampleCount)s"))
        metrics.append(DiagnosticMetric(name: "Sampling Rate", value: "1 sample/sec"))

        // CPU load over time (compact sparkline-style)
        if !cpuLoadSamples.isEmpty {
            let sparkline = cpuLoadSamples.map { sample in
                let level = Int((sample / 100.0) * 5)
                return ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"][min(level, 7)]
            }.joined()
            metrics.append(DiagnosticMetric(name: "CPU Trend", value: sparkline))
        }

        // Temperature over time
        if !temperatureSamples.isEmpty {
            let sparkline = temperatureSamples.map { sample in
                let normalized = max(0, min(1, (sample - 15) / 35)) // 15-50°C sensor range
                let level = Int(normalized * 7)
                return ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"][min(level, 7)]
            }.joined()
            metrics.append(DiagnosticMetric(name: "Temp Trend", value: sparkline))
        }

        let summary: String
        if issues.isEmpty {
            summary = "System stable over \(sampleCount)s monitoring period. All indicators within normal range."
        } else {
            summary = issues.joined(separator: "; ")
        }

        return DiagnosticResult(
            kind: .monitor,
            status: status,
            summary: summary,
            metrics: metrics
        )
    }

    // MARK: - System Readings

    private func currentCPULoad() -> Double {
        SystemSensors.cpuLoadPercent()
    }

    private func memoryUsagePercent() -> Double {
        var stats = vm_statistics64()
        var count = mach_msg_type_number_t(MemoryLayout<vm_statistics64>.size / MemoryLayout<integer_t>.size)
        let result = withUnsafeMutablePointer(to: &stats) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics64(mach_host_self(), HOST_VM_INFO64, $0, &count)
            }
        }
        guard result == KERN_SUCCESS else { return 0 }

        let pageSize = UInt64(Sysctl.int("hw.pagesize") ?? Int(getpagesize()))
        let totalMemory = ProcessInfo.processInfo.physicalMemory
        let usedMemory = UInt64(stats.active_count + stats.wire_count) * pageSize

        return totalMemory > 0 ? (Double(usedMemory) / Double(totalMemory)) * 100 : 0
    }

    private func readBatteryHealth() -> (health: Double, cycleCount: Int)? {
        let readings = BatteryReader().read()
        guard let health = readings.healthPercent, health > 0, health <= 100 else { return nil }
        return (health, readings.cycleCount ?? 0)
    }

    private func networkBytes(receive: Bool) -> Int64 {
        let task = Process()
        task.launchPath = "/usr/sbin/netstat"
        task.arguments = ["-b", "-n"]

        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = Pipe()

        do {
            try task.run()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            task.waitUntilExit()

            guard let output = String(data: data, encoding: .utf8) else { return 0 }

            // Parse netstat output for bytes in/out
            // netstat -b shows "bytes in" and "bytes out" columns
            var total: Int64 = 0
            for line in output.components(separatedBy: "\n") {
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                let parts = trimmed.components(separatedBy: .whitespaces).filter { !$0.isEmpty }

                if parts.count >= 4 {
                    // Find numeric columns that could be byte counts
                    for (i, part) in parts.enumerated() {
                        if let val = Int64(part), val > 1000 {
                            // Heuristic: large numbers are byte counts
                            if i == 1 && !receive {
                                total += val
                            } else if i == 2 && receive {
                                total += val
                            }
                        }
                    }
                }
            }
            return total
        } catch {}

        return 0
    }
}
