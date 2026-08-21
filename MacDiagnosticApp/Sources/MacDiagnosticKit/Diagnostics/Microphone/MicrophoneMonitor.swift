import Foundation
import AVFoundation
import Accelerate

public struct MicrophoneDeviceInfo: Sendable {
    public let name: String
    public let sampleRate: Double
    public let channelCount: Int
}

public enum MicrophoneProbe {
    public static func devices() -> [MicrophoneDeviceInfo] {
        let session = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.microphone, .external],
            mediaType: .audio,
            position: .unspecified
        )
        return session.devices.map {
            MicrophoneDeviceInfo(name: $0.localizedName, sampleRate: 0, channelCount: 0)
        }
    }

    public static func permissionStatus() -> AVAuthorizationStatus {
        AVCaptureDevice.authorizationStatus(for: .audio)
    }

    public static func requestPermission() async -> Bool {
        await AVCaptureDevice.requestAccess(for: .audio)
    }
}

/// Live input level meter (RMS) via an engine input tap, a real-time waveform
/// + frequency-spectrum preview, plus optional temporary recording with local
/// playback. Recording happens inside the same input tap, so the preview stays
/// live while recording. The recording is deleted after testing.
@MainActor
public final class MicrophoneMonitor: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published public private(set) var level: Float = 0
    @Published public private(set) var isMonitoring = false
    @Published public private(set) var isRecording = false
    @Published public private(set) var isPlaying = false
    @Published public private(set) var lastRecordingURL: URL?

    /// Rolling live waveform buckets (0...1) and frequency-response bins (0...1).
    @Published public private(set) var waveform: [CGFloat] = []
    @Published public private(set) var spectrumBins: [CGFloat] = []

    /// Summary extracted from the recorded clip, shown during playback.
    public private(set) var previewWaveform: [CGFloat] = []
    public private(set) var previewSpectrum: [CGFloat] = []

    private let capture = CaptureHandler()
    private var player: AVAudioPlayer?
    private let recorderURL = FileManager.default.temporaryDirectory.appendingPathComponent("macdiagnostic-mic-test.caf")

    public override init() {
        super.init()
        capture.owner = self
    }

    public func startMonitoring() {
        guard !isMonitoring && !isRecording else { return }
        guard capture.startTap() else { return }
        isMonitoring = true
    }

    public func startRecording() {
        guard !isRecording else { return }
        stopPlayback()
        // Single engine + tap handles both live analysis and recording. Starting
        // a recording simply attaches a write-backed file; the engine is never
        // torn down and recreated (that raises an ObjC exception on macOS).
        guard capture.startTap() else { return }
        guard let format = capture.currentInputFormat(), format.sampleRate > 0 else { return }
        try? FileManager.default.removeItem(at: recorderURL)
        guard let file = try? AVAudioFile(forWriting: recorderURL, settings: format.settings) else {
            AppLogger.shared.error("Could not create recording file")
            return
        }
        capture.setRecordingFile(file)
        isRecording = true
    }

    @discardableResult
    public func stopRecording() -> URL? {
        guard isRecording else { return nil }
        capture.setRecordingFile(nil)
        isRecording = false
        lastRecordingURL = recorderURL
        computePreviewAnalysis(from: recorderURL)
        return recorderURL
    }

    public func stopMonitoring() {
        guard !isRecording else { return }
        capture.stopTap()
        isMonitoring = false
    }

    public func playback() {
        guard let url = lastRecordingURL else { return }
        player?.stop()
        let audioPlayer = try? AVAudioPlayer(contentsOf: url)
        audioPlayer?.delegate = self
        audioPlayer?.prepareToPlay()
        audioPlayer?.play()
        player = audioPlayer
        isPlaying = true
    }

    public func stopPlayback() {
        player?.stop()
        player = nil
        isPlaying = false
    }

    public func deleteRecording() {
        capture.stopTap()
        stopPlayback()
        if lastRecordingURL != nil {
            try? FileManager.default.removeItem(at: recorderURL)
        }
        lastRecordingURL = nil
        previewWaveform = []
        previewSpectrum = []
    }

    public nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.isPlaying = false
        }
    }

    // MARK: - Preview analysis (whole recorded clip)

    private func computePreviewAnalysis(from url: URL) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let file = try? AVAudioFile(forReading: url),
                  let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat,
                                                frameCapacity: AVAudioFrameCount(file.length)),
                  (try? file.read(into: buffer)) != nil
            else { return }
            guard let data = buffer.floatChannelData, file.processingFormat.channelCount > 0 else { return }
            let count = Int(buffer.frameLength)
            let samples = Array(UnsafeBufferPointer(start: data[0], count: count))
            guard !samples.isEmpty else { return }

            let waveform = CaptureHandler.waveformBuckets(samples, count: 160)
            let spectrum = CaptureHandler.computeFrequencyBins(samples, bins: 40, averageWindows: true)

            Task { @MainActor [weak self] in
                self?.previewWaveform = waveform
                self?.previewSpectrum = spectrum
            }
        }
    }

    // MARK: - Audio-thread capture handler (non-isolated)

    /// Owns the engine + tap and all state touched on the audio render thread so
    /// the tap closure never crosses an actor boundary.
    private final class CaptureHandler: @unchecked Sendable {
        weak var owner: MicrophoneMonitor?
        private var engine: AVAudioEngine?
        private let lock = NSLock()
        private var recordingFile: AVAudioFile?
        let waveCount = 64
        let binCount = 40
        private var fftSetup: FFTSetup?
        private var fftSetupLog2n: vDSP_Length = 0

        func currentInputFormat() -> AVAudioFormat? {
            engine?.inputNode.outputFormat(forBus: 0)
        }

        func setRecordingFile(_ file: AVAudioFile?) {
            lock.lock()
            recordingFile = file
            lock.unlock()
        }

        @discardableResult
        func startTap() -> Bool {
            if let engine { return engine.isRunning }
            let engine = AVAudioEngine()
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0 else { return false }

            let handler = self
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { [handler] buffer, _ in
                handler.process(buffer)
            }
            do {
                try engine.start()
                self.engine = engine
                return true
            } catch {
                AppLogger.shared.warning("Microphone monitor failed to start: \(error.localizedDescription)")
                input.removeTap(onBus: 0)
                return false
            }
        }

        func stopTap() {
            engine?.inputNode.removeTap(onBus: 0)
            engine?.stop()
            engine = nil
            if let fftSetup {
                vDSP_destroy_fftsetup(fftSetup)
            }
            fftSetup = nil
            fftSetupLog2n = 0
        }

        func process(_ buffer: AVAudioPCMBuffer) {
            lock.lock()
            let file = recordingFile
            if let file {
                try? file.write(from: buffer)
            }
            lock.unlock()

            guard let channel = buffer.floatChannelData?.pointee else { return }
            let count = Int(buffer.frameLength)
            guard count > 0 else { return }

            var sum: Float = 0
            for i in 0..<count {
                let v = channel[i]
                sum += v * v
            }
            let rms = (sum / Float(count)).squareRoot()

            let samples = Array(UnsafeBufferPointer(start: channel, count: count))
            let buckets = Self.waveformBuckets(samples, count: waveCount)
            let bins = processFrequency(samples, bins: binCount)

            Task { @MainActor [weak owner] in
                guard let owner else { return }
                owner.level = min(1, rms * 8)
                owner.waveform = buckets
                owner.spectrumBins = bins
            }
        }

        nonisolated func processFrequency(_ samples: [Float], bins: Int) -> [CGFloat] {
            guard samples.count >= 64 else { return Array(repeating: 0, count: bins) }
            let fftSize = Self.nextPowerOfTwo(samples.count)
            let log2n = vDSP_Length(Foundation.log2(Double(fftSize)))
            guard let setup = cachedSetup(log2n: log2n) else {
                return Array(repeating: 0, count: bins)
            }
            return Self.computeSpectrum(samples: samples, bins: bins, fftSize: fftSize, log2n: log2n, setup: setup, averageWindows: false)
        }

        private func cachedSetup(log2n: vDSP_Length) -> FFTSetup? {
            if let fftSetup, fftSetupLog2n == log2n {
                return fftSetup
            }
            if let old = fftSetup {
                vDSP_destroy_fftsetup(old)
            }
            guard let created = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2)) else {
                return nil
            }
            fftSetup = created
            fftSetupLog2n = log2n
            return created
        }

        /// One-shot analysis of a whole clip (no setup caching; safe for the
        /// background queue used for previews).
        nonisolated static func computeFrequencyBins(_ samples: [Float], bins: Int, averageWindows: Bool = false) -> [CGFloat] {
            guard samples.count >= 64 else { return Array(repeating: 0, count: bins) }
            let fftSize = nextPowerOfTwo(samples.count)
            let log2n = vDSP_Length(Foundation.log2(Double(fftSize)))
            guard let setup = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2)) else {
                return Array(repeating: 0, count: bins)
            }
            defer { vDSP_destroy_fftsetup(setup) }
            return computeSpectrum(samples: samples, bins: bins, fftSize: fftSize, log2n: log2n, setup: setup, averageWindows: averageWindows)
        }

        private nonisolated static func nextPowerOfTwo(_ value: Int) -> Int {
            var size = 2
            while size * 2 <= value { size *= 2 }
            return size
        }

        private nonisolated static func computeSpectrum(
            samples: [Float],
            bins: Int,
            fftSize: Int,
            log2n: vDSP_Length,
            setup: FFTSetup,
            averageWindows: Bool
        ) -> [CGFloat] {
            var window = [Float](repeating: 0, count: fftSize)
            vDSP_hann_window(&window, vDSP_Length(fftSize), Int32(vDSP_HANN_NORM))

            let magCount = fftSize / 2
            var acc = [Float](repeating: 0, count: magCount)
            var windowsAnalyzed = 0
            var offset = 0
            while offset + fftSize <= samples.count {
                var real = [Float](repeating: 0, count: fftSize)
                samples.withUnsafeBufferPointer { sbuf in
                    vDSP_vmul(sbuf.baseAddress!.advanced(by: offset), 1, window, 1, &real, 1, vDSP_Length(fftSize))
                }
                var imag = [Float](repeating: 0, count: fftSize)
                real.withUnsafeMutableBufferPointer { realBuf in
                    imag.withUnsafeMutableBufferPointer { imagBuf in
                        var split = DSPSplitComplex(realp: realBuf.baseAddress!, imagp: imagBuf.baseAddress!)
                        vDSP_fft_zip(setup, &split, 1, log2n, FFTDirection(FFT_FORWARD))
                        acc.withUnsafeMutableBufferPointer { mags in
                            vDSP_zvmags(&split, 1, mags.baseAddress!, 1, vDSP_Length(magCount))
                        }
                    }
                }
                windowsAnalyzed += 1
                if !averageWindows { break }
                offset += fftSize
                if windowsAnalyzed >= 24 { break }
            }
            guard windowsAnalyzed > 0 else { return Array(repeating: 0, count: bins) }

            let amps: [Float] = acc.enumerated().map { index, m in
                let v = m / Float(windowsAnalyzed)
                return v.squareRoot()
            }
            let peak = max(amps.max() ?? 0, 0.001)
            let usable = min(magCount, amps.count)

            var result = [CGFloat](repeating: 0, count: bins)
            let logRange = Foundation.log2(Double(usable))
            for i in 0..<usable {
                let value = min(1, amps[i] / peak)
                let logIndex = Foundation.log2(Double(i + 1)) / logRange
                let binIndex = min(bins - 1, Int(logIndex * Double(bins)))
                if CGFloat(value) > result[binIndex] { result[binIndex] = CGFloat(value) }
            }
            return result
        }

        nonisolated static func waveformBuckets(_ samples: [Float], count: Int) -> [CGFloat] {
            guard !samples.isEmpty else { return [] }
            let bucketSize = max(1, samples.count / count)
            var result = [CGFloat]()
            result.reserveCapacity(count)
            for b in 0..<count {
                let start = b * bucketSize
                let end = min(samples.count, start + bucketSize)
                var peak: Float = 0
                if start < end {
                    for i in start..<end {
                        let a = abs(samples[i])
                        if a > peak { peak = a }
                    }
                }
                result.append(CGFloat(min(1, peak * 6)))
            }
            return result
        }
    }
}