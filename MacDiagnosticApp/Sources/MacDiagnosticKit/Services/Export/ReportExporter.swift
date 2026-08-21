import Foundation

public enum ExportError: LocalizedError {
    case writeFailed(String)
    public var errorDescription: String? {
        switch self {
        case .writeFailed(let path): "Failed to write report: \(path)"
        }
    }
}

/// Writes rendered reports to a chosen directory. Offline, local-only.
public struct ReportExporter: Sendable {
    public init() {}

    public func export(_ session: DiagnosticSession, to directory: URL, formats: Set<ReportFormat>, companyName: String = "") throws -> [URL] {
        var written: [URL] = []
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let base = session.startedAt.timeIntervalSince1970

        if formats.contains(.json) {
            let data = try ReportBuilder(companyName: companyName).jsonData(for: session)
            let url = directory.appendingPathComponent("mac-diagnostic-\(Int(base)).json")
            try data.write(to: url)
            written.append(url)
        }
        if formats.contains(.csv) {
            let data = ReportBuilder(companyName: companyName).csv(session: session)
            let url = directory.appendingPathComponent("mac-diagnostic-\(Int(base)).csv")
            try data.write(to: url, atomically: true, encoding: .utf8)
            written.append(url)
        }
        if formats.contains(.pdf) {
            let data = PDFReportRenderer.render(session: session, companyName: companyName)
            let url = directory.appendingPathComponent("mac-diagnostic-\(Int(base)).pdf")
            try data.write(to: url)
            written.append(url)
        }
        return written
    }
}

public enum ReportFormat: String, CaseIterable, Sendable {
    case pdf = "PDF"
    case json = "JSON"
    case csv = "CSV"
}