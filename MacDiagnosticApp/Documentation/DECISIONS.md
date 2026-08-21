# PHASE 3–17 — Implementation Decisions & Limitations

## Storage decision (Phase 5 revision)
`SwiftData` (`@Model`) was the original choice; the CLI-only toolchain on this
machine (no Xcode) cannot expand the `SwiftDataMacros` plugin, so builds failed.
Per the "simplest reliable solution" requirement the DB was implemented as a
dependency-free **JSON-file store** (`DiagnosticStore`) with a small, stable
interface so a SwiftData/SQLite backend can replace it at packaging time
without touching UI. ISO8601-encoded dates, NSLock-guarded, atomic writes,
in-memory mode for tests.

## API feasibility findings confirmed on real hardware
- **Battery health**: on Apple Silicon, `AppleSmartBattery.MaxCapacity` is a
  percentage (0–100); real mAh lives in `AppleRawMaxCapacity` vs
  `DesignCapacity`. Doctor now reads the raw values (verified: 84% on this Mac).
- **Microphone temp**: `AppleSmartBattery.Temperature` is unscaled/raw on some
  quarks; `AverageTemperature` (tenths °C) is the reliable source.
- **Sensors**: ambient light/lid/orientation are NOT exposed via public APIs →
  reported `NOT AVAILABLE`. Only thermal state is public.
- **Storage**: SMART health is not exposed by public macOS APIs → `NOT
  AVAILABLE` with explicit copy. Encryption status also not exposed via
  `URLResourceKeys` in this SDK → `NOT AVAILABLE` (honesty over fabrication).
- **RAM**: readouts are not a physical stress test; copy states Apple Diagnostic
  mode is required for full testing.

## Concurrency choice
Package uses `swift-tools-version: 6.0` with language mode 5 semantics to keep
the provider/actor surface simple; engine is `@MainActor`, registry is a value
type, concurrency-sensitive pieces (`PathBox`) use explicit locking.

## Assumed recommendations recorded during Phase 1
Technician-only, local profiles (picker, no PIN), fully offline, text-only
branding, PDF/JSON/CSV export, manual tests pause the automated run,
per-test technician notes, Developer ID + notarized DMG distribution, guided
permission helper, English-only UI.