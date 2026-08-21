import SwiftUI
import MacDiagnosticKit

/// Speaker channel verification: safe, short tones on left / right / stereo /
/// mono.
struct SpeakerTestView: View {
    @ObservedObject var vm: SessionRunViewModel
    @StateObject private var player = SpeakerTonePlayer()
    @State private var outputDevice = "—"

    var body: some View {
        ManualTestContainer(
            title: "Speakers",
            whyItMatters: "Plays a safe, short tone through left, right, stereo and mono channels so the technician can verify both speakers. Volume stays at a fixed safe level.",
            kind: .speakers,
            vm: vm
        ) {
            VStack(spacing: 16) {
                LabeledContent("Output Device") {
                    Text(outputDevice)
                }
                .padding(.horizontal, 60)

                HStack(spacing: 16) {
                    ForEach(SpeakerTone.allCases) { tone in
                        Button(tone.label) {
                            player.play(tone)
                        }
                        .tint(.blue).testActionButton()
                    }
                    Button("Stop") { player.stop() }
                        .buttonStyle(.bordered)
                        .disabled(!player.isPlaying)
                }
                Text(player.isPlaying ? "Playing… listen carefully." : "Press a channel button to play a test tone.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
        .onAppear {
            outputDevice = AudioDeviceProbe.defaultOutput()?.name ?? "NOT AVAILABLE"
        }
        .onDisappear { player.stop() }
    }
}