# Known Limitations

Honest record of what this application **cannot** do on some or all machines. Nothing in this list
is worked around with fabricated data — affected tests report `Unsupported`, `Unavailable`, or
`Permission Required` with a reason.

## Hardware / firmware dependent

| # | Limitation | Affects | What the app does |
| --- | --- | --- | --- |
| 1 | Many OEMs do not expose thermal zones to WMI (`MSAcpi_ThermalZoneTemperature` absent or access-denied) | Temperature & Sensors, CPU/GPU stress safety limits, Fan | Reports `Unsupported` with the reason; continues the test with elapsed-time safety limits only |
| 2 | Consumer laptops rarely expose a documented fan-control interface | Fan maximum-speed test | Runs a cooling-observation test instead; never writes arbitrary EC registers or pretends control was performed |
| 3 | Intel iGPU typically has no vendor telemetry (no NVML/ADL) reachable from user mode | GPU utilization/temperature/clock/power | Reports `Unsupported`; the rendering workload and adapter inventory still work |
| 4 | `Win32_VideoController.AdapterRAM` is a 32-bit field, so >4 GB VRAM reads wrong | GPU VRAM | Value flagged as unreliable/`Unavailable` rather than shown as fact |
| 5 | `Win32_Battery` design/full-charge capacity is absent on many modern laptops (UCEFI/HID battery) | Battery wear % | Reports charge and AC state; wear shown as `Unavailable` — never inferred from charge level |
| 6 | SMART data access needs administrator rights for some identifiers | SSD/HDD health | Reports `Permission Required` and lists which fields need elevation |
| 7 | Windows on some OEM firmware does not expose per-port USB topology | USB port test | Reports which controllers/devices are enumerated; physical per-port pass requires the guided manual check |
| 8 | Bluetooth discovery requires location permissions on Windows 10/11 | Bluetooth | Reports `Permission Required` when the prompt was denied |

## Environment / session dependent

| # | Limitation | Affects | What the app does |
| --- | --- | --- | --- |
| 9 | This development session runs over a **remote display adapter** | Display test, GPU rendering, pointer-source detection | Full-screen patterns, refresh-rate readings and touchpad-vs-mouse discrimination must be validated on physical hardware |
| 10 | Audio/camera endpoints may be absent or in use in a remote/headless session | Speakers, Microphone, Camera | Lists whatever endpoints exist; surfaces device-busy / access-denied errors instead of failing silently |
| 11 | Running unelevated | SMART, some device details, driver repair actions | Reports `Permission Required`; never silently elevates |
| 12 | Per-user .NET install (not `C:\Program Files\dotnet`) | Launching the framework-dependent EXE | Set `DOTNET_ROOT` (documented in README); Phase 7 self-contained publish removes this |
| 13 | Session runs over a remote display adapter, exposing a synthetic *Remote Desktop Mouse Device* | Touchpad & Mouse source attribution | Reports *general mouse/pointer input* — does **not** claim the built-in touchpad was proven; requires manual confirmation on physical hardware |
| 14 | This RDP session exposes **no audio capture endpoint** (WASAPI `EnumerateAudioEndPoints(DataFlow.Capture)` returns none; `waveInGetNumDevs = 0`), though the host has an active *Microphone Array* | Microphone Test | Page reports *no active audio capture endpoint*, disables Start, and shows the -60 dBFS floor instead of inventing a level |

## Method limitations (by design, honesty rules)

| # | Limitation | Why |
| --- | --- | --- |
| 15 | **Dead/stuck pixel detection is a manual visual inspection** | No validated automatic method is implemented; the app shows guidance patterns and records the user's confirmation rather than claiming an automated pass |
| 16 | **Opening the camera does not verify video quality** | A successful stream is recorded as a *functional check* only |
| 17 | **Receiving key events does not verify every physical key** | The result reports measured coverage %; a full pass requires the required-key set plus user confirmation of no dead keys |
| 18 | **Submitting an audio stream does not prove a speaker is audible** | `Passed` only after the user confirms what they heard |
| 19 | **Pointer movement does not prove the touchpad works** | Source is identified from `Win32_PointingDevice`; when indeterminate it is labelled *general mouse/pointer input* |
| 20 | **An application-level RAM test cannot examine all physical memory** | It tests only the memory it allocates; it is not equivalent to a bootable memory diagnostic |
| 21 | **Inventory + SMART read is not a full storage integrity proof** | No destructive or pattern writes are ever performed on user storage |
| 22 | **High CPU utilization alone is not a CPU fault** | Utilization is reported as a measurement, not a defect |
| 23 | **The automatic workflow is not a hardware certification** | It runs a chosen subset and reports skipped/unsupported explicitly |
| 24 | **Speaker verification depends entirely on a human listener** | Sending a correctly routed tone only proves Windows accepted the stream. Silence can be a muted endpoint, low master volume, a headset taking over the default route, or a failed driver. Each of the four routes is therefore recorded separately and nothing passes without explicit confirmation |
| 25 | **Microphone capture is unavailable in a remote desktop session** | This machine has an active *Microphone Array*, but the RDP session exposes zero capture endpoints (`waveInGetNumDevs = 0`, WASAPI `EnumerateAudioEndPoints(DataFlow.Capture)` returns none). The page correctly reports *no active audio capture endpoint* and disables Start rather than inventing a level. Level/waveform/clipping/recording are code-verified but need physical hardware for end-to-end proof |
| 26 | **Measured camera FPS is bounded by the frame-delivery path, not only the sensor** | The 2-second measurement window counts frames delivered to the app after conversion and marshalling, so a busy machine or a slow USB link can read lower than the sensor's true rate. The advertised rate is shown separately and is never substituted for it |

## Not yet implemented

Phases 4-7 of `IMPLEMENTATION_PLAN.md` (performance/cooling, connectivity health,
history/reports, packaging) are pending; their sidebar entries currently show an explicit
*Not yet implemented* placeholder that performs no measurement and reports no result.

Phases 1-3 (foundation + dashboard, display, keyboard, touchpad/mouse, speakers, microphone,
camera) are implemented and verified - see `PROJECT_STATUS.md`.

Note on Phase 3: the **speakers** and **camera** paths were exercised against real endpoints in
this session. The **microphone** path could not be exercised end-to-end here because the session
exposes no capture endpoint (see the environment table above); it reports that honestly and
disables Start rather than fabricating a level.
