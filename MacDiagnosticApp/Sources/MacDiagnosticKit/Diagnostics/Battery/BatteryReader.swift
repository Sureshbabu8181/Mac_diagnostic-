import Foundation
import IOKit.ps

/// Raw battery readings. Missing values are nil; never fabricated.
public struct BatteryReadings: Sendable, Equatable {
    public var present: Bool = false
    public var cycleCount: Int?
    public var designCapacityMAh: Int?
    public var maxCapacityMAh: Int?
    public var currentCapacityPercent: Int?
    public var isCharging: Bool?
    public var externalConnected: Bool?
    public var isFullyCharged: Bool?
    public var voltageMillis: Int?
    public var amperageMillis: Int?
    public var temperatureCelsius: Double?
    public var timeToEmptyMinutes: Int?
    public var condition: String?

    /// Maximum capacity as a percent of design capacity (health %), from raw
    /// mAh readings. This is the value used for the organizational assessment.
    public var healthPercent: Double? {
        guard let max = maxCapacityMAh, let design = designCapacityMAh, design > 0 else { return nil }
        return Double(max) / Double(design) * 100
    }

    public var chargePercent: Double? {
        guard let current = currentCapacityPercent else { return nil }
        return Double(current)
    }
}

enum IOPowerSourceKey {
    static let state = kIOPSPowerSourceStateKey
    static let isCharging = kIOPSIsChargingKey
    static let currentCapacity = kIOPSCurrentCapacityKey
    static let maxCapacity = kIOPSMaxCapacityKey
    static let healthCondition = kIOPSBatteryHealthConditionKey
}

public struct BatteryReader: Sendable {
    public init() {}

    /// Reads battery data from public power-source and IORegistry interfaces.
    public func read() -> BatteryReadings {
        var readings = BatteryReadings()

        // IORegistry "AppleSmartBattery" — public read interface for rich data.
        if let service = IOKitSupport.firstService(matching: "AppleSmartBattery") {
            defer { IOObjectRelease(service) }
            readings.present = true
            readings.cycleCount = IOKitSupport.intProperty("CycleCount", on: service)
            readings.designCapacityMAh = IOKitSupport.intProperty("DesignCapacity", on: service)
            // On Apple Silicon the mAh capacity lives in AppleRawMaxCapacity;
            // the bare "MaxCapacity" key is a percentage (0-100) and is unusable
            // for health math.
            readings.maxCapacityMAh = IOKitSupport.intProperty("AppleRawMaxCapacity", on: service)
            if readings.maxCapacityMAh == nil {
                let percent = IOKitSupport.intProperty("MaxCapacity", on: service) ?? 0
                if percent > 1000 { readings.maxCapacityMAh = percent }
            }
            readings.voltageMillis = IOKitSupport.intProperty("Voltage", on: service)
            if let amp = IOKitSupport.intProperty("Amperage", on: service), abs(amp) < 100_000 {
                readings.amperageMillis = amp
            }

            if let temp = IOKitSupport.intProperty("Temperature", on: service), temp > 0, temp < 2000 {
                readings.temperatureCelsius = Double(temp) / 10.0
            } else if let avg = IOKitSupport.intProperty("AverageTemperature", on: service), avg > 0, avg < 2000 {
                readings.temperatureCelsius = Double(avg) / 10.0
            }
            readings.externalConnected = IOKitSupport.boolProperty("ExternalConnected", on: service)

            if let tte = IOKitSupport.intProperty("AvgTimeToEmpty", on: service), tte > 0, tte < 24 * 60 {
                readings.timeToEmptyMinutes = tte
            }
        }

        applyPowerSources(&readings)
        return readings
    }

    private func applyPowerSources(_ readings: inout BatteryReadings) {
        guard let snapshot = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
              let sources = IOPSCopyPowerSourcesList(snapshot)?.takeRetainedValue() as? [CFTypeRef]
        else { return }

        for source in sources {
            guard let description = IOPSGetPowerSourceDescription(snapshot, source)?.takeUnretainedValue() as? [String: Any] else { continue }
            if let charging = description[IOPowerSourceKey.isCharging] as? Bool { readings.isCharging = charging }
            if let current = description[IOPowerSourceKey.currentCapacity] as? Int { readings.currentCapacityPercent = current }
            if let condition = description[IOPowerSourceKey.healthCondition] as? String { readings.condition = condition }
            if let state = description[IOPowerSourceKey.state] as? String {
                readings.externalConnected = (state == kIOPSACPowerValue)
                readings.isCharging = readings.isCharging ?? (state == kIOPSACPowerValue)
            }
        }
        // "Fully charged" typically means external connected and not charging.
        if let external = readings.externalConnected, let charging = readings.isCharging {
            readings.isFullyCharged = external && !charging
        }
    }
}