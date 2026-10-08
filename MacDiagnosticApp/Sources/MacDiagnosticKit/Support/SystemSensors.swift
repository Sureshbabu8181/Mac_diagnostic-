import Foundation

/// Unprivileged system sensors: temperature, thermal pressure, effective
/// CPU throughput, and battery power draw.
///
/// `powermetrics` requires root and Apple Silicon exposes no frequency
/// sysctl, so sensors here use only sources readable from a normal process.
public enum SystemSensors {

    // MARK: - Temperature

    /// SoC/battery pack temperature in °C from the AppleSmartBattery sensor.
    /// Returns nil when no battery sensor is present (desktops) or the
    /// reading is implausible.
    public static func temperatureCelsius() -> Double? {
        guard let service = IOKitSupport.firstService(matching: "AppleSmartBattery") else { return nil }
        defer { IOObjectRelease(service) }
        guard let raw = IOKitSupport.intProperty("Temperature", on: service), raw > 0 else { return nil }
        // Values arrive in centidegrees (>800) or decidegrees (<800).
        let celsius = raw > 800 ? Double(raw) / 100.0 : Double(raw) / 10.0
        guard celsius > 0, celsius <= 100 else { return nil }
        return celsius
    }

    // MARK: - Thermal pressure

    public enum ThermalState: String, Sendable, CaseIterable {
        case nominal = "Normal"
        case fair = "Elevated"
        case serious = "High"
        case critical = "Critical"
    }

    /// Kernel thermal pressure (0 = nominal … 3 = critical). Works unprivileged.
    public static func thermalState() -> ThermalState {
        switch ProcessInfo.processInfo.thermalState {
        case .nominal: return .nominal
        case .fair: return .fair
        case .serious: return .serious
        case .critical: return .critical
        @unknown default: return .nominal
        }
    }

    /// Severity rank for comparisons (higher = worse).
    public static func thermalSeverity() -> Int {
        switch thermalState() {
        case .nominal: return 0
        case .fair: return 1
        case .serious: return 2
        case .critical: return 3
        }
    }

    // MARK: - Frequency

    /// Nominal CPU frequency in MHz when the platform exposes it (Intel).
    /// Returns nil on Apple Silicon, which has no frequency sysctl.
    public static func cpuFrequencyMHz() -> Double? {
        var hz: Int64 = 0
        var size = MemoryLayout<Int64>.size
        guard sysctlbyname("hw.cpufrequency", &hz, &size, nil, 0) == 0, hz > 0 else { return nil }
        return Double(hz) / 1_000_000
    }

    /// Fixed floating-point workload throughput in mega-operations/second.
    /// Used as a proxy for effective CPU performance: it drops when the CPU
    /// is thermally throttled or oversubscribed.
    ///
    /// When `samples` > 1 the best (least-contended) run is returned to
    /// reduce scheduler-noise in short measurements.
    public static func throughputMOps(iterations: Int = 2_000_000, samples: Int = 1) -> Double {
        var best = 0.0
        for _ in 0..<max(1, samples) {
            let start = DispatchTime.now()
            var acc: Double = 0
            var i = 0
            while i < iterations {
                let x = Double(i)
                acc += sin(x) * cos(x) + sqrt(x + 1)
                i += 1
            }
            if acc.isNaN || acc.isInfinite { continue }
            let ns = Double(DispatchTime.now().uptimeNanoseconds - start.uptimeNanoseconds)
            guard ns > 0 else { continue }
            best = max(best, (Double(iterations) / (ns / 1_000_000_000)) / 1_000_000)
        }
        return best
    }

    // MARK: - CPU load

    private final class LoadTracker: @unchecked Sendable {
        let lock = NSLock()
        var lastTicks: (user: UInt32, system: UInt32, idle: UInt32, nice: UInt32)?
        var lastTime: TimeInterval = 0
    }
    private static let loadTracker = LoadTracker()

    /// Whole-system CPU load percent (0–100).
    ///
    /// `HOST_CPU_LOAD_INFO` returns cumulative ticks since boot, so the
    /// instantaneous load is computed from the delta between successive calls.
    /// The first call returns 0 (no previous sample).
    public static func cpuLoadPercent() -> Double {
        var cpuInfo = host_cpu_load_info()
        var count = mach_msg_type_number_t(MemoryLayout<host_cpu_load_info>.size / MemoryLayout<integer_t>.size)
        let result = withUnsafeMutablePointer(to: &cpuInfo) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, $0, &count)
            }
        }
        guard result == KERN_SUCCESS else { return 0 }

        let ticks = (user: cpuInfo.cpu_ticks.0, system: cpuInfo.cpu_ticks.1,
                     idle: cpuInfo.cpu_ticks.2, nice: cpuInfo.cpu_ticks.3)
        let now = Date().timeIntervalSinceReferenceDate

        let tracker = loadTracker
        tracker.lock.lock()
        defer { tracker.lock.unlock() }

        var load = 0.0
        if let last = tracker.lastTicks, now > tracker.lastTime {
            // UInt32 subtraction wraps correctly across counter rollover.
            let dUser = Double(ticks.user &- last.user)
            let dSystem = Double(ticks.system &- last.system)
            let dIdle = Double(ticks.idle &- last.idle)
            let dNice = Double(ticks.nice &- last.nice)
            let total = dUser + dSystem + dIdle + dNice
            if total > 0 {
                load = ((dUser + dSystem + dNice) / total) * 100
            }
        }
        tracker.lastTicks = ticks
        tracker.lastTime = now
        return load
    }

    // MARK: - Power

    /// Instantaneous battery power draw in watts. Nil on desktops.
    public static func powerWatts() -> Double? {
        guard let service = IOKitSupport.firstService(matching: "AppleSmartBattery") else { return nil }
        defer { IOObjectRelease(service) }
        guard let mA = IOKitSupport.intProperty("Amperage", on: service),
              let mV = IOKitSupport.intProperty("Voltage", on: service),
              mV > 0 else { return nil }
        return abs(Double(mA)) * abs(Double(mV)) / 1_000_000
    }
}
