import SwiftUI
import MacDiagnosticKit

/// Microphone test: permission, live level meter, temporary recording with
/// local playback. Recording is deleted after the test.
struct MicrophoneTestView: View {
    @ObservedObject var vm: SessionRunViewModel
    @StateObject private var monitor = MicrophoneMonitor()
    @State private var devices: [MicrophoneDeviceInfo] = []
    @State private var permission = PermissionManager.status(for: .microphone)

    var body: some View {
        ManualTestContainer(
            title: "Microphone",
            whyItMatters: "Verifies the microphone is detected and records a short sample that can be played back. The recording is temporary and deleted after the test; nothing is uploaded.",
            kind: .microphone,
            vm: vm
        ) {
            VStack(spacing: 16) {
                if !permission.granted {
                    permissionView
                } else {
                    deviceList
                    levelMeter
                    visualizer
                    controls
                }
            }
            .padding(.horizontal, 60)
        }
        .onAppear { reload() }
        .onDisappear { monitor.deleteRecording() }
    }

    private var deviceList: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(devices, id: \.name) { device in
                Text("Input: \(device.name)")
            }
            if devices.isEmpty {
                Text("Input: NOT AVAILABLE").foregroundStyle(.secondary)
            }
        }
        .font(.callout)
    }

    private var levelMeter: some View {
        VStack(spacing: 6) {
            Text("Input Level")
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4).fill(Color(nsColor: .controlBackgroundColor))
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.green)
                        .frame(width: geo.size.width * min(1, max(0, CGFloat(monitor.level))))
                }
            }
            .frame(height: 12)
            .frame(maxWidth: 360)
        }
    }

    private var visualizer: some View {
        VStack(spacing: 6) {
            AudioPreviewView(
                waveform: displayedWaveform,
                spectrum: displayedSpectrum,
                live: monitor.isMonitoring || monitor.isRecording
            )
            if monitor.isRecording {
                Text("Recording… speak into the microphone. The preview updates live.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            if !isLive {
                Text("Play back the recording to see the full clip above.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: 620)
    }

    private var isLive: Bool {
        monitor.isMonitoring || monitor.isRecording
    }

    private var displayedWaveform: [CGFloat] {
        if isLive { return monitor.waveform }
        if !monitor.previewWaveform.isEmpty { return monitor.previewWaveform }
        return []
    }

    private var displayedSpectrum: [CGFloat] {
        if isLive { return monitor.spectrumBins }
        if !monitor.previewSpectrum.isEmpty { return monitor.previewSpectrum }
        return []
    }

    private var controls: some View {
        HStack(spacing: 12) {
            Button(monitor.isRecording ? "Stop Recording" : "RECORD") {
                if monitor.isRecording {
                    monitor.stopRecording()
                } else {
                    monitor.startMonitoring()
                    monitor.startRecording()
                }
            }
            .testActionButton()

            Button(monitor.isPlaying ? "Stop Playback" : "PLAYBACK") {
                if monitor.isPlaying {
                    monitor.stopPlayback()
                } else {
                    monitor.playback()
                }
            }
            .buttonStyle(.bordered)
            .disabled(monitor.lastRecordingURL == nil)

            Button("STOP TEST") { monitor.deleteRecording() }
                .buttonStyle(.bordered)
        }
    }

    private var permissionView: some View {
        VStack(spacing: 12) {
            Text(permission.message)
            if permission.notDetermined {
                Button("Grant Microphone Permission") {
                    Task {
                        _ = await PermissionManager.request(.microphone)
                        reload()
                    }
                }
                .buttonStyle(.borderedProminent)
            } else {
                Button("Open System Settings") { PermissionManager.openSettings() }
                    .buttonStyle(.bordered)
            }
        }
        .padding(.horizontal, 60)
    }

    private func reload() {
        permission = PermissionManager.status(for: .microphone)
        devices = MicrophoneProbe.devices()
    }
}