# Implementation Plan

Ordered phases. A phase is complete only when it builds, launches, and its acceptance criteria are
verified on this machine (or explicitly recorded as unverifiable here).

| # | Phase | Deliverables |
| --- | --- | --- |
| 1 | Foundation & dashboard | Solution, theme, navigation, shared result model, real hardware inventory, docs |
| 2 | Input & display | Full-screen display test, keyboard test, touchpad & mouse test |
| 3 | Multimedia | Speakers/headphones, microphone, camera |
| 4 | Performance & cooling | CPU, GPU, RAM stress, fan, thermal monitoring |
| 5 | Additional hardware | SSD/HDD, battery, network, Bluetooth, USB, system & Windows health |
| 6 | Workflow & reports | Automatic diagnostics, history, CSV/HTML/PDF export |
| 7 | Quality & packaging | Error handling, resource profiling, packaging, final docs |

---

## Phase 1 — Foundation and working dashboard

**Depends on:** .NET 8 SDK, WPF tooling.

Deliverables:

- [x] Solution + project in `WindowsLaptopDiagnostics/`
- [x] `app.manifest` (PerMonitorV2 DPI, `asInvoker`, Win10/11 compatibility)
- [x] Dark charcoal/navy theme with cyan accents (`Resources/Theme.xaml`)
- [x] MVVM infrastructure (`ObservableObject`, `RelayCommand`, `AsyncRelayCommand`, converters)
- [x] Shared result model (`Core/TestModels.cs`) with the nine statuses
- [x] Test catalogue — 20 tests with name, purpose, instructions, category
- [x] Sidebar navigation, grouped, with search/filter
- [x] Dashboard populated from real WMI/P-Invoke reads
- [x] Honest `Unsupported`/`Unavailable` states and honest placeholder pages
- [x] `README.md`, `ARCHITECTURE.md`, `PROJECT_STATUS.md`, `IMPLEMENTATION_PLAN.md`

**Acceptance criteria**

| # | Criterion | Verified |
| --- | --- | --- |
| 1.1 | `dotnet build` succeeds with 0 errors, 0 warnings | ✅ |
| 1.2 | App launches and stays running | ✅ |
| 1.3 | Sidebar lists all sections grouped and selectable | ✅ |
| 1.4 | Dashboard CPU/memory/GPU/storage/battery values match `systeminfo`/Task Manager | ✅ (Lenovo MTPL-8759, i5-1135G7 4C/8T, 15.7 GB, Iris Xe, WDC SN730, 95% battery) |
| 1.5 | Unavailable values render as `Unsupported`/`Unavailable`, never invented | ✅ (e.g. remote-display adapter VRAM) |
| 1.6 | Unimplemented pages state so explicitly and run no measurement | ✅ |
| 1.7 | Window resize and DPI scaling keep layout usable | ✅ |

---

## Phase 2 — Input and display — ✅ COMPLETE

**Depends on:** Phase 1.

### 2.1 Display test
- Pattern set: black, white, R, G, B, mid-gray, grayscale ramp, colour ramp/contrast,
  checkerboard, geometry/1px grid, brightness-uniformity fields, dead-pixel guidance.
- Multi-monitor enumeration (`EnumDisplayDevices`/`QueryDisplayConfig`), monitor picker.
- Full-screen over the target display; translucent auto-hiding control overlay that reappears on
  pointer or key activity; **Esc exits** and restores prior window state.
- Next/prev/pause/restart/exit, keyboard accessible.
- Shows real resolution + refresh rate for the selected display.
- Dead/stuck pixel check is labelled **manual visual inspection** and requires user confirmation.

**Acceptance:** pattern switching, full-screen entry/exit, multi-monitor selection, overlay
auto-hide/re-show, Esc restore — all observed live.

- [x] 15 patterns (solid / gradient / geometry / uniform)
- [x] Real display-head enumeration with mode + position
- [x] Full-screen session on the target display (`DisplaySessionWindow`)
- [x] Auto-hiding overlay (3 s) re-shown on pointer/key activity
- [x] Esc exits and restores the parent window; focus returned
- [x] Manual dead/stuck-pixel confirmation recorded, never auto-claimed

### 2.2 Keyboard test
- On-screen layout for the detected/selected layout (ANSI QWERTY, function row, nav cluster, numpad,
  modifiers).
- `PreviewKeyDown`/`PreviewKeyUp` highlight pressed/recent states, count presses and repeats.
- Tested-key count and percentage; reset/restart.
- Held keys never remain visually stuck; monitoring stops on page exit.
- Never records characters — only key identity.

**Acceptance:** physical key presses highlight the correct on-screen key; coverage counter updates;
focus loss clears stuck keys; no text is stored.

- [x] 103-key ANSI layout (F-row, nav cluster, arrows, numpad) with relative key widths
- [x] Window-level `PreviewKeyDown`/`PreviewKeyUp` hooked only while the page is loaded
- [x] Untested → Pressed (cyan) → Tested (green) state machine; coverage % + counters
- [x] Auto-repeat counted separately, never re-marks coverage
- [x] Focus loss releases all pressed keys (no stuck visuals)
- [x] Text inputs excluded so typed characters are never recorded
- [x] Honest list of keys Windows/firmware consumes before apps see them

### 2.3 Touchpad & mouse
- Live X/Y over a defined surface, movement trail, left/right click indicators and counts, drag and
  wheel checks, reset.
- Reports the source honestly: `Win32_PointingDevice` + pointer flags used to distinguish touchpad
  vs external mouse; when it cannot be determined, the result says *general mouse/pointer input*.

**Acceptance:** coordinates track live, clicks counted, trail drawn, source label shown.

- [x] Defined test surface with real pixel bounds shown on-screen
- [x] Live X/Y, path length, move/left/right/wheel/drag counters
- [x] Movement trail + current-position dot (non-hit-testable — see fix #9)
- [x] Observed-checks list where every row is a real event, never assumed
- [x] Source attribution from `Win32_PointingDevice`, labelled *general pointer input*
      when the touchpad cannot be proven as the origin

---

## Phase 3 — Multimedia — ✅ COMPLETE

**Depends on:** NAudio, OpenCvSharp4 (added in Phase 1 csproj).

### 3.1 Speakers & headphones
- Enumerate output endpoints, device picker, volume guidance.
- Left / right / stereo / mono tones with correct channel routing where supported, **immediate Stop**.
- `Passed` only after explicit user confirmation of what was audible.

**Done:** Core Audio endpoints with live volume/mute/channel count/default flag; tones generated in
the device's *actual* mix format (float32 or 16-bit PCM, whichever it supports); distinct pitches
per channel (440/880/660 Hz); single-channel endpoints honestly refuse right/stereo; per-route
"heard / not heard" recorded separately and never merged into an automatic pass.

### 3.2 Microphone
- Input-device picker, sample rate/channel info, live waveform + level meter, clipping indicator.
- Start/Stop/Play/Delete/Reset, elapsed duration, explicit user action only.
- Capture stops on page exit; temp recordings cleaned on delete/exit.

**Done:** capture endpoints enumerated via WASAPI (the same API used to open them — MME reports 0
devices on this machine); the format actually granted is displayed and may differ from the request;
level/peak in dBFS from real samples, waveform envelope, clipping flag, elapsed timer; recording is
always written as 16-bit PCM so playback never depends on the device format; Start is disabled when
no endpoint exists; failed capture deletes its header-only file.

### 3.3 Camera
- Enumerate cameras, device picker, live preview, **real** frame count, **measured** FPS over a
  defined window, actual capture resolution, Start/Stop/Restart.
- Access-conflict and device-busy errors surfaced; device released on stop/exit.

**Done:** MSMF probe with DirectShow fallback; BGRA frame conversion on a background thread into a
`WriteableBitmap`; frame count and FPS measured over a rolling 2-second window from frames actually
delivered (never taken from the advertised rate); resolution read from the incoming frames; access
conflicts surfaced as errors; device released on Stop and on page exit.

**Acceptance:** each device lists real endpoints; stop actions release the device immediately;
measured FPS changes with load rather than being constant.

**Verified:** endpoint `Remote Audio` with `Volume 100% · Windows default · 2 ch`; playback reported
`Playing Left route on Remote Audio`; `Tested 1 of 4 routes` after one confirmation; camera `382
frames · 29.8 fps measured` against `advertised @ 30 fps`, `640×480`, `Stopped. 197 frames
delivered.`; microphone honestly reports `Windows reports no active audio capture endpoint` with
`Start` disabled and peak at the −60 dBFS floor.

### 3.4 Defects found while verifying

- MME (`waveInGetNumDevs`) reports 0 capture devices while WASAPI reports one — enumeration and
  capture used different APIs → both moved to WASAPI.
- Camera read thread was created but never `Start()`ed → preview stayed black while the counter
  silently stayed at 0.
- Camera resolution was only written when the bitmap was *created*, so a Stop→Start cycle showed
  `—`; it now follows the incoming frame dimensions.
- Microphone peak defaulted to `0.0 dBFS` (full scale) with no capture running → starts at −60.
- `Start` stayed enabled with no endpoint selected → command now requires a real endpoint.
- A failed capture left a 46-byte header-only WAV that looked like a real recording → deleted.
- `AudioService.cs` UTF-8 was corrupted to ANSI by a shell truncation - the em dash in the Stereo
  text rendered as three Latin-1 characters; repaired and the remaining non-ASCII verified as intentional.

---

## Phase 4 — Performance and cooling — ✓ COMPLETE

- **CPU:** bounded multi-threaded workload, configurable duration (default conservative), progress,
  cancel, safety limits (temperature/EC/elapsed) that stop or warn, metrics recorded.
- **GPU:** adapter list, telemetry where exposed, bounded rendering workload with progress/cancel.
- **RAM:** configurable bounded allocation, pattern write/read verification, mismatch reporting,
  guaranteed release; documented as not equivalent to a bootable memory diagnostic.
- **Fan:** 10-second maximum-speed test only with a documented vendor-supported control method;
  always confirm → save previous state → apply → ≤10 s → restore (also on cancel/fault). Otherwise
  a cooling-observation test with an explicit limitation note.
- **Thermal:** CPU/GPU temperature, RPM, clocks, utilization, throttling indicator — each with
  source, `Unsupported` when the sensor is absent.

**Acceptance:** cancel returns within ~1 s and leaves CPU load back to idle; workload never exceeds
its duration; no partial allocation survives cancel/fault.

### 4.1 Acceptance — measured evidence

| Criterion | Result |
| --- | --- |
| Cancel returns within ~1 s, load back to idle | ✅ **89 % → 2.8 % in 0.6 s**, clock 3829 → 1200 MHz (Windows counters sampled independently of the app) |
| Workload never exceeds its duration | ✅ deadline re-checked every loop iteration, not on a timer that could be starved |
| No partial allocation survives cancel/fault | ✅ `finally` releases the block, collects, then reports; verified `The allocated block has been released` |
| Progress and cancellation are live | ✅ progress, elapsed, load, clock, per-thread bars all update during a run |
| Defaults are conservative | ✅ 30 s duration, 7 of 8 threads (leaves one free for the UI) |
| Thermal limit only claims to be armed when it is | ✅ states *NOT armed — needs administrator rights* rather than implying protection |
| Fan control withheld without a documented, restorable method | ✅ observation mode with the reason printed on screen |
| `Unsupported` used only when truly absent | ✅ fan RPM `Unsupported`; temperature `Permission Required` (distinct, and elevation is named as the remedy) |

### 4.2 What this machine actually exposes

Read before implementation so honesty is grounded in fact rather than assumption:

| Sensor | Source | State here |
| --- | --- | --- |
| CPU utilisation / clock (per-thread) | `Win32_PerfFormattedData_Counters_ProcessorInformation` | ✅ available — load, `ActualFrequency`, `PerformanceLimitFlags` |
| CPU temperature | `MSAcpi_ThermalZoneTemperature` (`root\wmi`) | ⚠ **Access denied** → `Permission Required` (needs elevation) |
| Fan RPM | `Win32_Fan` | ⛔ 0 rows → `Unsupported` |
| GPU adapters | `Win32_VideoController` | ✅ Iris Xe + Remote Display Adapter |
| GPU engine utilisation / memory | `GPUPerformanceCounters` (`GPUEngine`, `GPUAdapterMemory`) | ✅ available for the physical adapter; **not** for the indirect display |
| Free/total RAM | `Win32_OperatingSystem` | ✅ available |

### 4.3 Defects found while verifying

- Temperature was reported `Unsupported — firmware does not expose a thermal zone` while Windows
  was actually answering *Access denied*; WMI raises that as `ManagementException`, so the wrong
  catch block handled it. Added `IsAccessDenied()` — now `Permission Required`, and the UI names
  elevation as the remedy instead of telling the technician it is impossible.
- The UI asserted *"a performance limit is in effect"* while the clock was boosting to 3829 MHz.
  `PerformanceLimitFlags = 2` is reported at idle too, so a non-zero flag is not evidence of active
  throttling → the raw value is surfaced and clock-vs-max is given as the judgement.
- A GPU card was named **Microsoft** instead of *Microsoft Remote Display Adapter* (first word only
  from a split) → split on the `is an indirect` marker instead.
- After a run ended the tiles still read `81.8 % CPU load` with nothing qualifying it → added a
  caption that says *live* during a run and *last sample … idle again now* afterwards.
- `TextBox`/`ComboBox` rendered in OS light chrome on the dark theme (no style existed) → dark
  templates added; verified on CPU, RAM and the pre-existing Display page.
- Clipped text: the amber throttle line and the thermal source names both needed
  `TextWrapping="Wrap"`.
- Build breaks: `Task[]` has no `Wait(TimeSpan)` (→ `Task.WaitAll`); `ReadCpu(out _)` bound to a
  `_` **parameter** of the enclosing Timer lambda rather than a discard (→ named `out`);
  `SensorState` had no `Label()` extension.

---

## Phase 5 - Additional hardware - ✅ COMPLETE

- **Storage:** inventory, interface, capacity, volume usage, SMART/health read-only, read-only
  accessibility check. No writes, no formats, no destructive patterns.
- **Battery:** charge, AC state, design vs full-charge capacity, wear estimate only when both
  capacities are exposed; otherwise `Unavailable`.
- **Network:** adapter state, IP/gateway/DNS, gateway reachability, optional latency/internet probe
  on request, issue localised to adapter vs router vs DNS vs internet where evidence permits.
- **Bluetooth:** adapter presence; discovery requirements stated explicitly and gated on permission.
- **USB:** controller/device enumeration + guided known-good-device manual check; detection evidence
  reported separately from unresolved manual checks.
- **System / Windows health:** inventory, Windows build, driver problems
  (`Win32_PnPEntity.ConfigManagerErrorCode`), read-only servicing state, admin-needed items labelled.

**Acceptance:** each page returns real data or an explicit `Unsupported` with a reason.

### 5.1 Acceptance - measured evidence

| Criterion | Result |
| --- | --- |
| Every page returns real data or an explicit gap with a reason | ✅ all 7 pages render live Windows reads; no page shows a placeholder |
| Storage is strictly read-only | ✅ the only probe opens existing data for reading; no file created, altered or deleted |
| SMART is never fabricated, and never needlessly hidden | ✅ reports `OK`, while stating that raw attributes are not exposed through WMI |
| Wear only when both capacities exist | ✅ design 45000 mWh + full 32140 mWh → **28.6 %** measured |
| The wear note cannot contradict the numbers beside it | ✅ note/title generated from the reading (fixed a static claim of *unavailable*) |
| Opening the Network page causes no outbound traffic | ✅ status reads *No traffic has been sent yet*; probes require an explicit opt-in |
| Fault is localised to the smallest scope the evidence supports | ✅ staged adapter → gateway → DNS → internet, stopping at the first failure |
| Manual checks never auto-pass | ✅ at 0 ticks: *No manual check confirmed yet - nothing is treated as passing* |
| Detection evidence reported separately from manual checks | ✅ two summaries, never merged |
| `Unavailable` used instead of invented values | ✅ every unreadable field says so and names the source of the refusal |
| Admin-needed remediation labelled, never executed | ✅ *Read-only - nothing is installed or repaired here* |
| UI never freezes | ✅ all 7 pages read on a background task and marshal to the dispatcher |

### 5.2 What this machine actually exposes

Read before implementation so honesty is grounded in fact rather than assumption:

| Item | Source | State here |
| --- | --- | --- |
| Disk status / SMART summary | `Win32_DiskDrive` | ✅ available - `Status = OK` (**`PredictFailure` is not queryable**) |
| Volume usage + read access | `DriveInfo` / directory enumeration | ✅ available - `C: 14.7 % used`, listing readable |
| Battery charge / AC / charging | `Win32_Battery`, power status | ✅ available - 95 %, on AC, not charging |
| Design capacity | `root\wmi` `BatteryStaticData` | ✅ available - **45000 mWh** (fails through CIM, succeeds through `ManagementObjectSearcher`) |
| Full-charge capacity | `root\wmi` `BatteryFullChargedCapacity` | ✅ available - **32140 mWh** |
| Adapter addressing | `Win32_NetworkAdapterConfiguration` | ✅ available - AX200, IP/GW/DNS (**`NetConnectionStatus` is not a property of this class**) |
| Install date | `Win32_OperatingSystem.InstallDate` | ✅ available as a **DMTF** timestamp, not Unix seconds |
| Bluetooth radio | `Win32_PnPEntity` `PNPClass='Bluetooth'` | ✅ Intel Wireless Bluetooth radio + 3 enumerator nodes |
| USB devices/controllers | `Win32_PnPEntity` (`PNPDeviceID` starts `USB`) | ✅ 7 entries, all healthy |
| Device problem codes | `Win32_PnPEntity.ConfigManagerErrorCode` | ✅ 197 devices, all `0` |
| Installed updates | `Win32_QuickFixEngineering` | ✅ 7 reported (an empty list would *not* mean unpatched) |

### 5.3 Defects found while verifying

- **SMART reported `Unavailable` while the same card showed Windows status `OK`.** A combined
  `SELECT Status,PredictFailure` fails as *Invalid query* on this system, so the readable value was
  lost with the unreadable one - the same failure shape as the network adapter below. The two
  properties are now queried separately.
- **The Network page claimed *No IP-enabled adapter reported by Windows*** even though an adapter
  held an IP. `NetConnectionStatus` belongs to `Win32_NetworkAdapter`; including it invalidated the
  entire `SELECT` and the exception was swallowed into an empty list.
- **Windows install date read `Unavailable`.** WMI returns `InstallDate` as a DMTF timestamp
  (`20250523162303.000000+330`), but it was parsed as Unix seconds - now read through
  `ManagementDateTimeConverter` and shown as `2025-05-23`.
- **The battery page contradicted itself:** a static card asserted *design capacity is not exposed
  on this machine* while the row beside it read `Design 45000 mWh` and `wear 28.6 %`. The card's
  title and text are now derived from the live reading, so the two can no longer disagree.
- **Build breaks:** `HttpClient` needed `using System.Net.Http`; `DateTimeOffset` exposes
  `LocalDateTime` as a property, not a method; `RelayCommand<T>` does not exist (probes use
  `AsyncRelayCommand`); new pattern variables `d`/`f` collided with ones bound earlier in the same
  scope.
- **USB checklist text clipped** at the panel edge - `CheckBox` content does not wrap, so the text
  moved into an inner `TextBlock` with `TextWrapping="Wrap"`.

---

## Phase 6 — Workflow and reports

- Automatic diagnostics: category selection, per-test purpose, sequence with pauses, skip
  unsupported with reason, per-test state, cancel with cleanup, summary counts
  (passed/failed/warning/unsupported/cancelled/not run — skipped ≠ passed).
- History: session store, recent results, search/filter/sort, detail inspection.
- Export: CSV, self-contained HTML, PDF via print-to-PDF.
- Privacy: typed text, audio, video, sensitive IDs excluded unless explicitly selected.

**Acceptance:** a full run produces a correct summary; export opens outside the app; history
survives restart.

---

## Phase 7 — Quality and packaging

- Error paths, edge cases (no battery, no camera, no Wi-Fi, non-admin, RDP session).
- Resource profiling: startup time, idle memory, package size.
- Regression build + test run.
- Self-contained publish and installer where practical.
- Final docs + `docs/Known-Limitations.md`.

---

## Risk register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| OEM hides thermal/fan sensors | Fan/thermal tests degrade | Report `Unsupported` with reason; offer cooling-observation test |
| No writable fan control interface | Max-fan test impossible | Never fake it; document and offer observation only |
| Camera/mic busy in another app | Capture fails | Surface access-conflict error, release reliably |
| GPU telemetry unavailable (iGPU/RDP) | GPU metrics empty | Report `Unsupported`; render workload still meaningful |
| Headless/remote session | Device tests inapplicable | Record compatibility note on each outcome |
| Per-user .NET install | App fails to launch (`hostfxr` unresolved) | Set `DOTNET_ROOT`; documented in README |
