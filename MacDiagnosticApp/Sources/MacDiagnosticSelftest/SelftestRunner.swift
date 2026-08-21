import Foundation
import MacDiagnosticKit

@main
@MainActor
struct SelftestRunner {
    static var failures = 0
    static var passed = 0

    static func check(_ name: String, _ condition: @autoclosure () -> Bool) {
        if condition() {
            passed += 1
            print("  ✓ \(name)")
        } else {
            failures += 1
            print("  ✗ \(name)")
        }
    }

    static func checkAsync(_ name: String, _ body: @escaping () async -> Bool) async {
        let ok = await body()
        if ok {
            passed += 1
            print("  ✓ \(name)")
        } else {
            failures += 1
            print("  ✗ \(name)")
        }
    }

    static func main() async {
        print("MAC DIAGNOSTIC SELF-TEST")
        print("Battery assessment")
        let thresholds = BatteryThresholds()
        check("GOOD ≥80", thresholds.assess(capacityPercent: 95) == .good)
        check("FAIR boundary 60", thresholds.assess(capacityPercent: 60) == .fair)
        check("POOR <60", thresholds.assess(capacityPercent: 30) == .poor)

        print("Overall result logic")
        let passAll = DiagnosticSession.computeOverall(from: [
            DiagnosticResult(kind: .battery, status: .pass),
            DiagnosticResult(kind: .storage, status: .pass),
        ])
        check("all pass → PASS", passAll.verdict == .pass)
        let failMix = DiagnosticSession.computeOverall(from: [
            DiagnosticResult(kind: .battery, status: .pass),
            DiagnosticResult(kind: .storage, status: .fail),
            DiagnosticResult(kind: .memory, status: .warning),
        ])
        check("fail dominates → FAIL", failMix.verdict == .fail && failMix.failedTests == [.storage])
        let manualMix = DiagnosticSession.computeOverall(from: [
            DiagnosticResult(kind: .battery, status: .pass),
            DiagnosticResult(kind: .ports, status: .manualRequired),
        ])
        check("manual required → MANUAL REQUIRED", manualMix.verdict == .manualRequired)

        print("Diagnostic engine")
        await checkAsync("automated run records results") {
            let engine = DiagnosticEngine(registry: MockRegistry.make(), device: DeviceInfo(), technician: "T", appVersion: "t")
            await engine.runAutomated()
            return engine.session.results.count == 4
                && engine.session.result(for: .battery)?.status == .pass
                && engine.session.result(for: .storage)?.status == .pass
                && engine.session.result(for: .display)?.status == .manualRequired
        }
        await checkAsync("manual queue order + verdicts") {
            let engine = DiagnosticEngine(registry: MockRegistry.make(), device: DeviceInfo(), technician: "T", appVersion: "t")
            await engine.runAutomated()
            guard engine.nextManualKind() == .display else { return false }
            engine.finishManual(.display, status: .fail, summary: "x", notes: "note")
            guard engine.nextManualKind() == .keyboard else { return false }
            engine.finishManual(.keyboard, status: .pass, summary: "ok")
            return engine.session.result(for: .display)?.technicianNotes == "note"
                && engine.session.overall.verdict == .fail
        }

        print("Reports")
        var session = DiagnosticSession(device: DeviceInfo(modelName: "MacBook Pro", serialNumber: "SELFTEST", chip: "M1", osVersion: "26"), technicianName: "Tech", appVersion: "1")
        session.results = [
            DiagnosticResult(kind: .battery, status: .pass, metrics: [DiagnosticMetric(name: "Cycle Count", value: "552")]),
        ]
        session.overall = DiagnosticSession.computeOverall(from: session.results)
        do {
            let json = try ReportBuilder().jsonData(for: session)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let decoded = try decoder.decode(DiagnosticSession.self, from: json)
            check("JSON round-trip", decoded.device.serialNumber == "SELFTEST" && decoded.result(for: .battery)?.metric("Cycle Count") == "552")
        } catch {
            check("JSON round-trip", false)
        }
        let csv = ReportBuilder().csv(session: session)
        check("CSV contains metrics", csv.contains("Cycle Count") && csv.contains("552"))
        let pdf = PDFReportRenderer.render(session: session, companyName: "ACME")
        check("PDF produced with header", pdf.prefix(4).map { String(format: "%c", $0) }.joined() == "%PDF" && pdf.count > 100)

        print("Local store")
        do {
            let store = DiagnosticStore(inMemory: true)
            let p = try store.addTechnician(named: "Tech A")
            let dup = try store.addTechnician(named: "Tech A")
            try store.save(session)
            let loaded = try store.sessions()
            let techCount = (try store.technicians()).count
            check("store dedupes technicians", p.id == dup.id && techCount == 1)
            check("store persists session", loaded.count == 1 && loaded.first?.result(for: .battery)?.status == .pass)
            try store.delete(session)
            let remaining = try store.sessions().count
            check("store deletes session", remaining == 0)
        } catch {
            check("store operations", false)
        }

        print("Real hardware smoke checks")
        let info = SystemInfoService().collect()
        check("system info populated", info.osVersion != DeviceInfo.unavailable && info.modelIdentifier != DeviceInfo.unavailable)
        _ = BatteryReader().read()
        check("battery reader runs", true)
        let storage = StorageDiagnostic()
        check("storage volumes enumerable", !storage.enumerableVolumes().isEmpty)
        let output = AudioDeviceProbe.defaultOutput()
        check("audio output probe", output != nil && !(output?.name.isEmpty ?? true))
        let registry = DefaultRegistry.make()
        check("registry covers all 12 kinds", DiagnosticKind.allCases.allSatisfy { kind in registry.all.contains { $0.kind == kind } })
        check("registry counts", registry.automated.count == 6 && registry.manual.count == 6)

        print("")
        print("REAL DIAGNOSTIC RESULTS")
        let realEngine = DiagnosticEngine(registry: registry, device: info, technician: "selftest", appVersion: "t")
        await realEngine.runAutomated()
        for result in realEngine.session.results {
            print("  [\(result.status.displayName)] \(result.kind.displayName): \(result.summary)")
            for metric in result.metrics.prefix(6) {
                print("      \(metric.name): \(metric.value)")
            }
        }
        print("  Overall: \(realEngine.session.overall.displayName)")

        print("")
        print("PASSED: \(passed)  FAILED: \(failures)")
        if failures > 0 {
            print("SELF-TEST FAILED")
            exit(1)
        } else {
            print("SELF-TEST PASSED")
        }
    }
}

/// Mock providers for offline testing.
enum MockRegistry {
    struct AlwaysPass: AutomatedDiagnosticProvider {
        let kind: DiagnosticKind
        var meta: DiagnosticMeta { DiagnosticMeta(kind: kind, title: kind.displayName, whyItMatters: "mock", isManual: false) }
        func run() async -> DiagnosticResult { DiagnosticResult(kind: kind, status: .pass, summary: "mock") }
    }
    struct MockManual: ManualDiagnosticProvider {
        let kind: DiagnosticKind
        var meta: DiagnosticMeta { DiagnosticMeta(kind: kind, title: kind.displayName, whyItMatters: "mock", isManual: true) }
    }

    static func make() -> any DiagnosticProviding {
        DiagnosticRegistry(
            automated: [AlwaysPass(kind: .battery), AlwaysPass(kind: .storage)],
            manual: [MockManual(kind: .display), MockManual(kind: .keyboard)]
        )
    }
}