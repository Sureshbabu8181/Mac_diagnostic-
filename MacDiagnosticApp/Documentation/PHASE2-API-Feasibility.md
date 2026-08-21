# PHASE 2 — macOS API Feasibility Analysis

Target: **Apple Silicon only, minimum macOS 15 (Sequoia).** Fully offline.

This document records, for every diagnostic module, the public API / system
interface chosen, why, and the limits of what macOS exposes. **Nothing below
uses private Apple APIs, kernel extensions, or SIP bypass.**

---

## 1. Battery

| Data | API | Availability |
|---|---|---|
| Presence / charging state / time remaining | IOKit power sources `IOPSCopyPowerSourcesInfo`, `IOPSCopyPowerSourcesList`, `IOPSGetPowerSourceDescription` | Public, always |
| Current / max capacity | IOKit power sources (percent) + IORegistry `AppleSmartBattery` (`CurrentCapacity`, `MaxCapacity`, `DesignCapacity`) | Public IORegistry reads |
| Cycle count | IORegistry `AppleSmartBattery` (`CycleCount`) | Public IORegistry reads; **not a documented framework API** — labeled data source |
| Temperature / voltage / amperage | IORegistry `AppleSmartBattery` (`Temperature`, `Voltage`, `Amperage`) | Same as above |
| macOS-reported condition | IOKit `kIOPSBatteryHealthConditionKey` when present | Best-effort |

Notes:
- Cycle count / temperature are **not** exposed through a documented public
  framework API. Reading IORegistry via `IOServiceGetMatchingService` /
  `IORegistryEntryCreateCFProperty` is a public IOKit system interface and the
  technique used by commercial utilities, but the *keys* are not guaranteed.
  Each value is labelled `NOT AVAILABLE` if absent. Never fabricated.
- Application Assessment thresholds (GOOD ≥80%, FAIR ≥60%, POOR <60%) are
  organizational, configurable, and explicitly **not** presented as Apple's
  replacement criteria.

## 2. Display

No public API can measure panel health. This is a **technician-assisted visual
test**: fullscreen color/gradient/pattern screens, dead/stuck-pixel and
flicker inspection, brightness control. The app labels it `VISUAL DISPLAY
TEST` and never claims electrical panel testing.

## 3. Keyboard

Public API: `NSEvent.addLocalMonitorForEvents(matching:)` with
`NSEventMask.keyDown/keyUp/flagsChanged` **while the keyboard test screen is
active and the app is key**. Local monitors receive only events delivered to
the app — no global hook, no Accessibility/TCC permission required, no
background logging. Key codes map to an on-screen layout. Typed text is never
stored.

## 4. Trackpad

Public API: `NSEvent` local monitors for `mouseMoved`, `leftMouseDown/Up`,
`rightMouseDown/Up`, `scrollWheel`, `magnify` (pinch/zoom), `rotate`, and
`otherMouse`/`gesture`. Force touch via `NSEvent.pressure` (event `pressure`
state, public). Multi-touch contact geometry (`NSTouch`) is public but
optional; **no** private multitouch APIs.

## 5. Speakers

Public API: CoreAudio `AudioObjectGetPropertyData` to enumerate output
devices, channels, sample rate. Tones generated with `AVAudioEngine` +
`AVAudioPlayerNode` + `AVAudioPCMBuffer` (sine waves at safe amplitude, ~-20 dBFS).
Left/right/stereo/mono via per-channel PCM buffers. Safe default volume, no
dangerous sweeps.

## 6. Microphone

Public API: `AVCaptureDevice.DiscoverySession` for input devices; level meter
via `AVAudioEngine` input tap (RMS). Temporary recording to the app's temp
directory (`.caf`), optional local playback, **deleted after test**. Requires
TCC microphone permission (`AVCaptureDevice.requestAccess(for: .audio)`).

## 7. Camera

Public API: `AVCaptureDevice.DiscoverySession` (video), `AVCaptureSession`
live preview via `AVCaptureVideoPreviewLayer`, frame counting via
`AVCaptureVideoDataOutput`. Resolution/sample rate from active format. No
image/video is saved. Requires TCC camera permission
(`requestAccess(for: .video)`).

## 8. Ports

- **USB-C / Thunderbolt:** IORegistry enumeration of `IOUSBHostDevice` /
  `IOUSBDevice` and Thunderbolt devices (`AppleThunderboltNHIType`) to report
  *currently connected* devices and locate ports by type.
- **SD card:** IORegistry `IOMedia` (external/removable) + `IODisk` classes.
- **Headphone / audio out:** CoreAudio output device list.
- **Display adapter:** NSScreen + IORegistry display device info.
- **MagSafe:** detected only if present in IORegistry; otherwise `MANUAL_REQUIRED`.

Software **cannot prove an unused port is electrically functional** — the app
therefore reports `MANUAL_REQUIRED` for any port with no connected device and
guides a known-good-device connect/remove check.

## 9. Storage

Public API: `FileManager` + `URLResourceValues` (volume name, total/available
capacity, `isEncrypted`, file system type) and `URL.fileSystemType`. Device
names via IORegistry `IOMedia`. **SMART / internal SSD health is not exposed
through public APIs on macOS** → reported `NOT_AVAILABLE` with an explicit
message. All checks are read-only; no erasing/partitioning/writes.

## 10. Memory / resources

Public API: `ProcessInfo.physicalMemory`; `host_statistics64` /
`vm_statistics64` (free/active/inactive/wired); `sysctl` `vm.swapusage` for
swap totals. Memory pressure derived from free+wired ratio (documented
approximation). The app states clearly this is **not** a full physical RAM
stress test and a true hardware test requires the Apple diagnostic
environment.

## 11. Network

Public API: Network framework `NWPathMonitor` (connectivity, interface type,
satisfiability); `getifaddrs` for IPs; gateway/DNS via SystemConfiguration
(`SCDynamicStoreCopy`) and `res_9`/`SCDynamicStoreCopyDNSConfiguration`
best-effort. Bluetooth state via CoreBluetooth `CBCentralManager.state`.
**No Wi-Fi passwords or credentials are ever read or logged.**

## 12. Sensors

Public API reality:
- **Thermal state:** `ProcessInfo.thermalState` (public, coarse: nominal/fair/
  serious/critical).
- **Ambient light / lid / orientation:** not exposed through documented public
  APIs → `NOT_AVAILABLE`.
- Never interpreted as PASS.

## 13. System diagnostics

Public approach: read `~/Library/Logs/DiagnosticReports` (panic files, public
user-accessible), run `log show` (public CLI) filtered to kernel/panic/
thermal events with a time window, and enumerate USB/TB devices via IORegistry.
Output is filtered/redacted; no credentials, and event text is minimized to
the app's own log.

## 14. Permissions / TCC

- Camera / microphone: standard `AVCaptureDevice.requestAccess`.
- Keyboard: **no** Accessibility permission needed (local monitor only).
- Accessibility TCC is only *optionally* used, never required.

## 15. Distribution

Developer ID signing + notarization happens at packaging (Phase 18) and
requires Xcode; runtime remains fully offline.

---

### Hard limits to communicate to technicians
- Battery cycle count/temperature: IORegistry best-effort, may be unavailable.
- SMART health: `NOT_AVAILABLE` on macOS public APIs.
- Physical port electrical function: `MANUAL_REQUIRED`.
- RAM: software readouts only, not a hardware stress test.
- Lid / ambient light: `NOT_AVAILABLE`.
