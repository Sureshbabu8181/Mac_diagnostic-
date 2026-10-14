import Foundation
import AppKit

/// Opt-in report delivery: opens the default mail client with a prefilled
/// plain-text report (mailto:) and POSTs a flat JSON payload to a Google
/// Apps Script web-app endpoint that appends rows to a Google Sheet.
///
/// Nothing is sent unless the technician taps a send button (or enables
/// auto-send in Settings). No credentials are stored by the app.
public enum ReportSender {

    public enum SendError: LocalizedError {
        case invalidWebhookURL
        case badStatus(Int)
        case transport(String)

        public var errorDescription: String? {
            switch self {
            case .invalidWebhookURL:
                return "The Google Sheet webhook URL is missing or not an https:// address."
            case .badStatus(let code):
                return "The Google Sheet endpoint returned HTTP \(code). Check the Apps Script deployment."
            case .transport(let message):
                return "Network error: \(message)"
            }
        }
    }

    // MARK: - Google Sheet (Apps Script webhook)

    /// Flat, one-row-per-session payload. Keys are column-friendly so a simple
    /// Apps Script can map them directly to sheet columns.
    public struct SheetPayload: Codable, Sendable, Equatable {
        public var timestamp: String
        public var company: String
        public var technician: String
        public var deviceName: String
        public var model: String
        public var modelIdentifier: String
        public var serial: String
        public var chip: String
        public var osVersion: String
        public var memory: String
        public var storage: String
        public var verdict: String
        public var testsPassed: Int
        public var testsWarning: Int
        public var testsFailed: Int
        public var testsManual: Int
        public var summary: String
    }

    public static func isValidSheetWebhook(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "https" && !(url.host ?? "").isEmpty
    }

    public static func sheetPayload(for session: DiagnosticSession, companyName: String) -> SheetPayload {
        var passed = 0, warning = 0, failed = 0, manual = 0
        for result in session.results {
            switch result.status {
            case .pass: passed += 1
            case .warning: warning += 1
            case .fail: failed += 1
            case .manualRequired: manual += 1
            default: break
            }
        }
        let summaryLines = session.results.map { result in
            "\(result.kind.displayName): \(result.status.displayName) — \(result.summary)"
        }
        let iso = ISO8601DateFormatter()
        return SheetPayload(
            timestamp: iso.string(from: session.endedAt ?? session.startedAt),
            company: companyName,
            technician: session.technicianName,
            deviceName: session.device.computerName,
            model: session.device.modelName,
            modelIdentifier: session.device.modelIdentifier,
            serial: session.device.serialNumber,
            chip: session.device.chip,
            osVersion: session.device.osVersion,
            memory: session.device.memoryGB,
            storage: session.device.storageGB,
            verdict: session.overall.displayName,
            testsPassed: passed,
            testsWarning: warning,
            testsFailed: failed,
            testsManual: manual,
            summary: summaryLines.joined(separator: "\n")
        )
    }

    /// POSTs the session payload as JSON to the configured webhook.
    /// The endpoint should be a Google Apps Script web app deployed with
    /// "Execute as me / Anyone" access that appends the fields to a sheet.
    public static func sendToSheet(
        _ session: DiagnosticSession,
        webhookURL: URL,
        companyName: String = ""
    ) async throws {
        guard isValidSheetWebhook(webhookURL) else { throw SendError.invalidWebhookURL }
        var request = URLRequest(url: webhookURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        request.httpBody = try encoder.encode(sheetPayload(for: session, companyName: companyName))

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw SendError.transport("No HTTP response")
            }
            guard (200..<300).contains(http.statusCode) else {
                throw SendError.badStatus(http.statusCode)
            }
        } catch let error as SendError {
            throw error
        } catch {
            throw SendError.transport(error.localizedDescription)
        }
    }

    // MARK: - Email (mailto composer)

    public static func emailSubject(for session: DiagnosticSession) -> String {
        "One Diagnose Report — \(session.device.serialNumber) — \(session.overall.displayName)"
    }

    /// Builds a `mailto:` URL with percent-encoded subject/body. Works with an
    /// empty recipient (composes with a blank "To:" field).
    public static func mailtoURL(recipient: String, subject: String, body: String) -> URL? {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        guard let encodedSubject = subject.addingPercentEncoding(withAllowedCharacters: allowed),
              let encodedBody = body.addingPercentEncoding(withAllowedCharacters: allowed)
        else { return nil }
        let to = recipient.trimmingCharacters(in: .whitespaces)
        let urlString = "mailto:\(to)?subject=\(encodedSubject)&body=\(encodedBody)"
        return URL(string: urlString)
    }

    /// Opens the default mail client with the report prefilled.
    /// Returns false when no mail handler is configured.
    /// The body is capped so the mailto: URL stays within client limits;
    /// the full report is always available via "Save to Downloads".
    @MainActor
    public static func openEmailComposer(recipient: String, session: DiagnosticSession, companyName: String = "") async -> Bool {
        var body = ReportBuilder(companyName: companyName, appVersion: session.appVersion, technicianName: session.technicianName)
            .textSummary(for: session)
        if body.count > 16_000 {
            body = String(body.prefix(16_000))
                + "\n\n… (truncated — full report available via \"Save PDF / JSON / CSV to Downloads\")"
        }
        guard let url = mailtoURL(recipient: recipient, subject: emailSubject(for: session), body: body) else {
            return false
        }
        return await withCheckedContinuation { continuation in
            NSWorkspace.shared.open(url, configuration: NSWorkspace.OpenConfiguration()) { _, error in
                continuation.resume(returning: error == nil)
            }
        }
    }
}
