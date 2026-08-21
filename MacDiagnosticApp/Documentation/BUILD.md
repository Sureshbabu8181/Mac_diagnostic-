# MacDiagnosticApp — Build & Run

Standalone offline macOS hardware diagnostic tool for IT technicians.
**Apple Silicon only, minimum macOS 15.**

## Structure
- `Sources/MacDiagnosticKit` — all models, diagnostics, services, storage (library).
- `Sources/MacDiagnosticApp` — SwiftUI application (executable).
- `Sources/MacDiagnosticSelftest` — XCTest-free test runner for CLI-tools
  environments; the XCTest suite lives in `Tests/` for Xcode/CI.
- `Documentation/` — phased decision and API-feasibility records.

## Build & test (no Xcode needed)
```sh
swift build                  # build all targets
swift run macdiagnostic-selftest   # run offline self-test (20 checks + live hardware readout)
swift test                   # requires Xcode (XCTest module)
```

## Running the app
```sh
swift run MacDiagnosticApp
```
Note: when launched via SPM the process is not an app bundle, so TCC
camera/microphone prompts and app icons behave differently than the packaged
.app. Package it for real deployments (below).

## Xcode / packaging (Phase 18)
The Swift package opens directly in Xcode (`open Package.swift`). To build the
shipped `.app` + `.dmg`:

1. Wrap the package as a macOS app target in an Xcode project, or use SPM to
   produce an executable and package it into `<name>.app/Contents/MacOS`.
2. Add `Info.plist` with `NSMicrophoneUsageDescription`,
   `NSCameraUsageDescription`, `LSMinimumSystemVersion = 15.0`, and a hard-coded
   bundle ID (`com.<company>.macdiagnostic`).
3. Sign with **Developer ID Application** certificate and notarize
   (`xcrun notarytool submit`), then build a `.dmg`.
4. Runtime remains fully offline; notarization only validates the signed build.

## Sandbox / entitlements (recommended)
If you adopt the App Sandbox, enable:
- `com.apple.security.device.audio-input` (microphone)
- `com.apple.security.device.camera` (camera)
- `com.apple.security.files.user-selected.read-write` (report export)
- `com.apple.security.network.client` (connectivity check only)

Keyboard/trackpad use local event monitors — **no** Accessibility entitlement is
required and no background collection occurs.

## Privacy notes
- Key events are captured only while the keyboard test screen is active.
- Mic recording is a temp file deleted after the test.
- Camera frames are displayed live and never saved.
- No passwords, credentials, typed text, or logs of audio/video content.