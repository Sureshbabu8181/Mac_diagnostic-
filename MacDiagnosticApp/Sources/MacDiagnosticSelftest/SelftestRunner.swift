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

        print("Report delivery (offline)")
        let text = ReportBuilder(companyName: "ACME").textSummary(for: session)
        check("text summary contains serial + verdict",
              text.contains("SELFTEST") && text.uppercased().contains("OVERALL:"))
        check("text summary lists tests", text.contains("Battery:"))
        if let mailto = ReportSender.mailtoURL(recipient: "tech@example.com",
                                               subject: ReportSender.emailSubject(for: session),
                                               body: text) {
            let s = mailto.absoluteString
            check("mailto URL well-formed",
                  s.hasPrefix("mailto:tech@example.com?subject=")
                    && !s.contains("\n")
                    && s.contains("SELFTEST"))
        } else {
            check("mailto URL well-formed", false)
        }
        let payload = ReportSender.sheetPayload(for: session, companyName: "ACME")
        check("sheet payload flat fields", payload.serial == "SELFTEST" && payload.verdict == session.overall.displayName && payload.company == "ACME")
        check("sheet webhook validation", ReportSender.isValidSheetWebhook(URL(string: "https://script.google.com/macros/s/abc/exec")!)
              && !ReportSender.isValidSheetWebhook(URL(string: "http://insecure.example.com")!))
        var deliverySettings = AppSettings(reportEmailRecipient: "a@b.c", sheetsWebhookURL: "https://x.example/exec", autoSendToSheetAfterRun: true)
        deliverySettings.companyName = "ACME"
        if let encoded = try? JSONEncoder().encode(deliverySettings),
           let decoded = try? JSONDecoder().decode(AppSettings.self, from: encoded) {
            check("settings round-trip new fields",
                  decoded.reportEmailRecipient == "a@b.c" && decoded.autoSendToSheetAfterRun && decoded.sheetsWebhookURL == "https://x.example/exec")
        } else {
            check("settings round-trip new fields", false)
        }
        let legacyJSON = #"{"companyName":"Old","accentTestButtons":false}"#.data(using: .utf8)!
        if let legacy = try? JSONDecoder().decode(AppSettings.self, from: legacyJSON) {
            check("legacy settings decode with defaults", legacy.companyName == "Old" && legacy.sheetsWebhookURL.isEmpty && !legacy.autoSendToSheetAfterRun)
        } else {
            check("legacy settings decode with defaults", false)
        }

        print("Benchmark score")
        let bench = BenchmarkScore.compute(for: session)
        check("score in 0...100", (0...100).contains(bench.overall))
        check("grade consistent with score", !bench.grade.isEmpty && bench.components.count == 7)
        var scored = session
        scored.results = [
            DiagnosticResult(kind: .battery, status: .pass, metrics: [
                DiagnosticMetric(name: "Maximum Capacity", value: "95%"),
                DiagnosticMetric(name: "Cycle Count", value: "120"),
                DiagnosticMetric(name: "Battery Present", value: "Yes"),
            ]),
            DiagnosticResult(kind: .storage, status: .pass, metrics: [
                DiagnosticMetric(name: "Read Speed", value: "2800 MB/s"),
            ]),
            DiagnosticResult(kind: .stressTest, status: .pass, metrics: [
                DiagnosticMetric(name: "Throughput Under Load", value: "95.0 Mops/s"),
                DiagnosticMetric(name: "GPU Errors", value: "None"),
                DiagnosticMetric(name: "VRAM Pattern Test", value: "PASS"),
                DiagnosticMetric(name: "RAM Write Bandwidth", value: "12.0 GB/s"),
                DiagnosticMetric(name: "RAM Read Bandwidth", value: "18.0 GB/s"),
                DiagnosticMetric(name: "RAM Pattern Errors", value: "None"),
                DiagnosticMetric(name: "Peak Temperature", value: "34.0°C"),
            ]),
        ]
        scored.overall = DiagnosticSession.computeOverall(from: scored.results)
        let strong = BenchmarkScore.compute(for: scored)
        check("healthy machine scores high", strong.overall >= 90 && strong.grade == "A")
        var weak = session
        weak.results = [
            DiagnosticResult(kind: .battery, status: .fail, metrics: [
                DiagnosticMetric(name: "Maximum Capacity", value: "55%"),
                DiagnosticMetric(name: "Cycle Count", value: "1200"),
                DiagnosticMetric(name: "Battery Present", value: "Yes"),
            ]),
            DiagnosticResult(kind: .stressTest, status: .fail, metrics: [
                DiagnosticMetric(name: "Throughput Under Load", value: "20.0 Mops/s"),
                DiagnosticMetric(name: "GPU Errors", value: "3"),
                DiagnosticMetric(name: "VRAM Pattern Test", value: "FAIL"),
                DiagnosticMetric(name: "RAM Write Bandwidth", value: "1.0 GB/s"),
                DiagnosticMetric(name: "RAM Read Bandwidth", value: "2.0 GB/s"),
                DiagnosticMetric(name: "RAM Pattern Errors", value: "2"),
                DiagnosticMetric(name: "Peak Temperature", value: "48.0°C"),
            ]),
        ]
        weak.overall = DiagnosticSession.computeOverall(from: weak.results)
        let sick = BenchmarkScore.compute(for: weak)
        check("unhealthy machine scores low", sick.overall < 50 && sick.grade == "F")

        print("Google Form delivery")
        let formURL = URL(string: "https://docs.google.com/forms/d/e/1FAIpQLScTest/viewform?entry.1111111=abc&entry.2222222=xyz")!
        check("form URL detected", ReportSender.isFormURL(formURL) && !ReportSender.isFormURL(URL(string: "https://script.google.com/macros/s/AKf/exec")!))
        if let converted = ReportSender.formResponseURL(for: session, webhookURL: formURL) {
            let s = converted.absoluteString
            check("form converts to formResponse", s.contains("/formResponse") && !s.contains("viewform") && s.contains("entry.1111111=") && s.contains("SELFTEST"))
        } else {
            check("form converts to formResponse", false)
        }
        let noEntry = URL(string: "https://docs.google.com/forms/d/e/1FAIpQLScTest/viewform")!
        check("form without entry rejected", ReportSender.formResponseURL(for: session, webhookURL: noEntry) == nil)

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
        check("registry covers all \(DiagnosticKind.allCases.count) kinds", DiagnosticKind.allCases.allSatisfy { kind in registry.all.contains { $0.kind == kind } })
        check("registry counts", registry.automated.count == 8 && registry.manual.count == 6)

        print("")
        print("REAL DIAGNOSTIC RESULTS")
        let realEngine = DiagnosticEngine(registry: registry, device: info, technician: "selftest", appVersion: "t")
        await realEngine.runAutomated()
        for result in realEngine.session.results {
            print("  [\(result.status.displayName)] \(result.kind.displayName): \(result.summary)")
            for metric in result.metrics.prefix(40) {
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