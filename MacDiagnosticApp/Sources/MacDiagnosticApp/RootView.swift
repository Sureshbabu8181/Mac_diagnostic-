import SwiftUI
import MacDiagnosticKit

struct RootView: View {
    @EnvironmentObject var appModel: AppModel
    @State private var path: [Route] = []
    @StateObject private var homeRunner = HomeDiagnosticsRunner()

    enum Route: Hashable {
        case singleTest(DiagnosticKind)
        case history
        case reports
        case settings
    }

    var body: some View {
        NavigationStack(path: $path) {
            HomeView()
                .environmentObject(homeRunner)
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .singleTest(let kind):
                        SessionRunFlowView(singleKind: kind) { result in
                            homeRunner.adoptResult(result)
                        }
                    case .history:
                        HistoryView()
                    case .reports:
                        HistoryView(focusReports: true)
                    case .settings:
                        SettingsView()
                    }
                }
        }
        .environment(\.accentTestButtons, appModel.settings.accentTestButtons)
        .frame(minWidth: 880, minHeight: 640)
        .onAppear {
            homeRunner.bind(store: appModel.store,
                            device: appModel.device,
                            technician: appModel.technician?.name ?? "Technician",
                            appVersion: appModel.appVersion)
        }
    }
}