import Foundation

/// Battery diagnostic: collects readings, computes the organizational
/// assessment, and produces a pass/warning/notAvailable result.
public struct BatteryDiagnostic: AutomatedDiagnosticProvider {
    public let meta = DiagnosticMeta(
        kind: .battery,
        title: "Battery",
        whyItMatters: "Battery health declines with charge cycles. The app compares macOS-reported readings against an organizational threshold; this is not Apple's replacement criteria.",
        isManual: false
    )

    public let thresholds: BatteryThresholds
    private let reader: BatteryReader

    public init(thresholds: BatteryThresholds = BatteryThresholds(), reader: BatteryReader = BatteryReader()) {
        self.thresholds = thresholds
        self.reader = reader
    }

    public func run() async -> DiagnosticResult {
        let readings = reader.read()

        var metrics = [
            DiagnosticMetric(name: "Battery Present", value: readings.present ? "Yes" : "No"),
        ]
        if let condition = readings.condition, !condition.isEmpty {
            metrics.append(DiagnosticMetric(name: "macOS Condition", value: condition))
        }
        if let cycles = readings.cycleCount {
            metrics.append(DiagnosticMetric(name: "Cycle Count", value: "\(cycles)"))
        }
        if let health = readings.healthPercent {
            metrics.append(DiagnosticMetric(name: "Maximum Capacity", value: String(format: "%.0f%%", health)))
        }
        if let charge = readings.chargePercent {
            metrics.append(DiagnosticMetric(name: "Current Charge", value: String(format: "%.0f%%", charge)))
        }
        if let charging = readings.isCharging {
            metrics.append(DiagnosticMetric(name: "Charging", value: charging ? "Yes" : "No"))
        }
        if let external = readings.externalConnected {
            metrics.append(DiagnosticMetric(name: "Power Adapter", value: external ? "Connected" : "Not connected"))
        }
        if let vol = readings.voltageMillis {
            metrics.append(DiagnosticMetric(name: "Voltage", value: String(format: "%.2f V", Double(vol) / 1000)))
        }
        if let amp = readings.amperageMillis {
            metrics.append(DiagnosticMetric(name: "Current", value: "\(amp) mA"))
        }
        if let temp = readings.temperatureCelsius {
            metrics.append(DiagnosticMetric(name: "Temperature", value: String(format: "%.1f °C", temp)))
        }
        if let time = readings.timeToEmptyMinutes {
            metrics.append(DiagnosticMetric(name: "Time Remaining", value: "\(time) min"))
        }

        guard readings.present else {
            return DiagnosticResult(
                kind: .battery,
                status: .notAvailable,
                summary: "No battery detected on this device (desktop / logic board power).",
                metrics: metrics
            )
        }

        guard let health = readings.healthPercent else {
            return DiagnosticResult(
                kind: .battery,
                status: .notAvailable,
                summary: "Battery present but capacity data unavailable through public APIs.",
                metrics: metrics
            )
        }

        let assessment = thresholds.assess(capacityPercent: health)
        metrics.append(DiagnosticMetric(name: "Application Assessment", value: assessment.displayName))

        let status: DiagnosticStatus = {
            switch assessment {
            case .good: return .pass
            case .fair: return .pass
            case .poor: return .warning
            case .notAvailable: return .notAvailable
            }
        }()

        let summary = "Battery capacity \(String(format: "%.0f", health))% (organizational assessment \(assessment.displayName))."
        return DiagnosticResult(kind: .battery, status: status, summary: summary, metrics: metrics)
    }
}