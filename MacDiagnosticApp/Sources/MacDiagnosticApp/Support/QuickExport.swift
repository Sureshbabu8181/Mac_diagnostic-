import Foundation
import MacDiagnosticKit

/// Direct-to-Downloads report export. The app is sandboxed with the
/// `com.apple.security.files.downloads.read-write` entitlement, so files land
/// in the user's real ~/Downloads with no folder-picker dialog.
enum QuickExport {
    static var downloadsDirectory: URL {
        FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
    }

    @discardableResult
    static func export(_ session: DiagnosticSession, companyName: String) -> String {
        do {
            let written = try ReportExporter().export(
                session,
                to: downloadsDirectory,
                formats: [.pdf, .json, .csv],
                companyName: companyName
            )
            let names = written.map { $0.lastPathComponent }.joined(separator: ", ")
            AppLogger.shared.info("Exported \(written.count) report file(s) to Downloads")
            return "Saved to Downloads: \(names)"
        } catch {
            AppLogger.shared.error("Downloads export failed: \(error.localizedDescription)")
            return "Export failed: \(error.localizedDescription)"
        }
    }

    @discardableResult
    static func exportCombinedCSV(sessions: [DiagnosticSession], companyName: String) -> String {
        let data = ReportBuilder(companyName: companyName).combinedCSV(sessions: sessions)
        let file = downloadsDirectory.appendingPathComponent("mac-diagnostic-history-\(Int(Date().timeIntervalSince1970)).csv")
        do {
            try data.write(to: file, atomically: true, encoding: .utf8)
            return "Saved to Downloads: \(file.lastPathComponent)"
        } catch {
            return "Export failed: \(error.localizedDescription)"
        }
    }

    @discardableResult
    static func exportAllSessions(_ sessions: [DiagnosticSession], companyName: String) -> String {
        let exporter = ReportExporter()
        var count = 0
        for session in sessions {
            do {
                count += try exporter.export(session, to: downloadsDirectory,
                                             formats: [.pdf, .json, .csv],
                                             companyName: companyName).count
            } catch {
                return "Export failed: \(error.localizedDescription)"
            }
        }
        count += 1 // combined CSV below
        _ = exportCombinedCSV(sessions: sessions, companyName: companyName)
        return "Saved \(count) file(s) for \(sessions.count) session(s) to Downloads"
    }
}
