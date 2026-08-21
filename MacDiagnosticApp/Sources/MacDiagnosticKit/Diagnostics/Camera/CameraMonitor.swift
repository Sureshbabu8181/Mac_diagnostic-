import Foundation
@preconcurrency import AVFoundation

public struct CameraDeviceInfo: Sendable {
    public let name: String
    public let resolution: String
}

public enum CameraProbe {
    public static func devices() -> [CameraDeviceInfo] {
        let session = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .external],
            mediaType: .video,
            position: .unspecified
        )
        return session.devices.map { device in
            let format = device.activeFormat
            let dims = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            let fps = format.videoSupportedFrameRateRanges.first.map { String(format: "%.0f", $0.maxFrameRate) } ?? "?"
            return CameraDeviceInfo(name: device.localizedName, resolution: "\(dims.width)x\(dims.height) @ \(fps) fps")
        }
    }

    public static func permissionStatus() -> AVAuthorizationStatus {
        AVCaptureDevice.authorizationStatus(for: .video)
    }

    public static func requestPermission() async -> Bool {
        await AVCaptureDevice.requestAccess(for: .video)
    }
}

/// Live camera preview with frame counting. No images or video are saved.
@MainActor
public final class CameraMonitor: NSObject, ObservableObject, AVCaptureVideoDataOutputSampleBufferDelegate, @unchecked Sendable {
    @Published public private(set) var frameCount = 0
    @Published public private(set) var isRunning = false
    @Published public private(set) var lastError: String?

    public let session = AVCaptureSession()

    /// Stable preview layer instance. Must be created ONCE and reused — creating
    /// a new layer on every access detaches the previous layer from the view,
    /// which makes the live preview vanish as frames arrive.
    public lazy var previewLayer: AVCaptureVideoPreviewLayer = {
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        return layer
    }()

    private var output: AVCaptureVideoDataOutput?
    private var input: AVCaptureDeviceInput?
    private var caches: [NSValue: AVCaptureDevice.Format]? = nil
    public var resolution: String = ""

    public func configure() {
        guard !isRunning else { return }
        lastError = nil
        session.sessionPreset = .high

        if input == nil {
            guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front)
                    ?? AVCaptureDevice.default(for: .video) else {
                lastError = "No camera device found."
                return
            }
            do {
                let candidate = try AVCaptureDeviceInput(device: device)
                guard session.canAddInput(candidate) else { lastError = "Cannot add camera input."; return }
                session.addInput(candidate)
                input = candidate
                resolution = CameraProbe.devices().first(where: { $0.name == device.localizedName })?.resolution ?? "N/A"
            } catch {
                lastError = error.localizedDescription
                return
            }
        }

        if output == nil {
            let candidate = AVCaptureVideoDataOutput()
            candidate.setSampleBufferDelegate(self, queue: DispatchQueue(label: "camera.frames"))
            guard session.canAddOutput(candidate) else { lastError = "Cannot add camera output."; return }
            session.addOutput(candidate)
            output = candidate
        }

        let session = self.session
        Task { @MainActor in
            // startRunning() blocks while the camera hardware zeros in; run it off
            // the main thread so the UI (preview, buttons) stays responsive.
            await withCheckedContinuation { continuation in
                DispatchQueue.global(qos: .userInitiated).async {
                    session.startRunning()
                    continuation.resume()
                }
            }
            isRunning = session.isRunning
            if !isRunning { lastError = "Camera failed to start." }
        }
    }

    public func stop() {
        session.stopRunning()
        if let output {
            session.removeOutput(output)
        }
        output = nil
        input = nil
        isRunning = false
    }

    public nonisolated func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        Task { @MainActor in
            frameCount += 1
        }
    }
}