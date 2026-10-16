# Known Limitations

Honest record of what this application **cannot** do on some or all machines. Nothing in this list
is worked around with fabricated data — affected tests report `Unsupported`, `Unavailable`, or
`Permission Required` with a reason.

## Hardware / firmware dependent

| # | Limitation | Affects | What the app does |
| --- | --- | --- | --- |
| 1 | Many OEMs do not expose thermal zones to WMI, and where the class *is* present it is usually access-denied for a non-administrator | Temperature & Sensors, CPU stress safety limit, Fan | Distinguishes the two: `Permission Required` when Windows answered *Access denied* (elevation would fix it), `Unsupported` when the firmware exposes nothing. The safety limit is then stated as **not armed** rather than implied |
| 1b | `MSAcpi_ThermalZoneTemperature` is **access-denied on this machine** | CPU temperature, CPU stress thermal limit | Reported `Permission Required` with *run elevated* as the remedy; the workload stays bounded by its duration and by cancel |
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
| 13 | Session runs over a remote display adapter, exposing a synthetic *Remote Desktop Mouse Device* | Touchpad & Mouse source attribution | Reports *general mouse/pointer input* - does **not** claim the built-in touchpad was proven; requires manual confirmation on physical hardware |
| 14 | This RDP session exposes **no audio capture endpoint** (WASAPI `EnumerateAudioEndPoints(DataFlow.Capture)` returns none; `waveInGetNumDevs = 0`), though the host has an active *Microphone Array* | Microphone Test | Page reports *no active audio capture endpoint*, disables Start, and shows the -60 dBFS floor instead of inventing a level |
| 15 | This machine's firmware exposes **no fan tachometer**: `Win32_Fan` returns 0 rows, so there is no RPM reading of any kind | Fan & Cooling, Temperature & Sensors | Fan speed reported `Unsupported` with that reason; the 10-second observation reports load and clock and states plainly that cooling effectiveness cannot be proven without a tachometer or a temperature source |
| 16 | The RDP session exposes no *thermal zone* to a non-administrator, and the remote display adapter has no hardware counters | CPU stress thermal limit, Temperature & Sensors | Thermal limit reported **not armed**; the indirect adapter's GPU row reads `Unsupported` instead of borrowing another adapter's numbers |

## Method limitations (by design, honesty rules)

| # | Limitation | Why |
| --- | --- | --- |
| 17 | **Dead/stuck pixel detection is a manual visual inspection** | No validated automatic method is implemented; the app shows guidance patterns and records the user's confirmation rather than claiming an automated pass |
| 18 | **Opening the camera does not verify video quality** | A successful stream is recorded as a *functional check* only |
| 19 | **Receiving key events does not verify every physical key** | The result reports measured coverage %; a full pass requires the required-key set plus user confirmation of no dead keys |
| 20 | **Submitting an audio stream does not prove a speaker is audible** | `Passed` only after the user confirms what they heard |
| 21 | **Pointer movement does not prove the touchpad works** | Source is identified from `Win32_PointingDevice`; when indeterminate it is labelled *general mouse/pointer input* |
| 22 | **An application-level RAM test cannot examine all physical memory** | It tests only the memory it allocates; it is not equivalent to a bootable memory diagnostic |
| 23 | **Inventory + SMART read is not a full storage integrity proof** | No destructive or pattern writes are ever performed on user storage |
| 24 | **High CPU utilization alone is not a CPU fault** | Utilization is reported as a measurement, not a defect |
| 25 | **The automatic workflow is not a hardware certification** | It runs a chosen subset and reports skipped/unsupported explicitly |
| 26 | **Speaker verification depends entirely on a human listener** | Sending a correctly routed tone only proves Windows accepted the stream. Silence can be a muted endpoint, low master volume, a headset taking over the default route, or a failed driver. Each of the four routes is therefore recorded separately and nothing passes without explicit confirmation |
| 27 | **Microphone capture is unavailable in a remote desktop session** | This machine has an active *Microphone Array*, but the RDP session exposes zero capture endpoints (`waveInGetNumDevs = 0`, WASAPI `EnumerateAudioEndPoints(DataFlow.Capture)` returns none). The page correctly reports *no active audio capture endpoint* and disables Start rather than inventing a level. Level/waveform/clipping/recording are code-verified but need physical hardware for end-to-end proof |
| 28 | **Measured camera FPS is bounded by the frame-delivery path, not only the sensor** | The 2-second measurement window counts frames delivered to the app after conversion and marshalling, so a busy machine or a slow USB link can read lower than the sensor's true rate. The advertised rate is shown separately and is never substituted for it |
| 29 | **A non-zero `PerformanceLimitFlags` value is not proof of active throttling** | Windows reports `PerformanceLimitFlags = 2` on this machine at idle as well as under load, and Microsoft does not fully document the bits. Reporting it as "throttling in effect" would assert a change that was never observed, so the raw value is shown and the judgement is delegated to current clock versus maximum clock. During the verified run the CPU boosted from 907 MHz idle to 3829 MHz under load, which is the real evidence |
| 30 | **The GPU workload exercises the composition pipeline, not a compute shader** | It animates a dense field of primitives through WPF's hardware-accelerated path. Utilisation is measured from Windows GPU counters rather than assumed (0 % idle → 4 % under the load), but this is not a vendor 3D benchmark and cannot be described as pushing the iGPU to its thermal or power limit |
| 31 | **An application-level stress test cannot provide thermal protection it does not have** | With no readable temperature the thermal limit is reported as **not armed**, not implied. The run remains bounded by its duration and by a cancel that returned load from 89 % to 2.8 % within 0.6 s, but the app does not claim to have protected the machine thermally |
| 32 | **The cooling observation cannot prove the cooling system works** | With no tachometer and no readable temperature in this session it observes load and clock only, and says so. Rising temperature under sustained load is the signal a technician would watch for; an absent sensor is reported as absent, never as a pass |

## Not yet implemented

Phases 5-7 of `IMPLEMENTATION_PLAN.md` (connectivity health, automatic diagnostics,
history/reports, packaging) are pending; their sidebar entries currently show an explicit
*Not yet implemented* placeholder that performs no measurement and reports no result.

Phases 1-4 (foundation + dashboard, display, keyboard, touchpad/mouse, speakers, microphone,
camera, CPU/GPU/RAM stress, fan & cooling, temperature & sensors) are implemented and verified -
see `PROJECT_STATUS.md`.

Note on Phase 3: the **speakers** and **camera** paths were exercised against real endpoints in
this session. The **microphone** path could not be exercised end-to-end here because the session
exposes no capture endpoint (see the environment table above); it reports that honestly and
disables Start rather than fabricating a level.

Note on Phase 4: the **CPU, RAM and GPU** workloads were exercised end-to-end against this
machine and the cancel-to-idle criterion was measured independently from Windows counters. The
**thermal safety limit** could not be armed because the ACPI thermal zone is access-denied here,
and the **fan** has no tachometer and no vendor control interface - both are reported exactly as
described above rather than being simulated.
