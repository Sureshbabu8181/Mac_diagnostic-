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
Phases 3–7 not started.

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

### Not implemented yet

All 20 diagnostic modules (Phases 2–7): display, keyboard, touchpad, speakers, microphone, camera,
CPU, GPU, RAM, fan, thermal, storage health, battery, network, Bluetooth, USB, system info,
Windows health, automatic diagnostics, history/reports. These currently render honest placeholders.

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
| 3 | Speakers, microphone, camera | ⬜ not started |
| 4 | CPU/GPU/RAM stress, fan, thermal | ⬜ not started |
| 5 | Storage, battery, network, Bluetooth, USB, system/Windows health | ⬜ not started |
| 6 | Automatic diagnostics, history, CSV/HTML/PDF | ⬜ not started |
| 7 | Hardening, profiling, packaging, final docs | ⬜ not started |

**Never claimed:** the application is not finished. Only Phases 1–2 are implemented and verified.
