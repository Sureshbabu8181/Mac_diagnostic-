import Foundation
import Metal

/// Multi-phase stress test that applies maximum simultaneous load and
/// reports on every measurable aspect of system stability:
///
/// Phase A — all-core CPU saturation
/// Phase B — maximum combined load (CPU + GPU + RAM churn in parallel)
/// Phase C — cooldown observation
///
/// Sampled throughout: CPU load, SoC/battery temperature, kernel thermal
/// pressure, battery power draw. Performance is measured as fixed-work
/// throughput (baseline vs. under load) to detect throttling without
/// needing privileged frequency counters.
public struct StressTestDiagnostic: AutomatedDiagnosticProvider {
    public let meta = DiagnosticMeta(
        kind: .stressTest,
        title: "Stress Test",
        whyItMatters: "Pushes CPU, GPU, and RAM to maximum simultaneous load to validate stability, detect thermal throttling, and surface performance problems after overclocking, new builds, or cooling changes.",
        isManual: false
    )

    public init() {}

    // Phase durations (seconds)
    private let cpuPhaseDuration = 6
    private let maxPhaseDuration = 12
    private let cooldownDuration = 5

    public func run() async -> DiagnosticResult {
        let cores = ProcessInfo.processInfo.activeProcessorCount

        // MARK: Baseline
        // Prime the tick-delta load counter, then sample over a short window.
        _ = SystemSensors.cpuLoadPercent()
        try? await Task.sleep(nanoseconds: 300_000_000)
        let baselineTemp = SystemSensors.temperatureCelsius()
        let baselineThermal = SystemSensors.thermalState()
        let baselinePower = SystemSensors.powerWatts()
        let baselineLoad = SystemSensors.cpuLoadPercent()
        let baselineThroughput = SystemSensors.throughputMOps(samples: 3)

        let log = SampleLog()
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

        // MARK: Phase A — all-core CPU saturation
        log.begin()
        let cpuOnly = await runCPUStress(cores: cores, duration: cpuPhaseDuration)

        // MARK: Phase B — maximum combined load (CPU + GPU + RAM at once)
        async let cpuMax = runCPUStress(cores: cores, duration: maxPhaseDuration)
        async let gpuMax = runGPUStress(duration: maxPhaseDuration)
        async let ramMax = runRAMStress(megabytes: 256, duration: maxPhaseDuration)
        let (cpuMaxResult, gpuResult, ramResult) = await (cpuMax, gpuMax, ramMax)

        // Performance under peak heat — measured immediately after max load.
        let underLoadThroughput = SystemSensors.throughputMOps(samples: 3)

        // MARK: Phase C — cooldown
        try? await Task.sleep(nanoseconds: UInt64(cooldownDuration) * 1_000_000_000)
        log.end()
        sampler.cancel()

        let afterTemp = SystemSensors.temperatureCelsius()
        let afterThermal = SystemSensors.thermalState()

        // MARK: VRAM pattern integrity
        let vramResult = runVRAMTest(megabytes: 64)

        // MARK: RAM bandwidth (measured after cooldown so contention doesn't skew it)
        let bandwidth = measureRAMBandwidth(megabytes: 128)

        let stats = log.stats

        // MARK: Evaluate report
        var metrics: [DiagnosticMetric] = []
        var status: DiagnosticStatus = .pass
        var issues: [String] = []

        // --- Load achieved ---
        metrics.append(DiagnosticMetric(name: "CPU Cores Saturated", value: "\(cores)"))
        metrics.append(DiagnosticMetric(name: "Phase A · CPU Load", value: "\(cpuPhaseDuration)s all-core"))
        metrics.append(DiagnosticMetric(name: "Phase B · Max Combined", value: "\(maxPhaseDuration)s CPU+GPU+RAM"))
        metrics.append(DiagnosticMetric(name: "Phase C · Cooldown", value: "\(cooldownDuration)s"))
        metrics.append(DiagnosticMetric(name: "Baseline CPU Load", value: "\(String(format: "%.1f", baselineLoad))%"))
        if let avg = stats.avgLoad {
            metrics.append(DiagnosticMetric(name: "Avg CPU Load Under Stress", value: "\(String(format: "%.1f", avg))%"))
        }
        if let max = stats.maxLoad {
            metrics.append(DiagnosticMetric(name: "Peak CPU Load", value: "\(String(format: "%.1f", max))%"))
            if max < 80 {
                if status == .pass { status = .warning }
                issues.append("Peak CPU load only \(String(format: "%.0f", max))% — cores not fully saturated")
            }
        }

        // --- Performance / throttling ---
        metrics.append(DiagnosticMetric(name: "Baseline Throughput", value: "\(String(format: "%.1f", baselineThroughput)) Mops/s"))
        metrics.append(DiagnosticMetric(name: "Throughput Under Load", value: "\(String(format: "%.1f", underLoadThroughput)) Mops/s"))
        if baselineThroughput > 0 {
            let retention = underLoadThroughput / baselineThroughput * 100
            metrics.append(DiagnosticMetric(name: "Performance Retention", value: "\(String(format: "%.1f", retention))%"))
            if retention < 50 {
                status = .fail
                issues.append("Performance collapsed to \(String(format: "%.0f", retention))% under load — severe throttling")
            } else if retention < 80 {
                if status == .pass { status = .warning }
                issues.append("Performance dropped to \(String(format: "%.0f", retention))% under load (thermal throttling)")
            }
        }

        // --- Frequency (Intel only; Apple Silicon has no frequency sysctl) ---
        if let mhz = SystemSensors.cpuFrequencyMHz() {
            metrics.append(DiagnosticMetric(name: "Nominal CPU Frequency", value: "\(String(format: "%.0f", mhz)) MHz"))
        }

        // --- Temperature ---
        if let baseT = baselineTemp {
            metrics.append(DiagnosticMetric(name: "Baseline Temperature", value: "\(String(format: "%.1f", baseT))°C"))
        }
        if let peakT = stats.peakTemp {
            metrics.append(DiagnosticMetric(name: "Peak Temperature", value: "\(String(format: "%.1f", peakT))°C"))
        }
        if let baseT = baselineTemp, let peakT = stats.peakTemp {
            let rise = peakT - baseT
            metrics.append(DiagnosticMetric(name: "Temperature Rise", value: "+\(String(format: "%.1f", rise))°C"))
            if rise > 10 {
                if status == .pass { status = .warning }
                issues.append("Temperature rose \(String(format: "%.1f", rise))°C under load")
            }
        }
        if let afterT = afterTemp {
            metrics.append(DiagnosticMetric(name: "Cooldown Temperature", value: "\(String(format: "%.1f", afterT))°C"))
            if let peakT = stats.peakTemp, peakT > 0 {
                let delta = peakT - afterT
                metrics.append(DiagnosticMetric(name: "Thermal Cooldown", value: "\(String(format: "%.1f", delta))°C"))
                if delta < 1.0, peakT >= 32 {
                    if status == .pass { status = .warning }
                    issues.append("Poor thermal cooldown — temperature barely dropped after load")
                }
            }
        } else {
            metrics.append(DiagnosticMetric(name: "Temperature", value: "Sensor not available on this model"))
        }

        // --- Kernel thermal pressure ---
        let worstThermal = stats.worstThermal ?? baselineThermal
        metrics.append(DiagnosticMetric(name: "Thermal Pressure (peak)", value: worstThermal.rawValue))
        metrics.append(DiagnosticMetric(name: "Thermal Pressure (after)", value: afterThermal.rawValue))
        switch worstThermal {
        case .critical:
            status = .fail
            issues.append("Kernel reported CRITICAL thermal pressure during load")
        case .serious:
            if status == .pass { status = .warning }
            issues.append("Kernel reported HIGH thermal pressure during load")
        case .fair:
            if status == .pass { status = .warning }
            issues.append("Kernel reported elevated thermal pressure during load")
        case .nominal:
            break
        }

        // --- Power draw ---
        if let baseW = baselinePower {
            metrics.append(DiagnosticMetric(name: "Baseline Power Draw", value: "\(String(format: "%.1f", baseW)) W"))
        }
        if let peakW = stats.peakPower {
            metrics.append(DiagnosticMetric(name: "Peak Power Draw", value: "\(String(format: "%.1f", peakW)) W"))
        }

        // --- CPU correctness ---
        let totalCPErrors = cpuOnly.errors + cpuMaxResult.errors
        metrics.append(DiagnosticMetric(name: "CPU Compute Errors", value: totalCPErrors == 0 ? "None" : "\(totalCPErrors)"))
        if totalCPErrors > 0 {
            status = .fail
            issues.append("\(totalCPErrors) CPU computation error(s) detected")
        }

        // --- GPU ---
        metrics.append(DiagnosticMetric(name: "GPU Dispatches", value: "\(gpuResult.dispatches)"))
        metrics.append(DiagnosticMetric(name: "GPU Errors", value: gpuResult.errors == 0 ? "None" : "\(gpuResult.errors)"))
        if gpuResult.errors > 0 {
            status = .fail
            issues.append("\(gpuResult.errors) GPU workload error(s) detected")
        }

        // --- RAM ---
        if ramResult.sizeMB > 0 {
            metrics.append(DiagnosticMetric(name: "RAM Tested", value: "\(ramResult.sizeMB) MB × \(ramResult.cycles) cycles"))
            metrics.append(DiagnosticMetric(name: "RAM Write Bandwidth", value: "\(String(format: "%.1f", bandwidth.writeGBps)) GB/s"))
            metrics.append(DiagnosticMetric(name: "RAM Read Bandwidth", value: "\(String(format: "%.1f", bandwidth.readGBps)) GB/s"))
            metrics.append(DiagnosticMetric(name: "RAM Pattern Errors", value: ramResult.errors == 0 ? "None" : "\(ramResult.errors)"))
            if ramResult.errors > 0 {
                status = .fail
                issues.append("RAM pattern verification failed — memory integrity problem")
            }
        } else {
            metrics.append(DiagnosticMetric(name: "RAM Stress", value: "Allocation failed"))
        }

        // --- VRAM ---
        metrics.append(DiagnosticMetric(name: "VRAM Pattern Test", value: vramResult.passed ? "PASS" : "FAIL"))
        metrics.append(DiagnosticMetric(name: "VRAM Size Tested", value: "\(vramResult.sizeMB) MB"))
        if !vramResult.passed {
            status = .fail
            issues.append("VRAM pattern verification failed — potential GPU memory problem")
        }

        let summary: String
        if issues.isEmpty {
            var parts = ["System stable under maximum combined load"]
            if baselineThroughput > 0 {
                let retention = underLoadThroughput / baselineThroughput * 100
                parts.append("performance retention \(String(format: "%.0f", retention))%")
            }
            if let peakT = stats.peakTemp {
                parts.append("peak \(String(format: "%.1f", peakT))°C")
            }
            parts.append("no throttling or errors detected")
            summary = parts.joined(separator: ", ") + "."
        } else {
            summary = issues.joined(separator: "; ")
        }

        return DiagnosticResult(
            kind: .stressTest,
            status: status,
            summary: summary,
            metrics: metrics
        )
    }

    // MARK: - CPU Stress

    private struct CPUStressResult {
        let errors: Int
    }

    private func runCPUStress(cores: Int, duration: Int) async -> CPUStressResult {
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let group = DispatchGroup()
                let errorLock = NSLock()
                let totalErrorsBox = ErrorBox()

                for _ in 0..<cores {
                    group.enter()
                    DispatchQueue.global(qos: .userInitiated).async {
                        let deadline = Date().addingTimeInterval(Double(duration))
                        var localErrors = 0
                        var i: UInt64 = 0
                        while Date() < deadline {
                            // Mixed integer + floating-point saturation.
                            var checksum: Double = 0
                            var acc: UInt64 = i &* 6364136223846793005 &+ 1442695040888963407
                            for k in 0..<150_000 {
                                let x = Double(k)
                                checksum += sin(x) * cos(x) + sqrt(abs(x))
                                acc = acc &* 6364136223846793005 &+ 1442695040888963407
                                acc ^= acc >> 33
                            }
                            if checksum.isNaN || checksum.isInfinite {
                                localErrors += 1
                            }
                            if acc == UInt64.max {
                                localErrors += 1
                            }
                            i &+= 1
                        }
                        errorLock.lock()
                        totalErrorsBox.value += localErrors
                        errorLock.unlock()
                        group.leave()
                    }
                }
                group.wait()
                continuation.resume(returning: CPUStressResult(errors: totalErrorsBox.value))
            }
        }
    }

    private final class ErrorBox: @unchecked Sendable {
        var value: Int = 0
    }

    // MARK: - GPU Stress (Metal)

    private struct GPUStressResult {
        let dispatches: Int
        let errors: Int
    }

    private func runGPUStress(duration: Int) async -> GPUStressResult {
        guard let device = MTLCreateSystemDefaultDevice() else {
            return GPUStressResult(dispatches: 0, errors: 0)
        }
        guard let queue = device.makeCommandQueue() else {
            return GPUStressResult(dispatches: 0, errors: 1)
        }

        let shaderSource = """
        #include <metal_stdlib>
        using namespace metal;

        kernel void stress_test(device float *output [[buffer(0)]],
                                constant uint &n [[buffer(1)]],
                                uint id [[thread_position_in_grid]]) {
            if (id >= n) { return; }
            float x = float(id);
            float acc = 0.0;
            for (int i = 0; i < 3000; i++) {
                acc += sin(x * 0.001 + float(i)) * cos(x * 0.002 + float(i));
            }
            output[id] = acc;
        }
        """

        do {
            let library = try await device.makeLibrary(source: shaderSource, options: nil)
            guard let function = library.makeFunction(name: "stress_test") else {
                return GPUStressResult(dispatches: 0, errors: 1)
            }
            let pipeline = try await device.makeComputePipelineState(function: function)

            let gridSize = 1 << 20 // 1M threads
            let bufferSize = gridSize * MemoryLayout<Float>.stride
            guard let buffer = device.makeBuffer(length: bufferSize, options: .storageModeShared),
                  let nBuffer = device.makeBuffer(length: MemoryLayout<UInt32>.stride, options: .storageModeShared) else {
                return GPUStressResult(dispatches: 0, errors: 1)
            }
            nBuffer.contents().storeBytes(of: UInt32(gridSize), as: UInt32.self)

            let threadgroupSize = MTLSize(width: min(pipeline.maxTotalThreadsPerThreadgroup, 256), height: 1, depth: 1)
            let gridSizeArg = MTLSize(width: gridSize, height: 1, depth: 1)

            let deadline = Date().addingTimeInterval(Double(duration))
            var dispatches = 0
            var errors = 0

            // Keep several command buffers in flight so the GPU stays saturated.
            while Date() < deadline {
                var inFlight: [MTLCommandBuffer] = []
                for _ in 0..<4 {
                    guard let commandBuffer = queue.makeCommandBuffer(),
                          let encoder = commandBuffer.makeComputeCommandEncoder() else {
                        errors += 1
                        continue
                    }
                    encoder.setComputePipelineState(pipeline)
                    encoder.setBuffer(buffer, offset: 0, index: 0)
                    encoder.setBuffer(nBuffer, offset: 0, index: 1)
                    encoder.dispatchThreads(gridSizeArg, threadsPerThreadgroup: threadgroupSize)
                    encoder.endEncoding()
                    commandBuffer.commit()
                    inFlight.append(commandBuffer)
                }
                for cb in inFlight {
                    _ = await cb.completed
                    if cb.status == .error { errors += 1 }
                    dispatches += 1
                }
            }

            // Spot-check output values are finite (shader correctness).
            let floats = buffer.contents().bindMemory(to: Float.self, capacity: gridSize)
            for i in stride(from: 0, to: gridSize, by: 65536) {
                if !floats[i].isFinite { errors += 1 }
            }

            return GPUStressResult(dispatches: dispatches, errors: errors)
        } catch {
            return GPUStressResult(dispatches: 0, errors: 1)
        }
    }

    // MARK: - RAM Stress

    private struct RAMStressResult {
        let sizeMB: Int
        let cycles: Int
        let errors: Int
    }

    /// Memory-churn loop run concurrently with CPU+GPU load: writes a pattern
    /// and verifies it until the deadline, counting integrity errors.
    private func runRAMStress(megabytes: Int, duration: Int) async -> RAMStressResult {
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let size = megabytes * 1024 * 1024
                let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: size)
                defer { buffer.deallocate() }

                let deadline = Date().addingTimeInterval(Double(duration))
                var errors = 0
                var cycles = 0

                while Date() < deadline {
                    for i in 0..<size {
                        buffer[i] = UInt8(truncatingIfNeeded: i &* 31 &+ 17)
                    }
                    for i in 0..<size {
                        if buffer[i] != UInt8(truncatingIfNeeded: i &* 31 &+ 17) {
                            errors += 1
                            if errors > 100 { break }
                        }
                    }
                    if errors > 100 { break }
                    cycles += 1
                }

                continuation.resume(returning: RAMStressResult(
                    sizeMB: megabytes,
                    cycles: cycles,
                    errors: errors
                ))
            }
        }
    }

    /// Clean write/read bandwidth measurement (runs after cooldown).
    private struct RAMBandwidth {
        let writeGBps: Double
        let readGBps: Double
    }

    private func measureRAMBandwidth(megabytes: Int) -> RAMBandwidth {
        let size = megabytes * 1024 * 1024
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: size)
        defer { buffer.deallocate() }

        var checksum: UInt64 = 0
        let wStart = DispatchTime.now()
        for i in 0..<size {
            buffer[i] = UInt8(truncatingIfNeeded: i &* 31 &+ 17)
        }
        let wSec = Double(DispatchTime.now().uptimeNanoseconds - wStart.uptimeNanoseconds) / 1e9

        let rStart = DispatchTime.now()
        for i in 0..<size {
            checksum &+= UInt64(buffer[i])
        }
        let rSec = Double(DispatchTime.now().uptimeNanoseconds - rStart.uptimeNanoseconds) / 1e9

        if checksum == UInt64.max { return RAMBandwidth(writeGBps: 0, readGBps: 0) }

        let gb = Double(size) / 1_000_000_000
        return RAMBandwidth(
            writeGBps: wSec > 0 ? gb / wSec : 0,
            readGBps: rSec > 0 ? gb / rSec : 0
        )
    }

    // MARK: - VRAM Test

    private struct VRAMResult {
        let passed: Bool
        let sizeMB: Int
    }

    private func runVRAMTest(megabytes: Int) -> VRAMResult {
        guard let device = MTLCreateSystemDefaultDevice() else {
            return VRAMResult(passed: false, sizeMB: 0)
        }

        let testSize = megabytes * 1024 * 1024
        guard let buffer = device.makeBuffer(length: testSize, options: .storageModeShared) else {
            return VRAMResult(passed: false, sizeMB: 0)
        }

        let ptr = buffer.contents().bindMemory(to: UInt8.self, capacity: testSize)

        for i in 0..<testSize {
            ptr[i] = UInt8(truncatingIfNeeded: i & 0xFF)
        }

        var mismatches = 0
        for i in 0..<testSize {
            if ptr[i] != UInt8(truncatingIfNeeded: i & 0xFF) {
                mismatches += 1
                if mismatches > 10 { break }
            }
        }

        return VRAMResult(passed: mismatches == 0, sizeMB: megabytes)
    }

    // MARK: - Sample Log

    /// Thread-safe collector for per-second sensor samples during load phases.
    private final class SampleLog: @unchecked Sendable {
        private let lock = NSLock()
        private var active = false
        private var temps: [Double] = []
        private var loads: [Double] = []
        private var powers: [Double] = []
        private var thermals: [SystemSensors.ThermalState] = []

        func begin() {
            lock.lock(); active = true; lock.unlock()
        }

        func end() {
            lock.lock(); active = false; lock.unlock()
        }

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
            let avgLoad = loads.isEmpty ? nil : loads.reduce(0, +) / Double(loads.count)
            let maxLoad = loads.max()
            let peakTemp = temps.max()
            let peakPower = powers.max()
            let worst = thermals.max { a, b in
                let order: [SystemSensors.ThermalState] = [.nominal, .fair, .serious, .critical]
                return order.firstIndex(of: a)! < order.firstIndex(of: b)!
            }
            return (avgLoad, maxLoad, peakTemp, peakPower, worst)
        }
    }
}
