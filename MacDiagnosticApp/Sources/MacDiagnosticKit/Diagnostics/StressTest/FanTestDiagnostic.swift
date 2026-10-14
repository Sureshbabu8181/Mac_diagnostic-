import Foundation
import Metal

/// Fan / cooling test: applies maximum simultaneous heat load (all-core CPU
/// + GPU compute + RAM churn) so the cooling system is forced to ramp the
/// fans to high speed, then observes temperature decay. Public macOS APIs do
/// not expose fan RPM, so the verdict is based on measured heat response
/// (temperature rise and kernel thermal pressure) plus the technician's
/// manual confirmation that fans are audibly spinning at high speed.
public struct FanTestDiagnostic: AutomatedDiagnosticProvider {
    public let meta = DiagnosticMeta(
        kind: .fanTest,
        title: "Fan Test",
        whyItMatters: "Sustains maximum combined CPU+GPU+RAM heat load to force the fans to high speed. Confirms the cooling system responds: temperature must rise under load and fall during cooldown. Fan RPM is not readable via public APIs — confirm audibly that fans spin up.",
        isManual: false
    )

    public init() {}

    public func run() async -> DiagnosticResult {
        let fast = ProcessInfo.processInfo.environment["MACDIAG_SELFTEST"] != nil
        let loadDuration = fast ? 5 : 60
        let cooldownDuration = fast ? 1 : 5
        let cores = ProcessInfo.processInfo.activeProcessorCount

        // MARK: Baseline
        try? await Task.sleep(nanoseconds: 500_000_000)
        let baselineTemp = SystemSensors.temperatureCelsius()
        let baselineThermal = SystemSensors.thermalState()

        let log = FanSampleLog()
        let sampler = Task {
            while !Task.isCancelled {
                log.record(
                    temp: SystemSensors.temperatureCelsius(),
                    load: SystemSensors.cpuLoadPercent(),
                    power: SystemSensors.powerWatts(),
                    thermal: SystemSensors.thermalState()
                )
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }

        // MARK: Full heat load — CPU + GPU + RAM simultaneously
        log.begin()
        async let cpu = runCPUStress(cores: cores, duration: loadDuration)
        async let gpu = runGPUStress(duration: loadDuration)
        async let ram = runRAMChurn(megabytes: 512, duration: loadDuration)
        let (cpuResult, gpuResult, ramResult) = await (cpu, gpu, ram)

        // MARK: Cooldown — fans should keep pulling temperature down
        try? await Task.sleep(nanoseconds: UInt64(cooldownDuration) * 1_000_000_000)
        log.end()
        sampler.cancel()
        let cooldownTemp = SystemSensors.temperatureCelsius()
        let afterThermal = SystemSensors.thermalState()
        let stats = log.stats

        // MARK: Report
        var metrics: [DiagnosticMetric] = []
        var status: DiagnosticStatus = .pass
        var issues: [String] = []

        metrics.append(DiagnosticMetric(name: "Heat Load", value: "\(loadDuration)s max combined CPU + GPU + RAM"))
        metrics.append(DiagnosticMetric(name: "Cooldown Observation", value: "\(cooldownDuration)s"))
        if let avg = stats.avgLoad {
            metrics.append(DiagnosticMetric(name: "Avg CPU Load Under Load", value: "\(String(format: "%.1f", avg))%"))
        }
        if let max = stats.maxLoad {
            metrics.append(DiagnosticMetric(name: "Peak CPU Load", value: "\(String(format: "%.1f", max))%"))
            if max < 80 {
                if status == .pass { status = .warning }
                issues.append("Peak CPU load only \(String(format: "%.0f", max))% — heat load incomplete")
            }
        }
        if let b = baselineTemp {
            metrics.append(DiagnosticMetric(name: "Baseline Temperature", value: "\(String(format: "%.1f", b))°C"))
        }
        if let peak = stats.peakTemp {
            metrics.append(DiagnosticMetric(name: "Peak Temperature", value: "\(String(format: "%.1f", peak))°C"))
        }
        if let c = cooldownTemp {
            metrics.append(DiagnosticMetric(name: "Cooldown Temperature", value: "\(String(format: "%.1f", c))°C"))
        }
        if let b = baselineTemp, let peak = stats.peakTemp {
            let rise = peak - b
            metrics.append(DiagnosticMetric(name: "Temperature Rise Under Load", value: "+\(String(format: "%.1f", rise))°C"))
            if let peakT = stats.peakTemp, let c = cooldownTemp, peakT > c {
                metrics.append(DiagnosticMetric(name: "Heat Removed After Load", value: "-\(String(format: "%.1f", peakT - c))°C"))
            }
            if rise < 3.0 {
                status = .warning
                issues.append("Temperature rose only +\(String(format: "%.1f", rise))°C under full load — machine stayed cold; fans may never engage. Verify cooling manually.")
            }
        } else {
            metrics.append(DiagnosticMetric(name: "Temperature", value: "Sensor not available on this model — verify fans manually"))
            if status == .pass { status = .warning }
            issues.append("No temperature sensor — fan response cannot be measured; listen for fan spin-up manually")
        }

        let worstThermal = stats.worstThermal ?? baselineThermal
        metrics.append(DiagnosticMetric(name: "Thermal Pressure (peak)", value: worstThermal.rawValue))
        metrics.append(DiagnosticMetric(name: "Thermal Pressure (after)", value: afterThermal.rawValue))
        switch worstThermal {
        case .critical:
            status = .fail
            issues.append("Kernel reported CRITICAL thermal pressure — cooling insufficient for sustained load")
        case .serious:
            if status == .pass { status = .warning }
            issues.append("Kernel reported HIGH thermal pressure during load")
        case .fair, .nominal:
            break
        }

        if let peakW = stats.peakPower {
            metrics.append(DiagnosticMetric(name: "Peak Power Draw", value: "\(String(format: "%.1f", peakW)) W"))
        }
        metrics.append(DiagnosticMetric(name: "CPU Compute Errors", value: cpuResult == 0 ? "None" : "\(cpuResult)"))
        metrics.append(DiagnosticMetric(name: "GPU Workloads", value: "\(gpuResult.dispatches) (\(gpuResult.errors) errors)"))
        metrics.append(DiagnosticMetric(name: "RAM Churn", value: "\(ramResult) MB pattern cycles"))
        metrics.append(DiagnosticMetric(name: "Fan RPM", value: "NOT AVAILABLE — not exposed by public macOS APIs"))
        metrics.append(DiagnosticMetric(name: "Manual Step", value: "Confirm fans audibly spin up to high speed during the load phase"))

        if cpuResult > 0 {
            status = .fail
            issues.append("\(cpuResult) CPU computation error(s) during heat load")
        }

        let summary: String
        if issues.isEmpty {
            var parts = ["Full heat load applied — fans should have ramped to high speed"]
            if let rise = stats.peakTemp, let b = baselineTemp {
                parts.append("temperature rose +\(String(format: "%.1f", rise - b))°C")
            }
            if let peakT = stats.peakTemp, let c = cooldownTemp, peakT > c {
                parts.append("fell \(String(format: "%.1f", peakT - c))°C after load")
            }
            parts.append("confirm fan spin audibly (manual)")
            summary = parts.joined(separator: ", ") + "."
        } else {
            summary = issues.joined(separator: "; ")
        }

        return DiagnosticResult(kind: .fanTest, status: status, summary: summary, metrics: metrics)
    }

    // MARK: - Heat load workers

    private func runCPUStress(cores: Int, duration: Int) async -> Int {
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let group = DispatchGroup()
                let errorBox = HeatErrorBox()
                for _ in 0..<cores {
                    group.enter()
                    DispatchQueue.global(qos: .userInitiated).async {
                        let deadline = Date().addingTimeInterval(Double(duration))
                        var localErrors = 0
                        while Date() < deadline {
                            var checksum: Double = 0
                            var acc: UInt64 = 1442695040888963407
                            for k in 0..<150_000 {
                                let x = Double(k)
                                checksum += sin(x) * cos(x) + sqrt(abs(x))
                                acc = acc &* 6364136223846793005 &+ 1
                            }
                            if checksum.isNaN || acc == UInt64.max { localErrors += 1 }
                        }
                        errorBox.add(localErrors)
                        group.leave()
                    }
                }
                group.wait()
                continuation.resume(returning: errorBox.value)
            }
        }
    }

    private final class HeatErrorBox: @unchecked Sendable {
        private let lock = NSLock()
        private var total = 0
        func add(_ n: Int) { lock.lock(); total += n; lock.unlock() }
        var value: Int { lock.lock(); defer { lock.unlock() }; return total }
    }

    private struct HeatGPUResult {
        let dispatches: Int
        let errors: Int
    }

    private func runGPUStress(duration: Int) async -> HeatGPUResult {
        guard let device = MTLCreateSystemDefaultDevice(),
              let queue = device.makeCommandQueue() else {
            return HeatGPUResult(dispatches: 0, errors: 0)
        }
        let source = """
        #include <metal_stdlib>
        using namespace metal;
        kernel void heat(device float *out [[buffer(0)]], constant uint &n [[buffer(1)]], uint id [[thread_position_in_grid]]) {
            if (id >= n) return;
            float acc = 0.0;
            for (int i = 0; i < 4000; i++) { acc += sin(float(id) * 0.001 + float(i)) * cos(float(i) * 0.002); }
            out[id] = acc;
        }
        """
        do {
            let library = try await device.makeLibrary(source: source, options: nil)
            guard let fn = library.makeFunction(name: "heat") else { return HeatGPUResult(dispatches: 0, errors: 1) }
            let pipeline = try await device.makeComputePipelineState(function: fn)
            let grid = 1 << 20
            guard let buf = device.makeBuffer(length: grid * MemoryLayout<Float>.stride, options: .storageModeShared),
                  let nBuf = device.makeBuffer(length: MemoryLayout<UInt32>.stride, options: .storageModeShared) else {
                return HeatGPUResult(dispatches: 0, errors: 1)
            }
            nBuf.contents().storeBytes(of: UInt32(grid), as: UInt32.self)
            let tg = MTLSize(width: min(pipeline.maxTotalThreadsPerThreadgroup, 256), height: 1, depth: 1)
            let g = MTLSize(width: grid, height: 1, depth: 1)
            let deadline = Date().addingTimeInterval(Double(duration))
            var dispatches = 0
            var errors = 0
            while Date() < deadline {
                var inFlight: [MTLCommandBuffer] = []
                for _ in 0..<4 {
                    guard let cb = queue.makeCommandBuffer(),
                          let enc = cb.makeComputeCommandEncoder() else { errors += 1; continue }
                    enc.setComputePipelineState(pipeline)
                    enc.setBuffer(buf, offset: 0, index: 0)
                    enc.setBuffer(nBuf, offset: 0, index: 1)
                    enc.dispatchThreads(g, threadsPerThreadgroup: tg)
                    enc.endEncoding()
                    cb.commit()
                    inFlight.append(cb)
                }
                for cb in inFlight {
                    _ = await cb.completed
                    if cb.status == .error { errors += 1 }
                    dispatches += 1
                }
            }
            return HeatGPUResult(dispatches: dispatches, errors: errors)
        } catch {
            return HeatGPUResult(dispatches: 0, errors: 1)
        }
    }

    private func runRAMChurn(megabytes: Int, duration: Int) async -> Int {
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let size = megabytes * 1024 * 1024
                let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: size)
                defer { buffer.deallocate() }
                let deadline = Date().addingTimeInterval(Double(duration))
                var cycles = 0
                while Date() < deadline {
                    for i in 0..<size { buffer[i] = UInt8(truncatingIfNeeded: i &* 31 &+ 17) }
                    cycles += 1
                }
                continuation.resume(returning: cycles * megabytes)
            }
        }
    }

    // MARK: - Sample log

    private final class FanSampleLog: @unchecked Sendable {
        private let lock = NSLock()
        private var active = false
        private var temps: [Double] = []
        private var loads: [Double] = []
        private var powers: [Double] = []
        private var thermals: [SystemSensors.ThermalState] = []

        func begin() { lock.lock(); active = true; lock.unlock() }
        func end() { lock.lock(); active = false; lock.unlock() }

        func record(temp: Double?, load: Double, power: Double?, thermal: SystemSensors.ThermalState) {
            lock.lock(); defer { lock.unlock() }
            guard active else { return }
            if let temp { temps.append(temp) }
            loads.append(load)
            if let power { powers.append(power) }
            thermals.append(thermal)
        }

        var stats: (avgLoad: Double?, maxLoad: Double?, peakTemp: Double?, peakPower: Double?, worstThermal: SystemSensors.ThermalState?) {
            lock.lock(); defer { lock.unlock() }
            let order: [SystemSensors.ThermalState] = [.nominal, .fair, .serious, .critical]
            return (
                loads.isEmpty ? nil : loads.reduce(0, +) / Double(loads.count),
                loads.max(),
                temps.max(),
                powers.max(),
                thermals.max { a, b in (order.firstIndex(of: a) ?? 0) < (order.firstIndex(of: b) ?? 0) }
            )
        }
    }
}
