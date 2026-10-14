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
                Button("Save Selected to Downloads") { exportSelected() }
                Button("Save All CSV to Downloads") { exportAll() }
                Button("Save All Reports to Downloads") { exportAllReports() }
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
                let bench = BenchmarkScore.compute(for: session)
                grid(label: "Benchmark", value: "\(bench.overall)/100 — Grade \(bench.grade) (\(bench.label))")
                BenchmarkScoreCard(score: bench)

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

                Divider().padding(.vertical, 6)
                ReportSendButtons(session: session)
                if !exported.isEmpty {
                    Text(exported).font(.caption).foregroundStyle(.secondary)
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
        exported = QuickExport.export(session, companyName: appModel.settings.companyName)
    }

    private func exportAll() {
        exported = QuickExport.exportCombinedCSV(sessions: sessions, companyName: appModel.settings.companyName)
    }

    /// Exports every session as its own CSV, PDF and JSON ("API") file into
    /// ~/Downloads, plus a single combined fleet CSV.
    private func exportAllReports() {
        exported = QuickExport.exportAllSessions(sessions, companyName: appModel.settings.companyName)
    }

    private func reload() {
        sessions = (try? appModel.store?.sessions()) ?? []
        selectedID = sessions.first?.id
    }
}