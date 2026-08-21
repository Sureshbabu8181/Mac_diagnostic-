import SwiftUI
import MacDiagnosticKit

@main
struct MacDiagnosticApp: App {
    @StateObject private var appModel = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appModel)
                .task {
                    try? await appModel.bootstrap()
                }
        }
        .windowResizability(.contentMinSize)
    }
}

/// Shared app-wide model: current technician, simulated device info,
/// history store and current diagnostic engine.
@MainActor
final class AppModel: ObservableObject, @unchecked Sendable {
    @Published var technician: TechnicianProfile?
    @Published var device: DeviceInfo = DeviceInfo()
    @Published var engine: DiagnosticEngine?
    @Published var store: DiagnosticStore?
    @Published var settings: AppSettings = SettingsStore.load()

    let appVersion: String = AppMetadata.version

    func bootstrap() async throws {
        if store == nil {
            store = try DiagnosticStore(directory: nil)
        }
        device = SystemInfoService().collect()

        // Restore last selected technician profile.
        if technician == nil, let store {
            technician = try store.technicians().last
        }
    }

    func saveSettings() {
        SettingsStore.save(settings)
    }

    func resetSettings() {
        settings = AppSettings()
        saveSettings()
    }

    func selectTechnician(_ profile: TechnicianProfile?) {
        technician = profile
    }

    func createSession() -> DiagnosticEngine {
        let registry = DefaultRegistry.make()
        let engine = DiagnosticEngine(
            registry: registry,
            device: device,
            technician: technician?.name ?? "Technician",
            appVersion: appVersion
        )
        self.engine = engine
        return engine
    }
}