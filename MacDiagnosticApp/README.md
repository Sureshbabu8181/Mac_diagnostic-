# MacDiagnosticApp — MAC HARDWARE DIAGNOSTIC CENTER

Standalone, **offline-first** hardware diagnostic tool for IT technicians.
Apple Silicon only, minimum macOS 15.

## Quick start
```sh
cd MacDiagnosticApp
swift run macdiagnostic-selftest   # run offline self-test (20 checks + live hardware readout)
swift run MacDiagnosticApp          # launch the SwiftUI app
```

## What it tests
Battery, Display (visual), Keyboard, Trackpad, Speakers, Microphone, Camera,
Ports, Storage, Memory, Network, Sensors, System. Automated modules run by
software; manual modules pause the run for technician PASS / FAIL / SKIP with
per-test notes.

## Statuses used (never fabricated)
`PASS · WARNING · FAIL · SKIPPED · NOT AVAILABLE · MANUAL REQUIRED · NOT TESTED`.
Unavailable hardware data is reported `NOT AVAILABLE` — never guessed.

## Data & privacy
- All history/reports remain on-device (JSON-file store in Application
  Support). Export to PDF / JSON / CSV.
- Key events captured only while the keyboard test screen is active.
- Mic recordings are temporary and deleted; camera frames are live-only.
- No passwords, credentials, typed text, or background collection.

## Docs
- `Documentation/PHASE2-API-Feasibility.md` — what macOS exposes (and doesn't).
- `Documentation/BUILD.md` — Xcode packaging, entitlements, notarized .dmg.
- `Documentation/DECISIONS.md` — storage/DB choice and hardware findings.

## Structure
- `Sources/MacDiagnosticKit` — models, engine, 13 diagnostics, reporting, storage.
- `Sources/MacDiagnosticApp` — SwiftUI app.
- `Sources/MacDiagnosticSelftest` — XCTest-free test runner (works without Xcode).
- `Tests/` — XCTest suite (runs under Xcode/CI).

## Currently known limits (public macOS APIs)
- SMART/SSD health: `NOT AVAILABLE`. Memory pressure is a documented proxy, not a
  RAM stress test. Ambient light/lid/orientation: `NOT AVAILABLE`. Unused physical
  ports: `MANUAL REQUIRED`.