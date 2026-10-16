# Project Status — Windows Diagnostic Center

_Last updated: Phase 1–14 foundation implemented_

## What works now

The app launches a **categorized diagnostic dashboard** with 20 labelled test
cards across 5 groups. Interactive tests open dedicated windows; headless tests
run in a worker thread with live status. Automatic Diagnostics runs selected
headless tests and exports CSV/HTML reports. History stores past runs locally.

### Interactive tests (technician-driven)
| Test | Implementation | Status |
|------|----------------|--------|
| Display Test | Full-screen patterns (solid/gradient/checker/grid), translucent auto-hide overlay, Esc exit | Working |
| Keyboard Test | Visual layout, live key highlight, green=tested, coverage counter, no text stored | Working |
| Touchpad & Mouse | Live X/Y, pointer trail, left/right click, drag steps, honest pointer-source label | Working |
| Speakers & Headphones | Real tones via sounddevice routed L/R/mono, device + volume select, user-confirm | Working |
| Microphone Test | Live level meter, record/play/delete via sounddevice, clip warnings | Working |
| Camera Test | OpenCV live preview, real frame count + measured FPS, resolution, release on close | Working |

### Performance / stress tests
| Test | Implementation | Status |
|------|----------------|--------|
| CPU Stress | (cores-1) worker threads, live load/temp/clock, Stop, 90°C soft warning | Working |
| GPU Stress | GPU identify + bounded render probe; live temp/usage labelled Unsupported | Working |
| RAM Stress | Bounded numpy allocation + integrity verify, reserves 2 GB, reports mismatches | Working |
| Fan & Cooling | 10s cooling **observation**; manual max-fan correctly Unsupported (no safe API) | Working |

### Headless health / system tests (automated)
Battery & Charging, SSD/HDD Health, Temperature & Sensors, Wi-Fi & Network,
Bluetooth, USB & External Ports, System Information, Windows & Driver Health —
all return real CIM/WMI readings and run in Automatic Diagnostics.

### Workflow
- **Automatic Diagnostics** — pick categories, run sequentially, export HTML/CSV.
- **Test History & Reports** — view, export, delete past runs (JSON store in
  `%APPDATA%\WindowsDiagnosticApp`).

## Dependencies
- **Required:** Python 3.9+ with tkinter (stdlib).
- **Optional (auto-detected):** `numpy`, `sounddevice`, `opencv-python`,
  `Pillow` — enable mic waveform/record and camera preview. Without them those
  two tests report `Unsupported` with install guidance (never fake a result).

## Statuses used
`Not Run · Ready · Running · Passed · Warning · Failed · Unsupported · Cancelled · Error`

A test never reports **Passed** unless it genuinely executed and met its success
criteria, or the user explicitly confirmed an observation (speakers, display,
keyboard, touchpad).

## Known limitations (honest by design)
- **Temperature/fan RPM** often not exposed by Windows without vendor tools →
  reported `Unsupported`, never fabricated.
- **Fan max-speed control** has no safe public Windows API → manual control is
  `Unsupported`; a cooling observation runs instead.
- **GPU utilisation/temperature** need a vendor API (NVML/ADL) → not shown.
- **Touchpad vs mouse** cannot be reliably distinguished at this layer → labelled
  "pointer input".
- **Microphone/camera** require the optional deps; permissions may be denied by
  Windows privacy settings.
- An in-app **RAM test cannot replace a bootable comprehensive memory test**.
