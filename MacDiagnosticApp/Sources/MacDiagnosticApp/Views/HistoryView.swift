import SwiftUI
import MacDiagnosticKit

struct HistoryView: View {
    @EnvironmentObject var appModel: AppModel
    var focusReports = false
    @State private var sessions: [DiagnosticSession] = []
    @State private var selectedID: UUID?
    @State private var exported = ""

    var body: some View {
        HSplitView {
            // List
            List(selection: $selectedID) {
                ForEach(sessions, id: \.id) { session in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(session.technicianName)
                            .font(.headline)
                        Text("\(session.startedAt, style: .date) \(session.startedAt, style: .time)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(session.overall.displayName)
                            .font(.caption.bold())
                            .foregroundStyle(verdictColor(session.overall.verdict))
                    }
                    .tag(session.id)
                }
                .onDelete { indexSet in
                    for index in indexSet {
                        if let store = appModel.store {
                            try? store.delete(sessions[index])
                        }
                    }
                    reload()
                }
            }
            .frame(minWidth: 260)

            // Detail
            if let session = sessions.first(where: { $0.id == selectedID }) {
                detail(for: session)
            } else {
                Text("Select a session to view details")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle(focusReports ? "Reports & History" : "Diagnostic History")
        .toolbar {
            ToolbarItemGroup {
                Button("Compare", action: compareBattery)
                Button("Export…") { exportSelected() }
                Button("Export All CSV…") { exportAll() }
                Button("Export All (CSV/PDF/JSON)…") { exportAllReports() }
                Button("Refresh") { reload() }
            }
        }
        .safeAreaInset(edge: .bottom) {
            if !exported.isEmpty {
                Text(exported)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(6)
                    .background(.bar)
            }
        }
        .task { reload() }
    }

    private func detail(for session: DiagnosticSession) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text("Device").font(.title3.bold())
                grid(label: "Model", value: session.device.modelName)
                grid(label: "Serial", value: session.device.serialNumber)
                grid(label: "Chip", value: session.device.chip)
                grid(label: "macOS", value: session.device.osVersion)
                grid(label: "Overall", value: session.overall.displayName, color: verdictColor(session.overall.verdict))

                Divider().padding(.vertical, 6)
                Text("Results").font(.title3.bold())
                ForEach(session.results, id: \.id) { result in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text(result.kind.displayName).font(.headline)
                            Spacer()
                            StatusBadge(status: result.status)
                        }
                        ForEach(result.metrics, id: \.id) { metric in
                            grid(label: metric.name, value: metric.value)
                        }
                    }
                    .padding(6)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color(nsColor: .controlBackgroundColor)))
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func grid(label: String, value: String, color: Color = .primary) -> some View {
        HStack(alignment: .top) {
            Text(label).font(.callout).foregroundStyle(.secondary).frame(width: 120, alignment: .leading)
            Text(value.isEmpty ? "NOT AVAILABLE" : value).font(.callout).foregroundStyle(color)
            Spacer()
        }
    }

    private func verdictColor(_ verdict: DiagnosticSession.OverallResult.Verdict) -> Color {
        switch verdict {
        case .pass: .green
        case .passWithWarning: .orange
        case .fail: .red
        case .manualRequired: .blue
        case .inProgress: .secondary
        }
    }

    private func compareBattery() {
        // Compare battery cycle counts across sessions of the same device.
        let cycles: [(String, String)] = sessions.compactMap { session in
            guard let result = session.result(for: .battery),
                  let cycles = result.metric("Cycle Count") else { return nil }
            return (session.technicianName, cycles)
        }
        guard cycles.count >= 2 else {
            exported = "Need at least two sessions with battery cycle counts to compare."
            return
        }
        let last = cycles[cycles.count - 1].1
        let prev = cycles[cycles.count - 2].1
        let lastInt = Int(last) ?? 0
        let prevInt = Int(prev) ?? 0
        exported = "Previous cycle count: \(prev)   Current: \(last)   Difference: \(lastInt - prevInt >= 0 ? "+" : "")\(lastInt - prevInt)"
    }

    private func exportSelected() {
        guard let session = sessions.first(where: { $0.id == selectedID }) else { return }
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        let exporter = ReportExporter()
        do {
            let written = try exporter.export(session, to: url, formats: [.pdf, .json, .csv], companyName: appModel.settings.companyName)
            exported = "Exported \(written.count) file(s) to \(url.path)"
        } catch {
            exported = error.localizedDescription
        }
    }

    private func exportAll() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        let data = ReportBuilder(companyName: appModel.settings.companyName).combinedCSV(sessions: sessions)
        do {
            let file = url.appendingPathComponent("mac-diagnostic-history-\(Int(Date().timeIntervalSince1970)).csv")
            try data.write(to: file, atomically: true, encoding: .utf8)
            exported = "Exported \(sessions.count) session(s) to \(file.path)"
        } catch {
            exported = error.localizedDescription
        }
    }

    /// Exports every session as its own CSV, PDF and JSON ("API") file into the
    /// chosen folder, plus a single combined fleet CSV.
    private func exportAllReports() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        let exporter = ReportExporter()
        let builder = ReportBuilder(companyName: appModel.settings.companyName)
        var count = 0
        for session in sessions {
            do {
                let written = try exporter.export(session, to: url, formats: [.csv, .pdf, .json], companyName: appModel.settings.companyName)
                count += written.count
            } catch {
                exported = error.localizedDescription
                return
            }
        }
        do {
            let combined = url.appendingPathComponent("mac-diagnostic-history-all.csv")
            try builder.combinedCSV(sessions: sessions).write(to: combined, atomically: true, encoding: .utf8)
            count += 1
        } catch {
            exported = error.localizedDescription
            return
        }
        exported = "Exported \(count) file(s) for \(sessions.count) session(s) to \(url.path)"
    }

    private func reload() {
        sessions = (try? appModel.store?.sessions()) ?? []
        selectedID = sessions.first?.id
    }
}