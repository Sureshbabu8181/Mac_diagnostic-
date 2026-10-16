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
| 5 | `Win32_Battery` design/full-charge capacity is absent on many modern laptops (UCEFI/HID battery) | Battery wear % | Reports charge and AC state; wear shown as `Unavailable` — never inferred from charge level. **Both capacities were readable on this machine** (45000 / 32140 mWh → 28.6 %), so the computable path is the one verified here |
| 6 | SMART data access needs administrator rights for some identifiers, and WMI exposes only an OS-level summary — raw attributes (reallocated sectors, media errors, SSD wear, temperature) are not exposed at all | SSD/HDD health | Reports `Permission Required` when Windows refuses a query, and otherwise labels the result explicitly as the OS summary rather than as a drive health verdict |
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
| 16b | **Bluetooth pairing and discovery were not implemented in Phase 5** — adapter/radio presence is read from the Windows stack, but no WinRT `DeviceWatcher` pairing flow is wired up | Bluetooth | The page reports radio presence and per-node problem codes only, and states the permission requirement in words rather than implying a scan took place. Pairing remains a manual step in Windows Settings |
| 16c | **ICMP or HTTP can be filtered independently**, so a failed probe is not proof of a broken adapter | Wi-Fi & Network | Every stage stops at the first failure and prints the evidence gathered before it, so the verdict names the smallest *evidenced* scope. The wording is *the fault is upstream of this network*, never *your internet is broken* |
| 16d | **The internet/DNS probes are off by default** and only run when a technician enables them | Wi-Fi & Network | Opening the page sends no outbound traffic; only local adapter configuration is read until an option is ticked |

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
| 33 | **Windows reporting `Status = OK` for a disk is not a health verdict** | It means the OS has not been told the device failed. WMI exposes no raw SMART attributes, so reallocated-sector counts, media-error history and SSD wear remain unknown. The page says exactly that, and points at device-passthrough tools (smartctl, vendor utilities) for the attributes rather than implying the drive is proven healthy |
| 34 | **A read probe proves accessibility, not integrity** | Opening and reading an existing file shows the volume is mounted and readable. It says nothing about filesystem consistency, bad blocks or pending failure — those would need writes or vendor tools, and no writes are ever performed on user storage |
| 35 | **Battery wear from a single sample is one indicator, not a verdict** | `(design − full charge) ÷ design` is a real measurement from firmware, but it says nothing about cycle count, temperature history or behaviour under load. The page states the arithmetic it used and calls the figure one indicator among several |
| 36 | **The update list comes from `Win32_QuickFixEngineering`, which is not Windows Update** | It omits updates installed through newer servicing channels on some builds, and returns an empty list on others. An empty list is therefore reported as *Windows returned no update list through WMI* and is **never** read as *this machine is unpatched* |
| 37 | **USB enumeration proves driver binding, not that a port works** | Seeing a device in `Win32_PnPEntity` means Windows bound a driver to it. It says nothing about data transfer, connector retention or re-plug behaviour, so detection evidence and the human's manual checks are reported as two separate results and never merged into one pass |
| 38 | **The orchestrator will only automate 8 of its 18 steps** | A colour pattern cannot be judged without eyes, a key press cannot be synthesised into a pass, an acoustic test needs ears and a stress test needs a technician to choose a duration. Display, keyboard, touchpad, speakers, microphone, camera and the four stress tests are listed with the reason they need a human and recorded `Not Run` — which the summary counts separately and never adds to the pass total |
| 39 | **The app cannot create or configure a Google Form, and Google gives no receipt** | Linking a Form to a Sheet, turning on *accept responses from anyone with the link*, and reading the `entry.XXXXXXXX` field ids are all manual steps in a browser. The app therefore requires a supplied URL and field map, and — because Google returns no row identifier — an accepted POST is only called a success when the confirmation page markup comes back; anything ambiguous is reported as *unverified* and must be checked in the Sheet itself |
| 40 | **Email is plain SMTP with basic authentication only** | No OAuth2/XOAUTH2 flow is implemented, so a Google or Microsoft account needs an app password (or a server that accepts credentials directly). Host, TLS mode, port and both addresses are supplied by the user, every SMTP failure is surfaced verbatim with its Windows error code, and *accepted for delivery* is deliberately worded as server acceptance rather than as delivered |
| 41 | **PDF export uses the Windows print pipeline, so the destination is a human choice** | The document is handed to `PrintDialog`; saving a file depends on picking *Microsoft Print to PDF* (or another driver that writes a file). Cancelling is reported as *Print dialog cancelled - no PDF was produced.* rather than as a silent success, and no fallback format is substituted behind the technician's back |
| 42 | **The SMTP password is never persisted, so it must be retyped each session** | `share.json` stores host, port, TLS, username, addresses and subject — but no `Password` key at all, verified after a save with a typed value. The trade-off is intentional: a copied settings file cannot send mail on the technician's behalf |

## Not yet implemented

Phase 7 of `IMPLEMENTATION_PLAN.md` (hardening, resource profiling, self-contained publish,
final docs) is pending.

Phases 1-6 (foundation + dashboard, display, keyboard, touchpad/mouse, speakers, microphone,
camera, CPU/GPU/RAM stress, fan & cooling, temperature & sensors, storage, battery, network,
Bluetooth, USB, system information, Windows & driver health, automatic diagnostics, history,
CSV/HTML/PDF export, Google Form + email share) are implemented and verified —
see `PROJECT_STATUS.md`.

**Bluetooth pairing/discovery is not implemented**: Phase 5 reads radio and adapter presence
only, with no WinRT `DeviceWatcher` flow; the page states that a pairing remains a manual
step in Windows Settings.

Note on Phase 3: the **speakers** and **camera** paths were exercised against real endpoints in
this session. The **microphone** path could not be exercised end-to-end here because the session
exposes no capture endpoint (see the environment table above); it reports that honestly and
disables Start rather than fabricating a level.

Note on Phase 4: the **CPU, RAM and GPU** workloads were exercised end-to-end against this
machine and the cancel-to-idle criterion was measured independently from Windows counters. The
**thermal safety limit** could not be armed because the ACPI thermal zone is access-denied here,
and the **fan** has no tachometer and no vendor control interface - both are reported exactly as
described above rather than being simulated.

Note on Phase 5: all seven pages were exercised against this machine. **Storage, battery, system
and Windows health** were cross-checked with independent `Get-CimInstance` reads and match. The
**network probe** was run end-to-end twice — local-only (`No fault found`, gateway 12 ms) and full
(gateway 12 ms → DNS 12.5 ms → HTTP 89 ms) — with the evidence chain printed stage by stage.
**Bluetooth** was verified for radio/adapter presence only; pairing and discovery are *not*
implemented and the page says so. **USB** detection was verified, but no known-good device was
plugged and unplugged in this session, so the five manual checks remain unticked by design — the
summary explicitly reads *nothing is treated as passing* at zero.

Note on Phase 6: the orchestrator ran on this machine and produced `7 passed · 1 unsupported ·
7 of 8 checks actually executed`, with the thermal step honestly `Unsupported`. History was
written immediately (`history.json`, 7727 bytes) and **survived a kill + relaunch**. CSV and
HTML exports were inspected as files rather than as UI text: the CSV is RFC 4180 with 10 stable
columns, and the HTML contains **0 external references** so it renders standalone. Both were
deleted from the Desktop after verification to leave the machine clean.

Sharing was tested on its failure paths, because that is where honesty is decided: a bogus Form
URL returned **`Google answered 404 Not Found`** (no success claimed), an unconfigured send was
blocked before any request, an authenticated send without a password was refused, and a bogus
SMTP host surfaced `SMTP error: Failure sending mail. (code -1)` verbatim. After typing a
password and saving, `share.json` was inspected and contains neither the value nor a `Password`
key. **No successful Google Form submission or email delivery has been proven**, because that
requires a real form and a reachable mail server; the success paths are code-verified only.
