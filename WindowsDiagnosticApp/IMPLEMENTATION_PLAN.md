# Implementation Plan — Windows Diagnostic Center

Phased build following the master task. Small phases; each builds and runs.

## Phase 0 — Inspection ✅
- Python 3.13.7 + tkinter; no Node/.NET. No optional deps pre-installed.
- Existing app: models→providers→engine→store→GUI, 8 automated + 6 manual.
- Decision: keep Python/tkinter. Optional deps (numpy, sounddevice, opencv,
  Pillow) installed for real mic/camera; auto-detected at runtime.

## Phase 1 — Dashboard + shared status system ✅
- `testkit.py`: `TestStatus`, `TestCategory`, `TestID`, `TestMeta`, `Reading`,
  `TestOutcome`, colour map.
- `app.py`: categorized, labelled dashboard with 20 cards + live status badges.

## Phase 2 — Full-screen Display Test ✅
- `tests/display_test.py`: 12 patterns (solid/gradient/checker/grid), translucent
  auto-hide overlay, keyboard nav, Esc exit, resolution/refresh info.

## Phase 3 — Keyboard Test ✅
- `tests/keyboard_test.py`: full layout, live press highlight → green tested,
  coverage counter, modifier colouring, key-identity-only recording.

## Phase 4 — Touchpad & Mouse ✅
- `tests/touchpad_test.py`: live X/Y, pointer trail, left/right/drag counters,
  honest "pointer input" source label.

## Phase 5 — Speakers & Headphones ✅
- `tests/speakers_test.py`: real channel-routed tones (sounddevice), device +
  volume select, user-confirmation, winsound fallback.

## Phase 6 — Microphone Test ✅
- `tests/microphone_test.py`: live level meter, record/play/delete via
  sounddevice, clip warnings, temp-file cleanup, stream release on close.

## Phase 7 — Camera Test ✅
- `tests/camera_test.py`: OpenCV preview, real frame count + measured FPS,
  resolution, Start/Stop/Restart, release on close.

## Phase 8 — Fan & Cooling ✅
- `tests/stress.py::run_fan_observation` + `stress_windows.py::FanStressWindow`:
  10s observation; manual max-fan Unsupported (documented).

## Phase 9 — CPU Stress ✅
- `stress.py::cpu_stress_worker` + `CpuStressWindow`: (cores-1) processes, live
  load/temp/clock, Stop, 90°C soft limit, auto timeout.

## Phase 10 — GPU Stress ✅
- `stress.py::run_gpu_probe` + `GpuStressWindow`: GPU identify + bounded probe;
  live temp/usage labelled Unsupported.

## Phase 11 — RAM Stress ✅
- `stress.py::ram_stress_worker` + `RamStressWindow`: bounded numpy alloc +
  integrity verify, reserves 2 GB, reports mismatches/cancellation.

## Phase 12 — Additional diagnostics ✅
- `support/hardware.py`: battery health, SMART/disks, IP config, ping latency,
  Bluetooth, thermal/clock/load, memory, GPU/display, Device Manager, BIOS/
  baseboard.
- `tests/automated.py`: Battery, Storage Health, Network, Bluetooth, USB,
  Thermal, System Info, Windows Health.

## Phase 13 — Automatic Diagnostics ✅
- `report.py::run_automatic`: ordered headless run with progress; interactive
  tests stay manual (dashboard-launched).

## Phase 14 — Reports & History ✅
- `report.py`: JSON `HistoryStore`, HTML + CSV export, privacy note.

## Phase 15 — Quality / performance (in progress / next)
- Unit tests for status transitions, safety checks, report generation.
- Optional: GPU vendor API (NVML) for real utilisation; PDF export; packaging
  with PyInstaller once stable.

## Changed files
- Added: `windiag/testkit.py`, `windiag/support/hardware.py`,
  `windiag/tests/{__init__,automated,display_test,keyboard_test,touchpad_test,
  speakers_test,microphone_test,camera_test,stress,stress_windows}.py`,
  `PROJECT_STATUS.md`, `IMPLEMENTATION_PLAN.md`
- Rewritten: `windiag/report.py`, `windiag/app.py`, `run.py`, `README.md`

## Commands
```sh
cd WindowsDiagnosticApp
python run.py               # dashboard
python -m windiag.selftest  # headless CLI self-test (legacy engine)
```

## Remaining / incomplete
- GPU live utilisation/temperature (needs vendor API).
- PDF export.
- Unit test suite.
- Guided USB plug-in test (currently enumeration-only).
