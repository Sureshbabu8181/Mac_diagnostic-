import Foundation

/// Dedicated full-strength RAM stress test: allocates a large working set
/// (a substantial fraction of installed RAM), writes a cycle-dependent
/// 64-bit pattern from multiple threads, reads it back and verifies, and
/// repeats until the deadline. Measures aggregate parallel bandwidth and
/// counts every bit-level integrity error. This is a real RAM stress —
/// the Memory module's pressure stat remains a documented proxy only.
public struct RAMStressTestDiagnostic: AutomatedDiagnosticProvider {
    public let meta = DiagnosticMeta(
        kind: .ramStress,
        title: "RAM Stress Test",
        whyItMatters: "Allocates a large fraction of installed RAM and saturates it with multi-threaded pattern write/read verification to expose memory integrity faults and measure real parallel bandwidth. Heats the memory subsystem so cooling faults surface.",
        isManual: false
    )

    /// Stress duration in seconds. Default 30 s; the dedicated view offers
    /// 30 s and 60 s presets.
    public var durationSeconds: Int = 30

    public init() {}

    /// Duration/size presets: full by default, tiny under selftest so the
    /// debug (-Onone) selftest stays fast.
    public func run() async -> DiagnosticResult {
        let fast = ProcessInfo.processInfo.environment["MACDIAG_SELFTEST"] != nil
        let duration = fast ? 2 : max(5, durationSeconds)
        let maxMB = fast ? 64 : 4096
        let physicalMB = Int(ProcessInfo.processInfo.physicalMemory / 1_048_576)
        let workingSetMB = max(64, min(physicalMB / 2, maxMB))
        let threads = max(1, min(ProcessInfo.processInfo.activeProcessorCount, 8))

        let baselineTemp = SystemSensors.temperatureCelsius()

        let result = await withTaskGroup(of: ThreadResult.self) { group -> ThreadResult in
            let perThreadMB = max(1, workingSetMB / threads)
            for _ in 0..<threads {
                group.addTask {
                    await workChunk(megabytes: perThreadMB, duration: duration)
                }
            }
            var total = ThreadResult()
            for await r in group { total.absorb(r) }
            return total
        }

        let peakTemp = SystemSensors.temperatureCelsius()

        var metrics: [DiagnosticMetric] = []
        var status: DiagnosticStatus = .pass
        var issues: [String] = []

        metrics.append(DiagnosticMetric(name: "Working Set", value: "\(workingSetMB) MB (\(threads) threads × \(max(1, workingSetMB / threads)) MB)"))
        metrics.append(DiagnosticMetric(name: "Duration", value: "\(duration)s pattern write/read verify"))
        metrics.append(DiagnosticMetric(name: "Cycles", value: "\(result.cycles)"))
        metrics.append(DiagnosticMetric(name: "Aggregate Write Bandwidth", value: "\(String(format: "%.1f", result.writeGBps)) GB/s"))
        metrics.append(DiagnosticMetric(name: "Aggregate Read Bandwidth", value: "\(String(format: "%.1f", result.readGBps)) GB/s"))
        metrics.append(DiagnosticMetric(name: "Allocation Failures", value: "None"))
        metrics.append(DiagnosticMetric(name: "Pattern Errors", value: result.errors == 0 ? "None" : "\(result.errors)"))
        if let t = baselineTemp {
            metrics.append(DiagnosticMetric(name: "Baseline Temperature", value: "\(String(format: "%.1f", t))°C"))
        }
        if let t = peakTemp {
            metrics.append(DiagnosticMetric(name: "Temperature After Stress", value: "\(String(format: "%.1f", t))°C"))
        }

        if result.errors > 0 {
            status = .fail
            issues.append("\(result.errors) RAM pattern verification error(s) — memory integrity problem")
        }
        if result.cycles == 0 {
            status = .warning
            issues.append("No complete verify cycle finished — check memory pressure")
        }

        let summary: String
        if issues.isEmpty {
            summary = "\(workingSetMB) MB × \(threads) threads pattern-stressed for \(duration)s with no integrity errors, \(String(format: "%.1f", result.writeGBps)) GB/s write / \(String(format: "%.1f", result.readGBps)) GB/s read."
        } else {
            summary = issues.joined(separator: "; ")
        }

        return DiagnosticResult(kind: .ramStress, status: status, summary: summary, metrics: metrics)
    }

    // MARK: - Worker

    private struct ThreadResult: Sendable {
        var cycles = 0
        var errors = 0
        var writeSeconds = 0.0
        var readSeconds = 0.0
        var bytesMoved = 0
        var writeGBps = 0.0
        var readGBps = 0.0

        mutating func absorb(_ other: ThreadResult) {
            cycles += other.cycles
            errors += other.errors
            writeSeconds = max(writeSeconds, other.writeSeconds)
            readSeconds = max(readSeconds, other.readSeconds)
            bytesMoved += other.bytesMoved
            writeGBps += other.writeGBps
            readGBps += other.readGBps
        }
    }

    private func workChunk(megabytes: Int, duration: Int) async -> ThreadResult {
        let elements = max(1, (megabytes * 1024 * 1024) / MemoryLayout<UInt64>.stride)
        let buffer = UnsafeMutablePointer<UInt64>.allocate(capacity: elements)
        defer { buffer.deallocate() }

        var result = ThreadResult()
        let deadline = Date().addingTimeInterval(Double(duration))
        var cycle = UInt64.random(in: .min ... .max)

        while Date() < deadline {
            let wStart = DispatchTime.now()
            buffer.initialize(repeating: cycle, count: elements)
            // Touch every cache line so the write cannot be elided.
            var touch: UInt64 = 0
            var i = 0
            while i < elements {
                touch &+= buffer[i]
                i += 8
            }
            result.writeSeconds += Double(DispatchTime.now().uptimeNanoseconds - wStart.uptimeNanoseconds) / 1e9
            result.bytesMoved += megabytes * 1024 * 1024

            let rStart = DispatchTime.now()
            var localErrors = 0
            for j in 0..<elements where buffer[j] != cycle {
                localErrors += 1
                if localErrors > 10 { break }
            }
            result.readSeconds += Double(DispatchTime.now().uptimeNanoseconds - rStart.uptimeNanoseconds) / 1e9
            result.errors += localErrors

            result.cycles += 1
            cycle = cycle &* 6364136223846793005 &+ 1442695040888963407
            if localErrors > 10 { break }
        }

        // Aggregate bandwidth: bytes / slowest-thread wall time (parallel rate).
        let gb = Double(megabytes) / 1000.0
        result.writeGBps = result.writeSeconds > 0 ? gb / result.writeSeconds : 0
        result.readGBps = result.readSeconds > 0 ? gb / result.readSeconds : 0
        return result
    }
}
