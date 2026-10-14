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
        case signInRequired
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
                return "Google asked for sign-in — the deployment is set to \"Only me\". Either publish the web app as \"Anyone\", or paste a Google Form link instead (works without public deployment)."
            case .signInRequired:
                return "Google rejected the submission (sign-in required). In the Form: Settings → Responses → turn OFF \"Limit to 1 response\" and set \"Who can respond\" to anyone with the link."
            case .formURLIncomplete:
                return "Could not find the form's entry field. Paste the normal form share link (Forms → Send → 🔗) and make sure the form has at least one short-answer question."
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
    /// 2. Google Form link (`…/forms/d/e/…/viewform`) — the app discovers the
    ///    answer field and submits a form-encoded POST to `formResponse`.
    ///    Works when the account cannot publish public web apps ("Only me"
    ///    deployments), provided the form allows unauthenticated responses.
    public static func sendToSheet(
        _ session: DiagnosticSession,
        webhookURL: URL,
        companyName: String = ""
    ) async throws {
        guard isValidSheetWebhook(webhookURL) else { throw SendError.invalidWebhookURL }

        let request: URLRequest
        if isFormURL(webhookURL) {
            let entry: String
            if let existing = existingEntryField(in: webhookURL) {
                entry = existing
            } else {
                entry = try await discoverEntryID(from: webhookURL)
            }
            guard let action = formActionURL(from: webhookURL) else { throw SendError.formURLIncomplete }
            var r = URLRequest(url: action)
            r.httpMethod = "POST"
            r.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            r.timeoutInterval = 30
            let payload = sheetPayload(for: session, companyName: companyName)
            r.httpBody = formEncodedBody(entryField: entry, value: compactSummary(payload))
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
            if http.statusCode == 401 || http.statusCode == 403 {
                throw SendError.signInRequired
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

    /// True for Form links (`docs.google.com/forms/…`).
    public static func isFormURL(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased(), host.contains("docs.google.com") || host.contains("forms.gle") else { return false }
        return url.absoluteString.contains("/forms/")
    }

    /// Answer-field id already present in a pre-filled link, if any.
    public static func existingEntryField(in url: URL) -> String? {
        URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name.hasPrefix("entry.") })?.name
    }

    /// The `formResponse` action URL: `viewform` → `formResponse`, query stripped.
    public static func formActionURL(from url: URL) -> URL? {
        var urlString = url.absoluteString
        if urlString.contains("/viewform") {
            urlString = urlString.replacingOccurrences(of: "/viewform", with: "/formResponse")
        }
        guard urlString.contains("/formResponse"),
              var components = URLComponents(string: urlString)
        else { return nil }
        components.queryItems = nil
        return components.url
    }

    public static func compactSummary(_ payload: SheetPayload) -> String {
        [
            payload.timestamp, payload.company, payload.technician,
            payload.deviceName, payload.model, payload.serial, payload.chip,
            payload.osVersion, payload.memory, payload.storage, payload.verdict,
            "P\(payload.testsPassed)/W\(payload.testsWarning)/F\(payload.testsFailed)/M\(payload.testsManual)",
            payload.summary,
        ].joined(separator: " | ")
    }

    public static func formEncodedBody(entryField: String, value: String) -> Data? {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        guard let encoded = value.addingPercentEncoding(withAllowedCharacters: allowed) else { return nil }
        return "\(entryField)=\(encoded)".data(using: .utf8)
    }

    /// Fetches the public form page and extracts the answer-field id, so users
    /// can paste the ordinary Send → 🔗 share link.
    public static func discoverEntryID(from formURL: URL) async throws -> String {
        let html: String
        do {
            let (data, response) = try await URLSession.shared.data(from: formURL)
            if let http = response as? HTTPURLResponse, http.url?.host?.contains("accounts.google.com") == true {
                throw SendError.restrictedAccess
            }
            html = String(data: data, encoding: .utf8) ?? ""
        } catch let error as SendError {
            throw error
        } catch {
            throw SendError.transport(error.localizedDescription)
        }
        guard let entry = entryID(in: html) else { throw SendError.formURLIncomplete }
        return entry
    }

    /// Pure parser: finds the form's answer-field id in the page HTML.
    /// Handles both the literal `entry.<digits>` token (pre-filled pages) and
    /// the new Forms public-data format where the id appears as
    /// `[[<id>,null,<type>]]` inside FB_PUBLIC_LOAD_DATA_.
    public static func entryID(in html: String) -> String? {
        // 1) Literal "entry.123…" tokens.
        let literalPattern = "entry\\.\\d+"
        if let regex = try? NSRegularExpression(pattern: literalPattern) {
            let range = NSRange(html.startIndex..<html.endIndex, in: html)
            if let match = regex.firstMatch(in: html, range: range),
               let swiftRange = Range(match.range, in: html) {
                return String(html[swiftRange])
            }
        }
        // 2) New-format answer field: [[<id>,null,<type>]].
        let fieldPattern = "\\[\\[(\\d+),null,\\d+\\]\\]"
        if let regex = try? NSRegularExpression(pattern: fieldPattern) {
            let range = NSRange(html.startIndex..<html.endIndex, in: html)
            if let match = regex.firstMatch(in: html, range: range),
               let idRange = Range(match.range(at: 1), in: html) {
                return "entry.\(html[idRange])"
            }
        }
        return nil
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
