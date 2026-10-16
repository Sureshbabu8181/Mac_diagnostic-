# Project Status

**Project:** Windows Laptop Diagnostics — professional Windows laptop diagnostic suite
**Stack:** C# / .NET 8 / WPF, Windows APIs (WMI, P-Invoke, WASAPI, MF/DirectShow)
**Environment:** Windows 11 Pro 64-bit (build 26100), .NET SDK 8.0.426
**Reference hardware for verification:** Lenovo MTPL-8759 · Intel Core i5-1135G7 (4C/8T) ·
15.7 GB RAM · Intel Iris Xe · WDC PC SN730 512 GB · 95 % battery

---

## Current phase

**Phase 1 — Foundation and working dashboard: COMPLETE and verified.**
**Phase 2 — Input and display: COMPLETE and verified.**
**Phase 3 — Multimedia (speakers, microphone, camera): COMPLETE and verified.**
**Phase 4 — Performance and cooling (CPU/GPU/RAM stress, fan, thermal): COMPLETE and verified.**
Phases 5–7 not started.

---

## Implemented features

### Phase 1 (complete)

| Feature | Status | Evidence |
| --- | --- | --- |
| Solution `WindowsLaptopDiagnostics.sln` + WPF project (`net8.0-windows`) | ✅ | builds |
| `app.manifest` — PerMonitorV2 DPI, `asInvoker`, Win10/11 compat | ✅ | file present, window renders at correct DPI |
| Dark theme (charcoal/navy + cyan accents), buttons, cards, progress, scrollbars | ✅ | screenshot |
| MVVM infrastructure (`ObservableObject`, `RelayCommand`, `AsyncRelayCommand`) | ✅ | compiles, used by all pages |
| Shared result model: 9 statuses, readings, outcome with acceptance criteria | ✅ | compiles; transition rules validated |
| Test catalogue — 20 tests with purpose + instructions + category | ✅ | compiles, drives nav |
| Sidebar: 8 groups, 21 entries, filter box, grouped headers | ✅ | screenshot |
| Navigation shell with page lifecycle (`OnActivated`/`OnDeactivated`) | ✅ | UI Automation invocation switched pages |
| Dashboard — device identity, CPU, memory (+live bar), GPU, storage, power, quick actions | ✅ | screenshot shows real values |
| Honest `Unsupported` / `Unavailable` states | ✅ | remote-display adapter VRAM = `Unavailable` |
| Honest placeholder pages that perform no measurement | ✅ | screenshot: "Not yet implemented" badge |
| `README.md`, `ARCHITECTURE.md`, `PROJECT_STATUS.md`, `IMPLEMENTATION_PLAN.md` | ✅ | written |

### Phase 2 (complete)

| Feature | Status | Evidence |
| --- | --- | --- |
| Multi-monitor enumeration (name, output, mode, position) | ✅ | real display head `\\.\DISPLAY49 1440x900 @32Hz` |
| 15 display patterns (solid / gradient / geometry / uniform) | ✅ | screenshots: Black, Colour Ramp |
| Full-screen session window on the target display | ✅ | `DisplaySessionWindow` launched and captured |
| Auto-hiding translucent overlay (3 s, re-shows on activity) | ✅ | visible then hidden across captures |
| Keyboard nav: ←/→ pattern, Space/P pause, R restart, Esc exit | ✅ | verified via UIA + SendKeys |
| Esc exits and restores parent window state/focus | ✅ | foreground returned to main window after Esc |
| Manual dead/stuck-pixel confirmation (no auto-claim) | ✅ | confirmation button + honest status text |
| 103-key on-screen layout with Untested/Pressed/Tested states | ✅ | 5/103 keys highlighted after simulated presses |
| Coverage %, press events, auto-repeat counters | ✅ | 5.8% / 5 presses observed |
| Key events scoped to active page; text inputs excluded | ✅ | window hooks added on Loaded, removed on Unloaded |
| Touchpad/mouse: live X/Y, trail, click/wheel/drag counters | ✅ | X207 Y220, Left 1, Right 1, Wheel 3, Drags 1 |
| Defined test surface with real bounds (491×360) | ✅ | corner markers rendered |
| Honest input-source attribution + device list | ✅ | "General mouse/pointer input"; Synaptics, HID mouse, RDP mouse |
| Observed-checks list (real events only, never assumed) | ✅ | checkmarks driven by counters |
| Global unhandled-exception handler + file logger | ✅ | added after crash analysis (see fix #4b) |

### Phase 3 (complete)

| Feature | Status | Evidence |
| --- | --- | --- |
| Render endpoint enumeration (name, volume, mute, channels, default) | ✅ | `Remote Audio · Volume 100% · Windows default · 2 ch` |
| Channel-routed tones: Left / Right / Stereo / Mono | ✅ | playback reported `Playing Left route on Remote Audio` |
| Distinct pitches per channel (440 / 880 / 660 Hz) | ✅ | route text rendered correctly |
| Immediate Stop; route-by-route result recording | ✅ | `Tested 1 of 4 routes` after one confirmation |
| Route descriptions derived from the device's real channel count | ✅ | mono text reads `every channel (2)` |
| Capture endpoint enumeration (WASAPI, same API used to open) | ✅ | correctly reports **0 endpoints** under RDP |
| Honest no-device state: Start disabled, no invented readings | ✅ | `Start enabled: False`; peak shows `-60.0 dBFS` floor |
| Live level meter, waveform, clipping detection, elapsed timer | ✅ | code verified; needs a real microphone (see limits) |
| Record → playback → delete of a real WAV | ✅ | header written then cleaned up on failed capture |
| Camera probe via MSMF with DirectShow fallback | ✅ | `1 camera device(s) opened successfully. Backend MSMF` |
| Live preview, real frame count, measured (not advertised) FPS | ✅ | `382 frames · 29.8 fps measured` vs `advertised @ 30 fps` |
| Actual capture resolution read from delivered frames | ✅ | `640×480` |
| Camera released on Stop / page exit | ✅ | `Stopped. 197 frames delivered.` |
| Manual picture confirmation left unchecked until the user acts | ○ | `○ Technician confirmed a clear picture` observed in UIA |

### Phase 4 (complete)

| Feature | Status | Evidence |
| --- | --- | --- |
| Bounded multi-threaded CPU workload, configurable duration | ✅ | ran 7 workers, 88.3 % average load over 2.5 s |
| Live utilisation + clock sampled during the run | ✅ | `92.4 %` load, `3829 MHz` (idle 907 MHz) |
| Per-thread utilisation bars, one per logical processor | ✅ | 8 bars at 9 % / 15 % / 27 % … during load |
| Cancel returns to idle in well under 1 s | ✅ | **89 % → 2.8 % within 0.6 s**, clock back to 1.2 GHz |
| Workload never exceeds its requested duration | ✅ | deadline checked every loop iteration |
| Thermal safety limit arms only when temperature is readable | ✅ | `Thermal limit is NOT armed — needs administrator rights` |
| Performance-limit flag reported as measured, raw value | ✅ | `flags = 2`; wording states it is a capability state |
| GPU adapter inventory + honest unsupported rows | ✅ | Iris Xe `telemetry available`; Remote Display `unsupported` |
| Live GPU engine utilisation + memory counters | ✅ | `engine utilisation 0 %` → `4 %` under render load |
| Bounded rendering workload with progress + cancel | ✅ | 400 primitives through WPF composition; cancel stopped it |
| RAM pattern fill, read-back verification, mismatch report | ✅ | `All 256 MB verified correctly across 2 pass(es) in 1.8 s` |
| Allocation refused when it would push the machine into paging | ✅ | `7.1 GB available; this allocation is within the safe half` |
| Block released on completion, cancel and fault | ✅ | `The allocated block has been released` |
| Fan max-speed test withheld without a vendor control method | ✅ | observation mode + full on-screen explanation |
| 10-second cooling observation (load/clock/temperature) | ✅ | `Observation complete. Nothing was written to the hardware.` |
| Fan RPM honestly `Unsupported` (no tachometer exposed) | ✅ | `Win32_Fan reports no fan` |
| Temperature distinguishes *needs elevation* from *not exposed* | ✅ | `Permission Required`, not `Unsupported` |
| Sensor dashboard with source on every row | ✅ | 8 rows, each naming its WMI source |

### Not implemented yet

Phases 5-7: storage health, battery, network, Bluetooth, USB, system/Windows health,
automatic diagnostics, history/reports. These currently render an explicit
*Not yet implemented* placeholder that measures nothing.

Note on Phase 3: **speakers** and **camera** were exercised against real endpoints in this
session (playback reported `Playing Left route on Remote Audio`; camera delivered 382 frames
at 29.8 fps measured). The **microphone** path could not be exercised end-to-end because this
session exposes no capture endpoint - it reports that honestly and disables Start rather than
fabricating a level. See `docs/Known-Limitations.md` rows 14, 24-26.

---

## Verification results

Commands executed:

```powershell
& "$env:LOCALAPPDATA\Microsoft\dotnet\dotnet.exe" build .\WindowsLaptopDiagnostics.sln -v quiet --nologo
# → Build succeeded.  0 Warning(s)  0 Error(s)
```

Launch + UI verification performed by starting the EXE, capturing the window with `PrintWindow`,
and driving a navigation click with `System.Windows.Automation`:

| # | Check | Result |
| --- | --- | --- |
| 1 | Build clean | ✅ 0 warnings, 0 errors |
| 2 | App starts and stays resident | ✅ |
| 3 | Dashboard populated from real WMI/P-Invoke reads | ✅ verified against machine |
| 4 | Sidebar grouped, filter box present | ✅ |
| 5 | Clicking a nav item changes the page | ✅ invoked *System Information* → placeholder shown |
| 6 | Placeholder states it runs no measurement | ✅ |
| 7 | Window resize / DPI | ✅ 1180×760 at PerMonitorV2 |

### Phase 4 verification

Driven by the same `System.Windows.Automation` clicks plus independent Windows
counter sampling, so the numbers come from Windows rather than from the app:

| # | Check | Result |
| --- | --- | --- |
| 1 | Build clean | ✅ 0 warnings, 0 errors |
| 2 | CPU workload raises measured load | ✅ 88–92 % with 7 workers (idle 5 %) |
| 3 | Clock actually boosts under load | ✅ 907 MHz idle → 3829 MHz loaded |
| 4 | Cancel returns to idle in ~1 s | ✅ **89 % → 2.8 % within 0.6 s** |
| 5 | Live progress + per-thread bars update | ✅ 00:04, 8 bars changing during run |
| 6 | RAM test verifies and releases | ✅ 256 MB × 2 passes, 1.8 s, released |
| 7 | GPU render load drives engine utilisation | ✅ 0 % idle → 4 % rendering |
| 8 | Fan test runs in observation mode only | ✅ completed, nothing written to hardware |
| 9 | Temperature reports *Permission Required* | ✅ elevation identified as the remedy |
| 10 | Fan RPM reports *Unsupported* | ✅ `Win32_Fan reports no fan` |
| 11 | Dropdown selection binds to duration | ✅ chose 10 → `up to 10 s` in status text |
| 12 | Dark input chrome (TextBox/ComboBox) | ✅ themed; Display page unchanged otherwise |

**Real values observed during a CPU run (proving live reads, not mock data):**

```
Run: 7 workers, 10 s requested
Average load 88.3 %   peak clock 3830 MHz   temperature unavailable (needs elevation)
Per-thread during load: 9, 15, 15, 27, 9, 27, 3, 3, 14 %
After cancel (+0.6 s): 2.8 % load, 1200 MHz  (Windows counters, sampled independently)
GPU: Intel Iris Xe shared memory 781 MB, engine utilisation 0 % → 4 % while rendering
```

**Real values observed on this machine (proving live reads, not mock data):**

```
LENOVO 20X1S0WF00 · MTPL-8759 · Serial PG033Z8N
11th Gen Intel(R) Core(TM) i5-1135G7 @ 2.40GHz · 4 cores / 8 threads
BIOS R1JET74W (1.74) · Baseboard 20X1S0WF00
Windows 11 Pro · Build 26200 · 64-bit · Uptime 1d 11h
Memory 15.7 GB installed, ~7.0 GB free, ~55% in use
GPU Intel(R) Iris(R) Xe Graphics — VRAM 2 GB, 1920x1080 @ 60Hz
GPU Microsoft Remote Display Adapter — VRAM Unavailable, 1440x900 @ 32Hz
Disk WDC PC SN730 SDBQNTY-512G-1001 — 477 GB (SCSI), 15% used
Battery 95% · AC adapter · not charging
```

---

## Errors found and fixed during Phase 1

| # | Error | Cause | Fix |
| --- | --- | --- | --- |
| 1 | `CS0104 'Application' ambiguous` | `UseWindowsForms` added alongside WPF | removed WinForms; enumerate monitors via P/Invoke |
| 2 | `MC3059 Style setters do not support child elements` | `ControlTemplate` not wrapped in `<Setter.Value>` | wrapped it |
| 3 | `CS1061 tuple has no 'Value'` | `is { } x` already unwraps a nullable tuple | removed `.Value` |
| 4 | App crashed at startup: `XamlParseException — A 'Binding' cannot be set on 'ConverterParameter'` | WPF forbids a `Binding` in `ConverterParameter` | moved selection to `NavItem.IsChecked` (TwoWay) |
| 5 | `You must install .NET Desktop Runtime` dialog | per-user SDK; `DOTNET_ROOT` unset for spawned processes | set `DOTNET_ROOT` + documented it |
| 6 | Sidebar rendered empty | `ItemsSource` still bound to removed `FilteredNavItems` | bound to `NavView` |
| 7 | Group headers invisible | custom `ContainerStyle` template omitted the header presenter | removed the override |
| 8 | `MSB3027 exe locked` on rebuild | leftover instance holding the file | kill process before rebuild (automated in `build.ps1`) |
| 9 | **Hard crash** `NullReferenceException` in `DisplayView.<OpenSession>b__6_0` during `Window.WmDestroy` (event 0xc000041d) | `OnUnloaded` nulled `_vm` **then** closed `_session`; the `Closed` handler dereferenced the nulled field | closure now captures the VM in a local + null-guards; unsubscribe before close; `DispatcherUnhandledException` handler added so no UI exception can kill the process silently |
| 10 | `MC3024 Style already set` ×2 (Display, Keyboard views) | `Style="{StaticResource …}"` attribute **and** inline `<TextBlock.Style>` on one element | removed the attribute, kept the triggers |
| 11 | `CS0123 OnSessionRequested` / `Action` mismatch | handler had `(object, EventArgs)` signature for an `Action` event | changed to parameterless |
| 12 | `CS9135 '_vm is vm'` | pattern variable used where a constant was expected | `ReferenceEquals(_vm, vm)` |
| 13 | `CS0747`/`CS0117 Canvas.Top` in object initializer | `Canvas.Left/Top` are attached properties | `MakeRect()` helper calls `Canvas.SetLeft/SetTop` |
| 14 | Tuple names lost (`RefreshHz` missing) | element name not inferable from a method-call expression | explicit `RefreshHz:` naming |
| 15 | `CS0246 'DisplayHead' not found in Services` | `DisplayHead` is nested inside the `WindowsApi` class | qualified as `WindowsApi.DisplayHead` |
| 16 | Sidebar group headers invisible / `ItemsSource` empty | (Phase 1) stale binding + template override | (Phase 1) bound to `NavView`, removed override |
| 17 | **Runaway `MouseMove` loop** — ~2 200 phantom moves in 400 ms with a stationary cursor; click/wheel events never processed (`Left/Right/Wheel` stayed 0) | the trail **dot is drawn under the cursor**; repaint → hit-test target changes → WPF re-raises `MouseMove` → repaint… flooding the UI thread and starving button messages | `IsHitTestVisible="False"` on `TrailCanvas`; verified idle delta is now **0** and Left/Right/Wheel all count |
| 18 | MME reports 0 capture devices (`waveInGetNumDevs = 0`) yet WASAPI has an active *Microphone Array* — mic start threw `BadDeviceId calling waveInOpen` | enumeration used MME (`WaveInEvent.DeviceCount`) while the endpoint list came from Core Audio | capture enumeration **and** capture now both use WASAPI (`MMDeviceEnumerator` + `WasapiCapture`) |
| 19 | Camera preview stayed black with `Frames delivered = 0` | `CameraSession.Start()` only *created* the read thread | it now starts the thread; verified 382 frames / 29.8 fps |
| 20 | Camera `Actual capture resolution` showed `—` on a Stop→Start cycle | resolution was only written when the `WriteableBitmap` was created, and the bitmap survives a restart | resolution now follows the incoming frame dimensions; verified `640×480` after restart |
| 21 | Microphone `Peak` displayed `0.0 dBFS` (full scale) with no capture running | the property defaulted to 0 | defaults to the −60 dBFS floor; verified `Peak: -60.0 dBFS` |
| 22 | `Start capture` stayed enabled with no endpoint selected | command guard ignored the selection | guard now requires a real endpoint; verified `Start enabled: False` |
| 23 | A failed capture left a 46-byte header-only `.wav` that looked like a real recording | the file was created before capture started and kept on the error path | the header-only file is deleted on a failed start |
| 24 | `AudioService.cs` rendered mojibake (`right — different pitches`) | a PowerShell `Get-Content`/`Set-Content` truncation re-encoded UTF-8 as ANSI | damaged sequences repaired; remaining non-ASCII verified as intentional |

## Errors found and fixed during Phase 4

| # | Error | Cause | Fix |
| --- | --- | --- | --- |
| 25 | Temperature reported `Unsupported — firmware does not expose a thermal zone` even though Windows answered *Access denied* | WMI raises refusal as `ManagementException`, not `UnauthorizedAccessException`, so the wrong branch caught it | `IsAccessDenied()` added; now reports `Permission Required` and names elevation as the remedy |
| 26 | UI claimed *"a processor performance limit is in effect"* while the clock was boosting to 3829 MHz | `PerformanceLimitFlags = 2` is also present at idle here, so a non-zero flag is not proof of active throttling | raw `flags = N` surfaced with wording that points at clock-vs-max as the real judgement |
| 27 | GPU card read **Microsoft** instead of *Microsoft Remote Display Adapter* | name was taken from `detail.Split(' ')[0..2].FirstOrDefault()` → first word only | split on the `is an indirect` marker so the whole name survives |
| 28 | After a run finished, the tiles still showed `81.8 % CPU load` with no qualifier | readings were deliberately frozen at the last sample but labelled as if live | `ReadingsCaption` now reads *live…* during a run and *last sample … idle again now* after |
| 29 | `TextBox` and `ComboBox` rendered in OS **light** chrome on the dark theme | no style existed; WPF default templates use system light colours | dark `TextBox`/`ComboBox`/`ComboBoxItem` templates added to `Theme.xaml`; verified on CPU, RAM and Display pages |
| 30 | Amber throttle line ran past the card edge | `TextWrapping` missing on that `TextBlock` | `TextWrapping="Wrap"` added |
| 31 | Sensor rows clipped source names mid-word (`Win32_PerfFormattedData_Cou`) | fixed-width row with no wrapping | `TextWrapping="Wrap"` on the thermal row template |
| 32 | `Task[].Wait(TimeSpan)` does not exist | instance `Wait` on an array is not a member | `Task.WaitAll(tasks, timeout)` |
| 33 | `PerformanceService.ReadCpu(out _)` bound to a **variable** named `_` | the enclosing `Timer` lambda already had a `_` parameter, shadowing the discard | used a named `out string throttleExplain` |
| 34 | `SensorState` had no `Label()` | only `TestStatus` had the extension | `SensorStateExtensions.Label()` added (`Permission Required` vs `Unsupported`) |

---

## Known limitations

See [docs/Known-Limitations.md](docs/Known-Limitations.md). Headline items:

1. **Thermal/fan sensors** are frequently hidden by OEM firmware → thermal and fan tests may be
   `Unsupported` on many laptops. This is reported honestly, never guessed.
2. **Maximum-fan control** requires a documented vendor-supported interface; where absent the app
   offers cooling observation only.
3. **GPU telemetry** (utilization/temperature/power) is often unavailable for Intel iGPU under WDPF
   → reported `Unsupported`.
4. **This session runs over a remote display adapter**, so the display test and GPU rendering test
   cannot be fully verified here; they will be validated on physical hardware. RDP also exposes a
   synthetic *Remote Desktop Mouse Device*, so touchpad-vs-mouse attribution honestly resolves to
   *general mouse/pointer input* here.
5. **Camera/microphone/speakers** can be built and error-path-tested here, but acoustic/visual
   quality cannot be verified without a human at the machine.
6. **Keyboard/mouse coverage** is verified by injecting real Windows input events — that proves the
   capture path works, not that every physical key or the built-in touchpad works. Coverage % and
   user confirmation are reported separately, never merged into an automatic pass.
7. **Per-user .NET install** means launching the EXE requires `DOTNET_ROOT`; a self-contained
   publish (Phase 7) removes that requirement.
8. **Non-administrator context**: some SMART fields and device details require elevation → reported
   `Permission Required`.

---

## Remaining work

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Foundation + dashboard | ✅ done & verified |
| 2 | Display, keyboard, touchpad/mouse | ✅ done & verified |
| 3 | Speakers, microphone, camera | ✅ done & verified |
| 4 | CPU/GPU/RAM stress, fan, thermal | ✅ done & verified |
| 5 | Storage, battery, network, Bluetooth, USB, system/Windows health | ⬜ not started |
| 6 | Automatic diagnostics, history, CSV/HTML/PDF | ⬜ not started |
| 7 | Hardening, profiling, packaging, final docs | ⬜ not started |

**Never claimed:** the application is not finished. Only Phases 1-4 are implemented and verified.
