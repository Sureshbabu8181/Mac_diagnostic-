import XCTest
import MacDiagnosticKit

/// Mocks so the engine + providers are testable without physical hardware.
enum MockProviders {
    struct AlwaysPass: AutomatedDiagnosticProvider {
        let kind: DiagnosticKind
        let meta: DiagnosticMeta
        init(kind: DiagnosticKind) {
            self.kind = kind
            self.meta = DiagnosticMeta(kind: kind, title: kind.displayName, whyItMatters: "mock", isManual: false)
        }
        func run() async -> DiagnosticResult {
            DiagnosticResult(kind: kind, status: .pass, summary: "Mock pass")
        }
    }

    struct Failing: AutomatedDiagnosticProvider {
        let kind: DiagnosticKind
        var meta: DiagnosticMeta { DiagnosticMeta(kind: kind, title: kind.displayName, whyItMatters: "mock", isManual: false) }
        func run() async -> DiagnosticResult {
            DiagnosticResult(kind: kind, status: .fail, summary: "Mock fail")
        }
    }

    struct MockManual: ManualDiagnosticProvider {
        let kind: DiagnosticKind
        var meta: DiagnosticMeta { DiagnosticMeta(kind: kind, title: kind.displayName, whyItMatters: "mock", isManual: true) }
    }

    static func makeRegistry(
        automated: [AutomatedDiagnosticProvider] = [AlwaysPass(kind: .battery), AlwaysPass(kind: .storage)],
        manual: [ManualDiagnosticProvider] = [MockManual(kind: .display), MockManual(kind: .keyboard)]
    ) -> any DiagnosticProviding {
        DiagnosticRegistry(automated: automated, manual: manual)
    }
}

final class BatteryAssessmentTests: XCTestCase {
    func testThresholds() {
        let thresholds = BatteryThresholds()
        XCTAssertEqual(thresholds.assess(capacityPercent: 95), .good)
        XCTAssertEqual(thresholds.assess(capacityPercent: 80), .good)
        XCTAssertEqual(thresholds.assess(capacityPercent: 79), .fair)
        XCTAssertEqual(thresholds.assess(capacityPercent: 60), .fair)
        XCTAssertEqual(thresholds.assess(capacityPercent: 59), .poor)
        XCTAssertEqual(thresholds.assess(capacityPercent: 0), .poor)
    }

    func testCustomThresholds() {
        let custom = BatteryThresholds(goodMinimumPercent: 90, fairMinimumPercent: 70)
        XCTAssertEqual(custom.assess(capacityPercent: 89), .fair)
        XCTAssertEqual(custom.assess(capacityPercent: 90), .good)
    }

    func testHealthPercent() {
        var readings = BatteryReadings()
        readings.designCapacity = 100
        readings.maxCapacity = 55
        XCTAssertEqual(readings.healthPercent ?? 0, 55, accuracy: 0.001)
        readings.maxCapacity = 0
        XCTAssertNil(readings.healthPercent)
    }
}

final class OverallResultTests: XCTestCase {
    private func result(_ kind: DiagnosticKind, _ status: DiagnosticStatus) -> DiagnosticResult {
        DiagnosticResult(kind: kind, status: status)
    }

    func testAllPass() {
        let overall = DiagnosticSession.computeOverall(from: [
            result(.battery, .pass), result(.storage, .pass), result(.memory, .pass),
        ])
        XCTAssertEqual(overall.verdict, .pass)
        XCTAssertTrue(overall.failedTests.isEmpty)
    }

    func testFailDominates() {
        let overall = DiagnosticSession.computeOverall(from: [
            result(.battery, .pass), result(.storage, .fail), result(.memory, .warning),
        ])
        XCTAssertEqual(overall.verdict, .fail)
        XCTAssertEqual(overall.failedTests, [.storage])
    }

    func testManualRequired() {
        let overall = DiagnosticSession.computeOverall(from: [
            result(.battery, .pass), result(.ports, .manualRequired), result(.memory, .warning),
        ])
        XCTAssertEqual(overall.verdict, .manualRequired)
        XCTAssertEqual(overall.manualTests, [.ports])
    }

    func testWarning() {
        let overall = DiagnosticSession.computeOverall(from: [
            result(.battery, .pass), result(.memory, .warning),
        ])
        XCTAssertEqual(overall.verdict, .passWithWarning)
    }

    func testSkippedNotPending() {
        XCTAssertFalse(DiagnosticStatus.skipped.isPending)
        XCTAssertTrue(DiagnosticStatus.manualRequired.isPending)
        XCTAssertFalse(DiagnosticStatus.fail.isComplete)
    }
}

final class DiagnosticEngineTests: XCTestCase {
    func testAutomatedRunRecordsPass() async {
        let engine = DiagnosticEngine(registry: MockProviders.makeRegistry(), device: DeviceInfo(), technician: "T1", appVersion: "test")
        await engine.runAutomated()
        XCTAssertEqual(engine.session.results.count, 2)
        XCTAssertEqual(engine.session.result(for: .battery)?.status, .pass)
        XCTAssertEqual(engine.session.result(for: .storage)?.status, .pass)
    }

    func testManualPlaceholdersInOrder() async {
        let engine = DiagnosticEngine(registry: MockProviders.makeRegistry(), device: DeviceInfo(), technician: "T1", appVersion: "test")
        await engine.runAutomated()
        XCTAssertEqual(engine.session.result(for: .display)?.status, .manualRequired)
        XCTAssertEqual(engine.session.result(for: .keyboard)?.status, .manualRequired)

        // Advance through manual queue in defined workflow order.
        let expected: [DiagnosticKind] = [.display, .keyboard]
        for kind in expected {
            XCTAssertEqual(engine.nextManualKind(), kind)
            engine.finishManual(kind, status: .pass, summary: "ok")
        }
        XCTAssertNil(engine.nextManualKind())
        XCTAssertEqual(engine.session.overall.verdict, .pass)
    }

    func testFailureMakesOverallFail() async {
        let registry = MockProviders.makeRegistry(automated: [MockProviders.AlwaysPass(kind: .battery), MockProviders.Failing(kind: .storage)])
        let engine = DiagnosticEngine(registry: registry, device: DeviceInfo(), technician: "T1", appVersion: "test")
        await engine.runAutomated()
        XCTAssertEqual(engine.session.overall.verdict, .fail)
    }

    func testPerTestNotes() async {
        let engine = DiagnosticEngine(registry: MockProviders.makeRegistry(), device: DeviceInfo(), technician: "T1", appVersion: "test")
        await engine.runAutomated()
        _ = engine.nextManualKind()
        engine.finishManual(.display, status: .fail, summary: "bad pixels", notes: "Stuck pixel top-left")
        XCTAssertEqual(engine.session.result(for: .display)?.technicianNotes, "Stuck pixel top-left")
    }
}

final class ReportBuilderTests: XCTestCase {
    private func sampleSession() -> DiagnosticSession {
        var session = DiagnosticSession(device: DeviceInfo(
            modelName: "MacBook Pro", serialNumber: "TEST123", chip: "Apple M1", osVersion: "26.0", osBuild: "26A1"
        ), technicianName: "Tech", appVersion: "1.0.0")
        session.results = [
            DiagnosticResult(kind: .battery, status: .pass, summary: "ok", metrics: [DiagnosticMetric(name: "Cycle Count", value: "552")]),
            DiagnosticResult(kind: .storage, status: .warning, summary: "low free space"),
        ]
        session.endedAt = session.startedAt.addingTimeInterval(120)
        session.overall = DiagnosticSession.computeOverall(from: session.results)
        return session
    }

    func testJSONRoundTrip() throws {
        let session = sampleSession()
        let json = try ReportBuilder().jsonData(for: session)
        let decoded = try JSONDecoder().decode(DiagnosticSession.self, from: json)
        XCTAssertEqual(decoded.device.serialNumber, "TEST123")
        XCTAssertEqual(decoded.results.count, 2)
        XCTAssertEqual(decoded.result(for: .battery)?.metric("Cycle Count"), "552")
    }

    func testCSVContainsExpectedRows() {
        let csv = ReportBuilder(companyName: "ACME").csv(session: sampleSession())
        XCTAssertTrue(csv.contains("ACME") || csv.contains("Serial Number"))
        XCTAssertTrue(csv.contains("Cycle Count"))
        XCTAssertTrue(csv.contains("552"))
    }

    func testPDFNonEmpty() {
        let data = PDFReportRenderer.render(session: sampleSession(), companyName: "ACME")
        XCTAssertGreaterThan(data.count, 100)
        // PDF magic header
        XCTAssertEqual(data.prefix(4).map { String(format: "%c", $0) }.joined(), "%PDF")
    }

    func testExportAllFormats() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("report-test-\(UUID().uuidString)")
        let written = try ReportExporter().export(sampleSession(), to: dir, formats: [.pdf, .json, .csv])
        XCTAssertEqual(written.count, 3)
        for url in written {
            XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))
        }
    }
}

final class DiagnosticStoreTests: XCTestCase {
    func testSaveLoadDelete() throws {
        let store = DiagnosticStore(inMemory: true)
        let profile = try store.addTechnician(named: "Tech A")
        XCTAssertEqual(try store.technicians().count, 1)
        XCTAssertEqual(try store.technicians().first?.name, "Tech A")

        // Adding the same name returns the existing profile (dedupe).
        let duplicate = try store.addTechnician(named: "Tech A")
        XCTAssertEqual(duplicate.id, profile.id)
        XCTAssertEqual(try store.technicians().count, 1)

        var session = DiagnosticSession(device: DeviceInfo(serialNumber: "ABC"), technicianName: "Tech A", appVersion: "t")
        session.results = [DiagnosticResult(kind: .battery, status: .pass)]
        try store.save(session)

        let loaded = try store.sessions()
        XCTAssertEqual(loaded.count, 1)
        XCTAssertEqual(loaded.first?.result(for: .battery)?.status, .pass)

        try store.delete(session)
        XCTAssertTrue(try store.sessions().isEmpty)
    }
}

final class KeyboardWorkflowTests: XCTestCase {
    func testLayoutCoversCoreKeys() {
        let layout = KeyboardLayout.standard
        let codes = Set(layout.map(\.keyCode))
        // ANSI alphas + digits + common utilities
        for code in [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17,
                     18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
                     36, 48, 49, 51, 53, 123, 124, 125, 126] {
            XCTAssertTrue(codes.contains(code), "keycode \(code) missing")
        }
    }

    func testUntestedKeysStartsWithExpectations() {
        let capture = KeyboardCapture()
        let untested = capture.untestedKeys()
        // Letters A (0), S (1) etc should be untested initially.
        XCTAssertTrue(untested.contains(0))
        XCTAssertTrue(untested.contains(1))
    }
}

final class RealHardwareSmokeTests: XCTestCase {
    func testSystemInfoPopulates() {
        let info = SystemInfoService().collect()
        // On a real Mac, model ID and OS version are present.
        XCTAssertNotEqual(info.osVersion, DeviceInfo.unavailable)
        XCTAssertNotEqual(info.modelIdentifier, DeviceInfo.unavailable)
        XCTAssertNotEqual(info.architecture, DeviceInfo.unavailable)
    }

    func testBatteryReaderRuns() {
        let readings = BatteryReader().read()
        // May be a desktop without battery; must not crash and must report presence.
        _ = readings.present
    }

    func testStorageDetectsVolumes() {
        let diag = StorageDiagnostic()
        let volumes = diag.enumerableVolumes()
        XCTAssertFalse(volumes.isEmpty, "At least the boot volume should be enumerable")
    }

    func testAudioDeviceProbe() {
        // Should return the default output device name on a real Mac.
        let output = AudioDeviceProbe.defaultOutput()
        XCTAssertNotNil(output)
        XCTAssertFalse(output!.name.isEmpty)
    }

    func testDiagnosticRegistryCompleteness() {
        let registry = DefaultRegistry.make()
        // All 13 kinds should be represented across automated + manual.
        let allKinds = registry.all.map(\.kind)
        for kind in DiagnosticKind.allCases {
            XCTAssertTrue(allKinds.contains(kind), "Missing diagnostic for \(kind.rawValue)")
        }
        XCTAssertEqual(registry.automated.count, 7)
        XCTAssertEqual(registry.manual.count, 6)
    }
}