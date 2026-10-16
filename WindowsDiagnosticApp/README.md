# Windows Diagnostic Center

A standalone, **offline-first** hardware diagnostic tool for IT technicians on
Windows. Python + tkinter — modular, professional and easy to use. Hardware data
is read through built-in PowerShell CIM/WMI; real microphone and camera tests
use optional `sounddevice`/`opencv` when installed.

It mirrors the architecture of the sibling `MacDiagnosticApp` (models →
providers → engine → store → GUI + selftest) while using Windows-native access.

## Requirements

- Windows 10/11
- Python 3.9+ (tkinter ships with the standard Windows installer)

```sh
cd WindowsDiagnosticApp
python run.py               # launch the dashboard
python -m windiag.selftest  # offline CLI self-test (no GUI)
```

### Optional dependencies (auto-detected)

Enable the real microphone waveform/record and camera preview:

```sh
pip install numpy sounddevice opencv-python Pillow
```

Without them the Microphone and Camera tests report **Unsupported** with
guidance — they never fabricate a result. Everything else runs on the stdlib.

## Tests (20, clearly labelled by category)

**Interactive Tests** — Display, Keyboard, Touchpad & Mouse, Speakers &
Headphones, Microphone, Camera.
**Performance & Stress** — CPU, GPU, RAM, Fan & Cooling.
**Hardware Health** — Battery & Charging, SSD/HDD Health, Temperature & Sensors.
**System & Connectivity** — Wi-Fi & Network, Bluetooth, USB & External Ports,
System Information, Windows & Driver Health.
**Workflow & Reports** — Automatic Diagnostics, Test History & Reports.

## Statuses used (never fabricated)

`Not Run · Ready · Running · Passed · Warning · Failed · Unsupported · Cancelled · Error`

A test never reports **Passed** unless it genuinely executed and met its success
criteria, or the user explicitly confirmed an observation.

## Data & privacy

- History and reports stay on-device (`%APPDATA%\WindowsDiagnosticApp`).
- Reports export to HTML and CSV; no network calls are made beyond the optional
  latency ping.
- Microphone recordings are temporary and deleted on demand; camera is
  live-only and never saved.
- Key *identities* are recorded for the keyboard test — never typed text or
  passwords.

## Structure

```
windiag/
  testkit.py            shared statuses, metadata, Reading, TestOutcome
  app.py                categorized dashboard + auto-diagnostics + history
  report.py             history store, HTML/CSV export, automatic workflow
  selftest.py           CLI self-test (legacy engine)
  support/
    windows.py          PowerShell CIM/WMI base queries
    hardware.py         health/thermal/connectivity queries
    device_info.py      DeviceInfo summary with NOT AVAILABLE fallbacks
  tests/
    automated.py        headless health/system/network tests
    display_test.py     full-screen pattern inspection
    keyboard_test.py    visual keyboard with live highlighting
    touchpad_test.py    pointer X/Y, clicks, drag
    speakers_test.py    channel-routed test tones
    microphone_test.py  live level meter + record/play/delete
    camera_test.py      OpenCV preview with frame count/FPS
    stress.py           CPU/GPU/RAM/fan workers (headless)
    stress_windows.py   interactive stress-test windows
```

## Known limits (honest by design)

- Temperature/fan RPM/GPU utilisation are often not exposed by Windows without
  vendor tools → reported `Unsupported`, never fabricated.
- Fan manual max-speed has no safe public API → an observation test runs instead.
- Touchpad vs mouse cannot be reliably distinguished here → labelled "pointer input".
- An in-app RAM test cannot replace a bootable comprehensive memory test.

See `PROJECT_STATUS.md` and `IMPLEMENTATION_PLAN.md` for the phased build record.
