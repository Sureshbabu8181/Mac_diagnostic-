import SwiftUI
import MacDiagnosticKit

struct TechnicianPickerView: View {
    var onSelect: (TechnicianProfile?) -> Void
    @EnvironmentObject var appModel: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var newName = ""
    @State private var profiles: [TechnicianProfile] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Technician Profiles").font(.title2.bold())
            Text("Profiles are stored locally on this Mac. No authentication is required.")

            if profiles.isEmpty {
                Text("No technicians yet. Add one below.")
                    .foregroundStyle(.secondary)
            }

            ForEach(profiles, id: \.id) { profile in
                HStack {
                    Text(profile.name)
                    Spacer()
                    if appModel.technician?.name == profile.name {
                        Text("Selected").foregroundStyle(.green).font(.caption.bold())
                    }
                    Button("Choose") {
                        onSelect(profile)
                        dismiss()
                    }
                }
                .padding(8)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color(nsColor: .controlBackgroundColor)))
            }

            HStack {
                TextField("New technician name", text: $newName)
                    .textFieldStyle(.roundedBorder)
                Button("Add") { addTechnician() }
                    .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty)
            }

            Spacer()

            HStack {
                Spacer()
                Button("Done") { dismiss() }
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(24)
        .frame(width: 420, height: 320)
        .task { reload() }
    }

    private func addTechnician() {
        guard let store = appModel.store,
              let profile = try? store.addTechnician(named: newName)
        else { return }
        newName = ""
        reload()
        onSelect(profile)
    }

    private func reload() {
        profiles = (try? appModel.store?.technicians()) ?? []
    }
}

struct SettingsView: View {
    @EnvironmentObject var appModel: AppModel
    @State private var sessionCount = 0
    @State private var companyName = ""
    @State private var goodThreshold = 80
    @State private var fairThreshold = 60
    @State private var accentTestButtons = true
    @State private var emailRecipient = ""
    @State private var sheetsWebhookURL = ""
    @State private var autoSendToSheet = false
    @State private var isDirty = false

    var body: some View {
        Form {
            Section("Company") {
                TextField("Company name (report branding)", text: $companyName)
                    .textFieldStyle(.roundedBorder)
                    .onChange(of: companyName) { isDirty = true }
                Text("Appears on exported PDF and CSV reports. Leave empty for generic branding.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Section("Battery Health Thresholds") {
                Stepper(value: $goodThreshold, in: 51...100) {
                    Text("GOOD at or above: \(goodThreshold)%")
                }
                .onChange(of: goodThreshold) { isDirty = true }
                Stepper(value: $fairThreshold, in: 0...50) {
                    Text("FAIR at or above: \(fairThreshold)%")
                }
                .onChange(of: fairThreshold) { isDirty = true }
                Text("Below \(fairThreshold)% is reported POOR. These are organization thresholds, not Apple's criteria.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Section("Report Delivery (opt-in)") {
                TextField("Default email recipient", text: $emailRecipient)
                    .textFieldStyle(.roundedBorder)
                    .onChange(of: emailRecipient) { isDirty = true }
                Text("Used to prefill the “Email Report” composer. Leave empty to compose with a blank To: field.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                TextField("Google Sheet webhook URL", text: $sheetsWebhookURL)
                    .textFieldStyle(.roundedBorder)
                    .onChange(of: sheetsWebhookURL) { isDirty = true }
                Text("Option A (Apps Script): deploy a web app with “Anyone” access and paste its /exec URL.\nOption B (works when your account only allows “Only me”): link a Google Form to the sheet, add one short-answer question, then Forms → Send → link → “Get pre-filled link” → type anything → Get link → paste that URL here. The app submits each report through the form.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Toggle("Auto-send report to Google Sheet after each saved session", isOn: $autoSendToSheet)
                    .onChange(of: autoSendToSheet) { isDirty = true }
                Text("Requires a webhook URL above. Manual “Send to Sheet” buttons always remain available.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Section("App") {
                Toggle("Accent test-button backgrounds", isOn: $accentTestButtons)
                    .onChange(of: accentTestButtons) { isDirty = true }
                Text("Test-page buttons use the accent color when on; plain white when off.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                LabeledContent("Version", value: appModel.appVersion)
                LabeledContent("Stored Sessions", value: "\(sessionCount)")
            }
            Section("Data") {
                Button("Export Diagnostic Logs…") { exportLogs() }
                Button("Clear All Local History", role: .destructive) { clearHistory() }
            }
            Text("All data is stored locally. Nothing leaves this Mac unless you tap Email Report / Send to Sheet (or enable auto-send above).")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .formStyle(.grouped)
        .navigationTitle("Settings")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Save") { save() }
                    .disabled(!isDirty)
            }
        }
        .task {
            loadSettings()
            reloadCount()
        }
        .onChange(of: appModel.settings) { loadSettings() }
    }

    private func loadSettings() {
        companyName = appModel.settings.companyName
        goodThreshold = Int(appModel.settings.batteryThresholds.goodMinimumPercent)
        fairThreshold = Int(appModel.settings.batteryThresholds.fairMinimumPercent)
        accentTestButtons = appModel.settings.accentTestButtons
        emailRecipient = appModel.settings.reportEmailRecipient
        sheetsWebhookURL = appModel.settings.sheetsWebhookURL
        autoSendToSheet = appModel.settings.autoSendToSheetAfterRun
        isDirty = false
    }

    private func save() {
        appModel.settings.batteryThresholds.goodMinimumPercent = Double(goodThreshold)
        appModel.settings.batteryThresholds.fairMinimumPercent = Double(fairThreshold)
        appModel.settings.companyName = companyName
        appModel.settings.accentTestButtons = accentTestButtons
        appModel.settings.reportEmailRecipient = emailRecipient
        appModel.settings.sheetsWebhookURL = sheetsWebhookURL
        appModel.settings.autoSendToSheetAfterRun = autoSendToSheet
        appModel.saveSettings()
        isDirty = false
    }

    private func reloadCount() {
        sessionCount = (try? appModel.store?.sessions().count) ?? 0
    }

    private func clearHistory() {
        try? appModel.store?.clearAll()
        reloadCount()
    }

    private func exportLogs() {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.log]
        panel.nameFieldStringValue = "mac-diagnostic.log"
        if panel.runModal() == .OK, let url = panel.url {
            try? AppLogger.exportLogs(to: url)
        }
    }
}