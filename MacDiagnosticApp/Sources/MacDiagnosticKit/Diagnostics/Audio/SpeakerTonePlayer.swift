import Foundation
import AVFoundation

/// Output device information via CoreAudio (public).
public struct AudioDeviceInfo: Sendable {
    public let name: String
    public let channels: Int
    public let sampleRate: Double
}

public enum AudioDeviceProbe {
    public static func defaultOutput() -> AudioDeviceInfo? {
        var deviceID = AudioDeviceID(0)
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &deviceID) == noErr,
              deviceID != 0 else { return nil }

        var name: String = "Unknown"
        var nameAddress = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceNameCFString,
            mScope: kAudioObjectPropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        var nameSize = UInt32(0)
        if AudioObjectGetPropertyDataSize(deviceID, &nameAddress, 0, nil, &nameSize) == noErr {
            var cfName: Unmanaged<CFString>?
            if AudioObjectGetPropertyData(deviceID, &nameAddress, 0, nil, &nameSize, &cfName) == noErr {
                name = cfName?.takeRetainedValue() as String? ?? "Unknown"
            }
        }

        var rateSize = UInt32(MemoryLayout<Float64>.size)
        var rate = Float64(0)
        var rateAddress = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyNominalSampleRate,
            mScope: kAudioObjectPropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        if AudioObjectGetPropertyData(deviceID, &rateAddress, 0, nil, &rateSize, &rate) != noErr {
            rate = 0
        }

        return AudioDeviceInfo(name: name, channels: 2, sampleRate: rate)
    }
}

public enum SpeakerTone: String, CaseIterable, Identifiable, Sendable {
    case left, right, stereo, mono
    public var id: String { rawValue }
    public var label: String {
        switch self {
        case .left: "Left"
        case .right: "Right"
        case .stereo: "Stereo"
        case .mono: "Mono"
        }
    }
}

/// Plays short, SAFE sine tones for channel verification. Amplitude is kept at
/// a low fixed level; no frequency sweeps, no loud signals.
@MainActor
public final class SpeakerTonePlayer: ObservableObject, @unchecked Sendable {
    @Published public private(set) var isPlaying = false
    private var engine: AVAudioEngine?
    private var player: AVAudioPlayerNode?
    private let amplitude: Float = 0.2 // ~ -14 dBFS, intentionally tame
    private let frequency: Float = 440

    public init() {}

    public func play(_ tone: SpeakerTone, duration: TimeInterval = 1.0) {
        stop()
        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        let format = engine.mainMixerNode.outputFormat(forBus: 0)

        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)

        let channels = max(1, Int(format.channelCount))
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(format.sampleRate * duration))!
        buffer.frameLength = AVAudioFrameCount(format.sampleRate * duration)

        let samples = buffer.floatChannelData
        for channel in 0..<channels {
            guard let channelData = samples?[channel] else { continue }
            for frame in 0..<Int(buffer.frameLength) {
                let t = Float(frame) / Float(format.sampleRate)
                let value = sin(2 * .pi * frequency * t) * amplitude
                switch tone {
                case .left:  channelData[frame] = (channel == 0) ? value : 0
                case .right: channelData[frame] = (channel == 1) ? value : 0
                case .mono:  channelData[frame] = value * 0.7
                case .stereo: channelData[frame] = value
                }
            }
        }

        do {
            try engine.start()
        } catch {
            return
        }
        self.engine = engine
        self.player = player
        player.play()
        player.scheduleBuffer(buffer, at: nil, options: []) { [weak self] in
            Task { @MainActor in self?.stop() }
        }
        isPlaying = true
    }

    public func stop() {
        player?.stop()
        engine?.stop()
        engine?.detach(player ?? AVAudioPlayerNode())
        engine = nil
        player = nil
        isPlaying = false
    }
}