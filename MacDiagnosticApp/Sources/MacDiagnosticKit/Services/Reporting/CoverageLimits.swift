import Foundation

/// Honest-disclosure items for things macOS does not expose to third-party
/// apps, or that this app measures only as a documented proxy. Shown on every
/// report (text, PDF, UI) so customers know the exact coverage of a run.
public enum CoverageLimits {
    public static let items: [(area: String, detail: String)] = [
        ("SMART / SSD health", "NOT AVAILABLE — internal flash SMART data is not exposed by public macOS APIs."),
        ("Memory pressure", "Memory pressure is a documented machine-usage proxy, not a RAM stress test."),
        ("Ambient light / lid / orientation", "NOT AVAILABLE — no public sensors for ambient light, lid state or orientation."),
        ("Unused physical ports", "MANUAL REQUIRED — unused ports must be checked by hand."),
    ]

    public static var textBlock: String {
        var lines = ["TEST COVERAGE & LIMITATIONS"]
        for item in items {
            lines.append("  - \(item.area): \(item.detail)")
        }
        return lines.joined(separator: "\n")
    }
}
