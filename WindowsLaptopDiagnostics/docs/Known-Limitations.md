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
| 12 | .NET installed per-user (not `C:\Program Files\dotnet`) | Launching the framework-dependent EXE | Set `DOTNET_ROOT` (documented in README); Phase 7 self-contained publish removes this |

## Method limitations (by design, honesty rules)

| # | Limitation | Why |
| --- | --- | --- |
| 13 | **Dead/stuck pixel detection is a manual visual inspection** | No validated automatic method is implemented; the app shows guidance patterns and records the user's confirmation rather than claiming an automated pass |
| 14 | **Opening the camera does not verify video quality** | A successful stream is recorded as a *functional check* only |
| 15 | **Receiving key events does not verify every physical key** | The result reports measured coverage %; a full pass requires the required-key set plus user confirmation of no dead keys |
| 16 | **Submitting an audio stream does not prove a speaker is audible** | `Passed` only after the user confirms what they heard |
| 17 | **Pointer movement does not prove the touchpad works** | Source is identified from `Win32_PointingDevice`; when indeterminate it is labelled *general mouse/pointer input* |
| 18 | **An application-level RAM test cannot examine all physical memory** | It tests only the memory it allocates; it is not equivalent to a bootable memory diagnostic |
| 19 | **Inventory + SMART read is not a full storage integrity proof** | No destructive or pattern writes are ever performed on user storage |
| 20 | **High CPU utilization alone is not a CPU fault** | Utilization is reported as a measurement, not a defect |
| 21 | **The automatic workflow is not a hardware certification** | It runs a chosen subset and reports skipped/unsupported explicitly |

## Not yet implemented

Phases 2–7 of `IMPLEMENTATION_PLAN.md` (all 20 diagnostic modules, history/reports, packaging) are
pending; their sidebar entries currently show an explicit *Not yet implemented* placeholder that
performs no measurement and reports no result.
