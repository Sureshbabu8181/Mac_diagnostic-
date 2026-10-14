import SwiftUI
import MacDiagnosticKit

/// Shared "Email Report" / "Send to Sheet" action row for finished sessions.
/// Email opens the default mail client with a prefilled plain-text report;
/// Send to Sheet POSTs a flat JSON row to the configured Apps Script webhook.
struct ReportSendButtons: View {
    let session: DiagnosticSession
    @EnvironmentObject var appModel: AppModel
    @State private var status: String?
    @State private var isSending = false

    var body: some View {
        HStack(spacing: 8) {
            Button("Email Report") {
                Task { await sendEmail() }
            }
            .buttonStyle(.bordered)
            .disabled(isSending)

            Button(isSending ? "Sending…" : "Send to Sheet") {
                Task { await sendSheet() }
            }
            .buttonStyle(.bordered)
            .disabled(isSending)

            if let status {
                Text(status)
                    .font(.caption)
                    .foregroundStyle(status.contains("✓") ? .green : (status.contains("failed") || status.contains("Could not") || status.contains("Set the") ? .red : .secondary))
            }
        }
    }

    @MainActor
    private func sendEmail() async {
        isSending = true
        defer { isSending = false }
        let opened = await ReportSender.openEmailComposer(
            recipient: appModel.settings.reportEmailRecipient,
            session: session,
            companyName: appModel.settings.companyName
        )
        status = opened
            ? "Email composer opened — review and send."
            : "Could not open a mail client. Set a default Mail app in System Settings."
    }

    @MainActor
    private func sendSheet() async {
        guard let url = URL(string: appModel.settings.sheetsWebhookURL),
              ReportSender.isValidSheetWebhook(url)
        else {
            status = "Set the Google Sheet webhook URL in Settings first."
            return
        }
        isSending = true
        defer { isSending = false }
        do {
            try await ReportSender.sendToSheet(session, webhookURL: url, companyName: appModel.settings.companyName)
            status = "Sent to Google Sheet ✓"
        } catch {
            status = "Send failed: \(error.localizedDescription)"
        }
    }
}
