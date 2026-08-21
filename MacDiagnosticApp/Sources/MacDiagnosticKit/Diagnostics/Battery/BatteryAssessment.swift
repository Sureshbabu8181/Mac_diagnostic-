import Foundation

public enum BatteryAssessment: String, Codable, Sendable {
    case good, fair, poor, notAvailable

    public var displayName: String {
        switch self {
        case .good: "GOOD"
        case .fair: "FAIR"
        case .poor: "POOR"
        case .notAvailable: "NOT AVAILABLE"
        }
    }
}

/// Organizational assessment thresholds. Explicitly NOT Apple's criteria.
public struct BatteryThresholds: Codable, Sendable, Equatable {
    public var goodMinimumPercent: Double
    public var fairMinimumPercent: Double

    public init(goodMinimumPercent: Double = 80, fairMinimumPercent: Double = 60) {
        self.goodMinimumPercent = goodMinimumPercent
        self.fairMinimumPercent = fairMinimumPercent
    }

    public func assess(capacityPercent: Double) -> BatteryAssessment {
        if capacityPercent >= goodMinimumPercent { return .good }
        if capacityPercent >= fairMinimumPercent { return .fair }
        return .poor
    }
}