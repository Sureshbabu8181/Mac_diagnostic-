# Architecture

## Goals

1. **Honest results.** One shared result model, one status vocabulary, explicit test-level
   acceptance criteria. `Passed` is never issued without evidence.
2. **Native Windows access.** WMI, Win32 P-Invoke, WASAPI, Media Foundation/DirectShow. Every
   hardware dependency has a documented fallback that degrades to `Unsupported`.
3. **Responsive UI.** No hardware enumeration, WMI query, capture loop, or stress workload runs on
   the UI thread. Every long operation is cancellable.
4. **Resource discipline.** Timers and workers start on page activation and stop on deactivation.
   Nothing polls continuously when no page is watching.

---

## Solution structure

Single WPF project (`net8.0-windows`, .NET 8) — the app is not large enough to justify multiple
assemblies. Folder-per-concern keeps module boundaries visible without project-level ceremony.

```
Core/            TestStatus, TestCategory, TestId, Reading, TestOutcome, TestCatalogue
Infrastructure/  ObservableObject, RelayCommand, AsyncRelayCommand, converters, Logger, Guard
Services/        SettingsService, HistoryStore, ReportService, AudioService, CameraService
Hardware/        WindowsApi (WMI + P/Invoke), DeviceInfoService, ThermalMonitor
Diagnostics/     IDiagnosticTest + one class per test, AutomaticDiagnostics orchestrator
Monitoring/      TelemetrySample, CpuSampler, GpuSampler (on-demand only)
ViewModels/      MainViewModel (nav shell) + one VM per page
Views/           MainWindow + one UserControl per page
```

### Dependency direction

```
Views → ViewModels → Diagnostics/Services/Hardware → Core
```

ViewModels never touch WMI or capture devices directly; they go through `Hardware` or `Services`.
`Diagnostics` knows nothing about WPF.

---

## Hardware interfaces

| Capability | Interface | Fallback when unavailable |
| --- | --- | --- |
| CPU model, cores/threads, clocks, load | `Win32_Processor`, `Win32_PerfFormattedData_Counters_ProcessorInformation`, P-Invoke `GetSystemTimes` | `Unsupported` |
| Memory totals / availability | `GlobalMemoryStatusEx` | `Unsupported` |
| GPU adapters, VRAM, driver, resolution/refresh | `Win32_VideoController` | `Unsupported` |
| GPU utilization, temperature, clocks, power | `Win32_PerfFormattedData_GPUPerformanceCounters`, P-Invoke `NVML`/`ADL` when present | `Unsupported` (most iGPU systems) |
| Physical disks, model, interface, capacity | `Win32_DiskDrive` | `Unsupported` |
| SMART / health | `IOCTL_STORAGE_QUERY_PROPERTY`, `SMART_RCV_DRIVE_DATA` (read-only) | `Unsupported` (requires admin for some data) |
| Volumes, free space | `Win32_LogicalDisk` | `Unsupported` |
| Battery charge, AC state, design/full capacity | `Win32_Battery`, `GetSystemPowerStatus` | `No battery detected` |
| Temperatures, fan RPM | `MSAcpi_ThermalZoneTemperature`, `Win32_Fan`, `Win32_TemperatureProbe` | `Unsupported` (most OEMs hide these) |
| Network adapters, IP, gateway, reachability | `Win32_NetworkAdapterConfiguration`, `NetworkInformation`, ICMP/TCP probe | `Unsupported` |
| Bluetooth | `Win32_PnPEntity` (Bluetooth class), WinRT `BluetoothLEAdvertisementWatcher` when permitted | `Unsupported` |
| USB / device enumeration | `SetupDi*`, `Win32_PnPEntity`, `Win32_USBController` | `Unsupported` |
| Display topology, modes, refresh | `EnumDisplayDevices`, `EnumDisplaySettings`, `QueryDisplayConfig` | `Unsupported` |
| Microphone capture, speaker playback | WASAPI (NAudio) | `Unsupported` / device error surfaced |
| Camera frames, FPS, resolution | DirectShow/MF (OpenCvSharp) | `Unsupported` / access-denied surfaced |
| Keyboard key events | WPF `PreviewKeyDown`/`PreviewKeyUp` while the test page has focus | `Unsupported` for hotkeys/firmware keys |
| Pointer X/Y, buttons, wheel | WPF `PreviewMouseMove`, `PreviewMouseDown/Up`, `PreviewMouseWheel` | n/a |

**Dependencies (exactly two, both justified):**

- **NAudio** — WASAPI/MMAudio device enumeration, channel-routed playback, WASAPI capture with a
  live waveform. Raw COM interop for shared-mode low-latency audio is disproportionately complex.
- **OpenCvSharp4** — camera device enumeration and frame grab with real frame counting/FPS.
  Media Foundation COM interop for `IMFSourceReader` frame loops is disproportionately complex.

`System.Management` is the only other package (official WMI projection).

---

## Shared result model

Every test produces a `TestOutcome`:

- identity: `TestId`, display name, category
- lifecycle: `StartedUtc`, `CompletedUtc`, `Duration`
- `Status` — constrained to the nine documented values
- measurements: `List<Reading>` — each with value, unit, and **measurement source**
- `Configuration`, `AcceptanceCriteria`
- `ErrorDetail` / `WarningDetail`
- `UserConfirmed` — for manual visual/acoustic inspections
- `CancellationReason`
- `CompatibilityNote` — what hardware/driver/OS dependency applied

### Status rules (enforced in code, not by convention)

`TestOutcome` is constructed through factory methods that validate transitions:
`NotRun → Ready → Running → {Passed|Warning|Failed|Unsupported|Cancelled|Error}`.
Terminal states cannot be reopened. `Passed` requires either (a) recorded measurements that satisfy
the test's own `AcceptanceCriteria`, or (b) an explicit `UserConfirmed = true` for a manual test.
Attempting `Passed` with neither throws.

Tests are classified as **automated measurement**, **automated functional check**,
**user-confirmed inspection**, **informational inventory**, or **unsupported capability** — the
class is part of the outcome so reports can distinguish them.

Examples of the honesty rules in practice:

- Opening a camera successfully → `Passed` as *functional check* (stream opens, frames arrive),
  never as "video quality verified".
- Receiving some key events → coverage percentage reported; `Passed` only when the configured
  required-key set is fully covered and the user has confirmed no unhandled dead keys.
- Speaker stream submitted without error → `Ready` for confirmation; `Passed` only after the user
  confirms they heard the correct channel.
- No thermal sensor exposed → `Unsupported` with a reason, never a guessed temperature.

---

## Diagnostics module contract

```csharp
public interface IDiagnosticTest
{
    TestId Id { get; }
    string DisplayName { get; }
    IReadOnlyList<string> Purpose { get; }   // shown to the user before running
    bool RequiresConfirmation { get; }       // pause for human observation
    Task<TestOutcome> RunAsync(TestContext ctx);
}
```

`TestContext` carries the `CancellationToken`, `IProgress<TestProgress>`, a safety-limits object,
and a recorder for measurements. Every implementation must:

1. cancel cooperatively and clean up in `finally`,
2. report progress for anything longer than ~1s,
3. stop timers/workers when it finishes or faults,
4. return an outcome — never throw past the orchestrator (an exception becomes `Error`).

The **Automatic Diagnostics** orchestrator runs a chosen subset in a safe sequence, skips
`Unsupported` tests with recorded reasons, pauses where `RequiresConfirmation`, and counts skipped
tests as *skipped*, never as passed.

---

## MVVM

- `ObservableObject` + `SetProperty<T>` for change notification with equality guard.
- `RelayCommand` / `AsyncRelayCommand` (auto-disables while running, surfaces exceptions to the
  error service rather than crashing the dispatcher).
- Pages are `PageViewModelBase` with `OnActivated` / `OnDeactivated` lifecycle so polling loops,
  capture devices, and timers are tied to page visibility.
- Navigation selection lives on `NavItem.IsChecked` (TwoWay) because WPF forbids a `Binding` inside
  `ConverterParameter`.

---

## Threading & resource rules

- WMI queries, file system, network I/O: `await Task.Run(...)`.
- Capture/stress loops: dedicated `Task` + `CancellationTokenSource`, always in `finally`.
- UI updates: `Dispatcher.InvokeAsync` only from background continuations.
- Camera/audio resources: acquired in `Start`, released in `Stop` **and** in
  `OnDeactivated` / `Unloaded` / window close.
- Idle behavior: no timers running when no monitoring page is active.

---

## Storage & reporting

- Settings: JSON under `%LOCALAPPDATA%\WindowsLaptopDiagnostics\settings.json`.
- History: JSON-lines session log (SQLite deferred until volume justifies it) under
  `%LOCALAPPDATA%\WindowsLaptopDiagnostics\history`.
- Reports: CSV and self-contained HTML; PDF via print-to-PDF of the HTML report.
- Privacy: no typed text, no audio, no video, and no telemetry leave the machine. Reports include
  serial number / hardware IDs only when the user opts in.
