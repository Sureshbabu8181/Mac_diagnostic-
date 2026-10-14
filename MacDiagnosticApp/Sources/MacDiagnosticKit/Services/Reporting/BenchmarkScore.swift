import Foundation

/// Weighted device benchmark (0–100) derived from a finished diagnostic
/// session: CPU + GPU + memory from the stress test, storage speed, battery
/// health, temperature behavior and overall hardware health. Pure and
/// deterministic — same session always yields the same score.
public struct BenchmarkScore: Sendable, Equatable {

    public struct Component: Sendable, Equatable {
        public let name: String
        public let weight: Int      // percent of the total
        public let score: Int       // 0–100
        public let detail: String
    }

    /// Weighted overall score, 0–100.
    public let overall: Int
    public let components: [Component]

    public var grade: String {
        switch overall {
        case 90...100: "A"
        case 80..<90: "B"
        case 70..<80: "C"
        case 60..<70: "D"
        default: "F"
        }
    }

    public var label: String {
        switch overall {
        case 90...100: "Excellent"
        case 80..<90: "Good"
        case 70..<80: "Fair"
        case 60..<70: "Below Average"
        default: "Poor"
        }
    }

    public static func compute(for session: DiagnosticSession) -> BenchmarkScore {
        var components: [Component] = []
        let stress = session.result(for: .stressTest)
        let monitor = session.result(for: .monitor)
        let battery = session.result(for: .battery)
        let storage = session.result(for: .storage)

        // --- CPU (25%) — measured throughput under max load ---
        let cpuRefMops = 60.0
        if let mops = firstDouble(stress?.metric("Throughput Under Load"),
                                  monitor?.metric("Avg Performance")) {
            let s = Int(min(100, max(0, mops / cpuRefMops * 100)))
            components.append(Component(name: "CPU", weight: 25, score: s,
                                        detail: String(format: "%.1f Mops/s under load", mops)))
        } else {
            components.append(Component(name: "CPU", weight: 25, score: 65, detail: "Not benchmarked — run Stress Test"))
        }

        // --- GPU (15%) — dispatch success + VRAM integrity ---
        let gpuErrors = stress?.metric("GPU Errors").flatMap(parseErrorCount) ?? nil
        let vramPass = stress?.metric("VRAM Pattern Test")?.uppercased() == "PASS"
        if let errors = gpuErrors {
            var s = errors == 0 ? 100 : max(0, 100 - errors * 25)
            if vramPass { s = min(100, s) } else { s = min(s, 40) }
            components.append(Component(name: "GPU", weight: 15, score: s,
                                        detail: errors == 0 ? "No GPU/VRAM errors" : "\(errors) GPU error(s)"))
        } else {
            components.append(Component(name: "GPU", weight: 15, score: 65, detail: "Not benchmarked — run Stress Test"))
        }

        // --- Memory (15%) — bandwidth + pattern integrity ---
        let writeBW = firstDouble(stress?.metric("RAM Write Bandwidth")) ?? nil
        let readBW = firstDouble(stress?.metric("RAM Read Bandwidth")) ?? nil
        let ramErrors = stress?.metric("RAM Pattern Errors").flatMap(parseErrorCount) ?? nil
        let bwRef = 6.0
        if let w = writeBW, let r = readBW {
            let avg = (w + r) / 2
            var s = Int(min(100, max(0, avg / bwRef * 100)))
            if let e = ramErrors, e > 0 { s = 0 }
            components.append(Component(name: "Memory", weight: 15, score: s,
                                        detail: String(format: "%.1f/%.1f GB/s R/W, %d errors", r, w, ramErrors ?? 0)))
        } else {
            components.append(Component(name: "Memory", weight: 15, score: 65, detail: "Not benchmarked — run Stress Test"))
        }

        // --- Storage (15%) — measured read speed, else diagnostic status ---
        if let readMBps = firstDouble(storage?.metric("Read Speed")) {
            let s = Int(min(100, max(0, readMBps / 1500 * 100)))
            components.append(Component(name: "Storage", weight: 15, score: s,
                                        detail: String(format: "%.0f MB/s read", readMBps)))
        } else if let status = storage?.status {
            components.append(Component(name: "Storage", weight: 15, score: statusScore(status),
                                        detail: "No speed benchmark — status \(status.displayName)"))
        } else {
            components.append(Component(name: "Storage", weight: 15, score: 65, detail: "Not tested"))
        }

        // --- Battery (15%) — capacity health, cycle wear penalty ---
        if battery?.metric("Battery Present") == "No" || battery == nil {
            components.append(Component(name: "Battery", weight: 15, score: 85, detail: "Not applicable (no battery)"))
        } else if let cap = firstDouble(battery?.metric("Maximum Capacity")) {
            let cycles = battery?.metric("Cycle Count").flatMap { Int($0) } ?? 0
            var s = max(0, min(100, Int(cap)) )
            if cycles > 800 { s = max(0, s - min(25, (cycles - 800) / 20)) }
            components.append(Component(name: "Battery", weight: 15, score: s,
                                        detail: String(format: "%.0f%% capacity, %d cycles", cap, cycles)))
        } else {
            components.append(Component(name: "Battery", weight: 15, score: battery.map { statusScore($0.status) } ?? 65,
                                        detail: "Capacity not reported"))
        }

        // --- Temperature (10%) — peak temp under load ---
        if let peak = firstDouble(stress?.metric("Peak Temperature"), monitor?.metric("Max Temperature")) {
            // ≤33°C → 100; linear down to 0 at 50°C.
            let s = Int(min(100, max(0, (50.0 - peak) / (50.0 - 33.0) * 100)))
            components.append(Component(name: "Thermals", weight: 10, score: s,
                                        detail: String(format: "Peak %.1f°C under load", peak)))
        } else {
            components.append(Component(name: "Thermals", weight: 10, score: 75, detail: "Not measured"))
        }

        // --- Hardware health (5%) — overall session verdict ---
        components.append(Component(name: "Health", weight: 5, score: verdictScore(session.overall.verdict),
                                    detail: "Overall: \(session.overall.displayName)"))

        let total = components.reduce(0) { $0 + $1.weight }
        let weighted = components.reduce(0) { $0 + $1.score * $1.weight }
        let overall = total > 0 ? Int((Double(weighted) / Double(total)).rounded()) : 0
        return BenchmarkScore(overall: max(0, min(100, overall)), components: components)
    }

    // MARK: - Parsing helpers

    /// Extracts the first parseable number from values like "6.2 GB/s",
    /// "31.1°C", "86%" or "66.4 Mops/s".
    private static func firstDouble(_ values: String?...) -> Double? {
        for value in values {
            guard let value, !value.isEmpty else { continue }
            let cleaned = value.split(whereSeparator: { $0.isWhitespace || $0 == "%" || $0 == "°" }).first.map(String.init)
            if let cleaned, let d = Double(cleaned) { return d }
            // Fall back: first token containing a number.
            for token in value.split(whereSeparator: { $0 == " " }) {
                if let d = Double(token) { return d }
            }
        }
        return nil
    }

    /// "None" → 0, "3" → 3, anything else → nil (unknown).
    private static func parseErrorCount(_ value: String) -> Int? {
        if value.trimmingCharacters(in: .whitespaces).lowercased() == "none" { return 0 }
        return Int(value.trimmingCharacters(in: .whitespaces))
    }

    private static func statusScore(_ status: DiagnosticStatus) -> Int {
        switch status {
        case .pass: 100
        case .warning: 70
        case .manualRequired: 85
        case .fail: 25
        default: 65
        }
    }

    private static func verdictScore(_ verdict: DiagnosticSession.OverallResult.Verdict) -> Int {
        switch verdict {
        case .pass: 100
        case .passWithWarning: 75
        case .manualRequired: 85
        case .fail: 35
        case .inProgress: 60
        }
    }
}
