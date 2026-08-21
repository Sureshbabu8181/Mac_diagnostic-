import Foundation

/// Pure rendering of a diagnostic session into file formats. JSON and CSV are
/// straightforward Codable/string outputs; PDF uses CoreGraphics. All outputs
/// are deterministic given the same session so they are unit-testable.
public struct ReportBuilder: Sendable {
    public var companyName: String
    public let appVersion: String
    public var technicianName: String

    public init(companyName: String = "", appVersion: String = "", technicianName: String = "") {
        self.companyName = companyName
        self.appVersion = appVersion
        self.technicianName = technicianName
    }

    public struct Settings: Sendable {
        public var companyName: String
        public var includeNotes: Bool
        public init(companyName: String = "", includeNotes: Bool = true) {
            self.companyName = companyName
            self.includeNotes = includeNotes
        }
    }

    // MARK: - JSON

    public func jsonData(for session: DiagnosticSession) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(session)
    }

    public func json(session: DiagnosticSession) throws -> String {
        try String(data: jsonData(for: session), encoding: .utf8) ?? ""
    }

    // MARK: - CSV

    /// One combined CSV across many sessions (a session column set per host),
    /// pivoted as one row per session for fleet-level comparison.
    public func combinedCSV(sessions: [DiagnosticSession]) -> String {
        let kinds = DiagnosticKind.allCases
        var header = ["Technician", "Started", "Overall"]
        header += kinds.map(\.displayName)
        header.append("Notes")

        var rows: [[String]] = [header]
        for session in sessions {
            var row: [String] = [
                session.technicianName,
                dateText(session.startedAt),
                session.overall.displayName,
            ]
            for kind in kinds {
                row.append(session.result(for: kind)?.status.displayName ?? DiagnosticStatus.notStarted.displayName)
            }
            let notes = session.results.map(\.technicianNotes).filter { !$0.isEmpty }
            row.append(notes.joined(separator: "; "))
            rows.append(row)
        }
        return rows.map { cells in
            cells.map { cell in
                let escaped = cell.replacingOccurrences(of: "\"", with: "\"\"")
                return escaped.contains(",") || escaped.contains("\"") || escaped.contains("\n")
                    ? "\"\(escaped)\""
                    : escaped
            }.joined(separator: ",")
        }.joined(separator: "\n")
    }

    public func csv(session: DiagnosticSession) -> String {
        var rows: [[String]] = []
        rows.append(["Section", "Field", "Value"])
        rows.append(["Device", "Serial Number", session.device.serialNumber])
        rows.append(["Device", "Model", "\(session.device.modelName) (\(session.device.modelIdentifier))"])
        rows.append(["Device", "Chip", session.device.chip])
        rows.append(["Device", "macOS", "\(session.device.osVersion) (\(session.device.osBuild))"])
        rows.append(["Device", "Memory", session.device.memoryGB])
        rows.append(["Device", "Storage", session.device.storageGB])
        rows.append(["Session", "Technician", session.technicianName])
        rows.append(["Session", "Started", dateText(session.startedAt)])
        rows.append(["Session", "Ended", session.endedAt.map(dateText) ?? ""])
        rows.append(["Session", "Overall", session.overall.displayName])
        rows.append(["Result", "Kind", "Status"])

        // Per-kind status summary columns
        var summary: [String] = ["Test Status"]
        for kind in DiagnosticKind.allCases {
            summary.append(kind.displayName)
        }
        rows.append(summary)

        var statusRow = ["Overall"]
        for kind in DiagnosticKind.allCases {
            let result = session.result(for: kind)
            statusRow.append(result?.status.displayName ?? DiagnosticStatus.notStarted.displayName)
        }
        _ = statusRow

        for kind in DiagnosticKind.allCases {
            guard let result = session.result(for: kind) else { continue }
            rows.append(["Test", kind.displayName, result.status.displayName])
            rows.append(["Summary", kind.displayName, result.summary])
            for metric in result.metrics {
                rows.append(["\(kind.displayName) / \(metric.name)", metric.name, metric.value])
            }
            if settings.includeNotes, !result.technicianNotes.isEmpty {
                rows.append(["Notes", kind.displayName, result.technicianNotes])
            }
        }

        return rows.map { row in
            row.map { cell in
                let escaped = cell.replacingOccurrences(of: "\"", with: "\"\"")
                return escaped.contains(",") || escaped.contains("\"") || escaped.contains("\n")
                    ? "\"\(escaped)\""
                    : escaped
            }.joined(separator: ",")
        }.joined(separator: "\n")
    }

    private var settings: Settings { Settings(companyName: companyName, includeNotes: true) }

    private func dateText(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return f.string(from: date)
    }
}