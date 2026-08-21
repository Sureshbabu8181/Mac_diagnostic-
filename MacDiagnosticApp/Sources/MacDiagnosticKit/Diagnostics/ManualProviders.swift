import Foundation

// MARK: - Manual providers (technician-assisted)

public struct DisplayDiagnostic: ManualDiagnosticProvider {
    public let meta = DiagnosticMeta(
        kind: .display,
        title: "Display",
        whyItMatters: "VISUAL DISPLAY TEST. Fullscreen color patterns reveal stuck/dead pixels, uniformity and flicker. This is a manual visual inspection — it does NOT perform electrical panel testing.",
        isManual: true
    )
    public init() {}
}

public struct KeyboardDiagnostic: ManualDiagnosticProvider {
    public let meta = DiagnosticMeta(
        kind: .keyboard,
        title: "Keyboard",
        whyItMatters: "Press every key and observe the on-screen highlight. Missing, repeated and stuck keys indicate keyboard faults. Events are captured only while this screen is open.",
        isManual: true
    )
    public init() {}
}

public struct TrackpadDiagnostic: ManualDiagnosticProvider {
    public let meta = DiagnosticMeta(
        kind: .trackpad,
        title: "Trackpad",
        whyItMatters: "Verify pointer movement, clicks, scrolling, pinch/zoom, rotate and force click respond correctly.",
        isManual: true
    )
    public init() {}
}

public struct SpeakersDiagnostic: ManualDiagnosticProvider {
    public let meta = DiagnosticMeta(
        kind: .speakers,
        title: "Speakers",
        whyItMatters: "Plays a safe, short tone through left, right, stereo and mono channels to verify both speakers. Volume stays at a safe fixed level.",
        isManual: true
    )
    public init() {}
}

public struct MicrophoneDiagnostic: ManualDiagnosticProvider {
    public let meta = DiagnosticMeta(
        kind: .microphone,
        title: "Microphone",
        whyItMatters: "Checks microphone detection and records a short sample to verify input. The recording is temporary and deleted after the test.",
        isManual: true,
        needsPermission: .microphone
    )
    public init() {}
}

public struct CameraDiagnostic: ManualDiagnosticProvider {
    public let meta = DiagnosticMeta(
        kind: .camera,
        title: "Camera",
        whyItMatters: "Verifies the camera is detected, permission is granted, opens, and delivers live frames. No images or video are stored.",
        isManual: true,
        needsPermission: .camera
    )
    public init() {}
}

// MARK: - Default registry

public enum DefaultRegistry {
    public static func make() -> any DiagnosticProviding {
        DiagnosticRegistry(
            automated: [
                BatteryDiagnostic(),
                PortDiagnostic(),
                StorageDiagnostic(),
                MemoryDiagnostic(),
                NetworkDiagnostic(),
                SystemDiagnostic(),
            ],
            manual: [
                DisplayDiagnostic(),
                KeyboardDiagnostic(),
                TrackpadDiagnostic(),
                SpeakersDiagnostic(),
                MicrophoneDiagnostic(),
                CameraDiagnostic(),
            ]
        )
    }
}