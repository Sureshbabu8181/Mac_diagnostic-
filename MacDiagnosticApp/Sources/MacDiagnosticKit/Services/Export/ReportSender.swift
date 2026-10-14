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
        case restrictedAccess
        case formURLIncomplete

        public var errorDescription: String? {
            switch self {
            case .invalidWebhookURL:
                return "The Google Sheet webhook URL is missing or not an https:// address."
            case .badStatus(let code):
                return "The Google Sheet endpoint returned HTTP \(code). Check the Apps Script deployment."
            case .transport(let message):
                return "Network error: \(message)"
            case .restrictedAccess:
                return "Google asked for sign-in — the deployment is set to \"Only me\". Either publish the web app as \"Anyone\", or paste a Google Form \"Get pre-filled link\" URL instead (works without public deployment)."
            case .formURLIncomplete:
                return "This looks like a Google Form link but has no entry field. Use Forms → Send → link icon → \"Get pre-filled link\", submit it once, then paste that URL."
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

    /// Sends the session to the configured endpoint. Two URL kinds are
    /// supported:
    ///
    /// 1. Apps Script web app (`…/exec`) — JSON POST. Needs "Anyone" access.
    /// 2. Google Form pre-filled link (`…/forms/d/e/…/viewform?entry.…=…`) —
    ///    converted to a `formResponse` submission GET. Works even when the
    ///    account cannot publish public web apps ("Only me" deployments).
    public static func sendToSheet(
        _ session: DiagnosticSession,
        webhookURL: URL,
        companyName: String = ""
    ) async throws {
        guard isValidSheetWebhook(webhookURL) else { throw SendError.invalidWebhookURL }

        let request: URLRequest
        if isFormURL(webhookURL) {
            guard let formURL = formResponseURL(for: session, webhookURL: webhookURL) else {
                throw SendError.formURLIncomplete
            }
            var r = URLRequest(url: formURL)
            r.httpMethod = "GET"
            r.timeoutInterval = 30
            request = r
        } else {
            var r = URLRequest(url: webhookURL)
            r.httpMethod = "POST"
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.timeoutInterval = 30
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            r.httpBody = try encoder.encode(sheetPayload(for: session, companyName: companyName))
            request = r
        }

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw SendError.transport("No HTTP response")
            }
            // "Only me" deployments bounce anonymous clients to the login page.
            if let host = http.url?.host, host.contains("accounts.google.com") {
                throw SendError.restrictedAccess
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

    // MARK: - Google Form submission support

    /// True for pre-filled Form links (`docs.google.com/forms/…`).
    public static func isFormURL(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased(), host.contains("docs.google.com") || host.contains("forms.gle") else { return false }
        return url.absoluteString.contains("/forms/")
    }

    /// Converts a pre-filled Form URL into a working `formResponse` submission
    /// by swapping `viewform` → `formResponse` and replacing the first
    /// `entry.…` value with a compact one-field report.
    public static func formResponseURL(for session: DiagnosticSession, webhookURL: URL) -> URL? {
        var urlString = webhookURL.absoluteString
        if urlString.contains("/viewform") {
            urlString = urlString.replacingOccurrences(of: "/viewform", with: "/formResponse")
        }
        guard urlString.contains("/formResponse") else { return nil }

        guard var components = URLComponents(string: urlString),
              let entryIndex = components.queryItems?.firstIndex(where: { $0.name.hasPrefix("entry.") })
        else { return nil }

        let payload = sheetPayload(for: session, companyName: "")
        let compact = [
            payload.timestamp, payload.company, payload.technician,
            payload.deviceName, payload.model, payload.serial, payload.chip,
            payload.osVersion, payload.memory, payload.storage, payload.verdict,
            "P\(payload.testsPassed)/W\(payload.testsWarning)/F\(payload.testsFailed)/M\(payload.testsManual)",
            payload.summary,
        ].joined(separator: " | ")

        var items = components.queryItems ?? []
        items[entryIndex] = URLQueryItem(name: items[entryIndex].name, value: compact)
        components.queryItems = items
        return components.url
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
