# PHASE 3 — Architecture

## Pattern
MVVM over a **diagnostic engine**. Each diagnostic is an independent provider
conforming to a small protocol; the engine orchestrates them; the SwiftUI
layer observes session state through view models. The core is a separate
library target (`MacDiagnosticKit`) so it can be unit-tested headlessly.

## Dependency graph (top → bottom)
```
MacDiagnosticApp (SwiftUI executable)   ← UI + ViewModels only
        │
        ▼
MacDiagnosticKit (library)              ← models, engine, providers, services, DB
        │
        ▼
Foundation / AppKit / IOKit / AVFoundation / CoreAudio /
CoreBluetooth / Network / SystemConfiguration / SwiftData / OSLog
```
All framework access lives in the Kit; the UI never talks to IOKit directly.

## Core types
- `DiagnosticStatus`: `notStarted, running, pass, warning, fail, skipped,
  notAvailable, manualRequired` — single source of truth for status.
- `DiagnosticKind`: the 13 test categories.
- `DiagnosticResult`: one module's outcome + measured values + note.
- `DiagnosticSession`: everything recorded for one run.
- `DeviceInfo`: detected hardware summary (model, serial, chip, CPU, GPU, RAM,
  storage, macOS version/build, arch).

## Provider protocols
- `AutomatedDiagnosticProvider`: `func run() async -> DiagnosticResult`
  (battery, storage, memory, network, sensors, system, ports detection).
- `ManualDiagnosticProvider`: no `run()`; it defines the manual screen, and the
  UI calls back into it with PASS/FAIL/SKIP verdicts. (display, keyboard,
  trackpad, speakers, microphone, camera).
- `DiagnosticProviding` (registry): lists all providers with metadata
  (`displayName`, `whyItMatters`, `isManual`, `requiresPermission`).

## Engine
`DiagnosticEngine.run(modules:technician:)` runs automated modules
sequentially, stores each `DiagnosticResult`, then emits a queue of
manual-required entries. The UI advances one manual test at a time; each
verdict is written to the session. Overall status is computed by a documented
rule (any FAIL → FAIL; any WARNING/MANUAL_REQUIRED → PASS WITH WARNING /
MANUAL REQUIRED; all PASS → PASS).

## Reporting & storage
- `ReportBuilder` renders a `DiagnosticSession` to PDF (CoreGraphics),
  JSON (Codable), and CSV — pure functions, fully unit-testable.
- `DiagnosticStore` wraps SwiftData (`@Model`) with in-memory option for tests.

## Security model
- No background event collection; key events only while the keyboard screen is
  active and the app is key.
- Mic recording is temp-file + delete; camera frames never saved.
- Guided `PermissionManager` with clear copy; request at the moment the module
  needs it.

## Logging
`AppLogger` wraps `os.Logger`, levels DEBUG/INFO/WARNING/ERROR, logs structured
strings only. Never logs passwords, typed content, audio/camera payloads, or
credentials. Export path exposed in the UI.
