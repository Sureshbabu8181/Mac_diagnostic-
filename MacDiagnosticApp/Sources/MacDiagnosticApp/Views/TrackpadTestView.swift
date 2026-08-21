import SwiftUI
import MacDiagnosticKit

/// Interactive trackpad test: pointer, clicks, scroll, pinch/zoom, rotate,
/// force click. Local NSEvent monitors only while the screen is active.
struct TrackpadTestView: View {
    @ObservedObject var vm: SessionRunViewModel
    @StateObject private var capture = TrackpadCapture()

    var body: some View {
        ManualTestContainer(
            title: "Trackpad",
            whyItMatters: "Verify pointer movement, left/right click, two-finger scrolling, pinch/zoom, rotate and force click respond correctly.",
            kind: .trackpad,
            vm: vm
        ) {
            VStack(spacing: 16) {
                HStack(spacing: 24) {
                    stat("Left Click", capture.leftClicks)
                    stat("Right Click", capture.rightClicks)
                    stat("Scroll", capture.scrollEvents)
                    stat("Pinch/Zoom", capture.magnifications)
                    stat("Rotate", capture.rotations)
                    stat("Force Click", capture.forceClicks)
                    Button(capture.running ? "Reset" : "Start") { capture.start() }
                        .buttonStyle(.bordered)
                }

                Text("Pointer X: \(Int(capture.pointer.x))   Y: \(Int(capture.pointer.y))")
                    .font(.callout.monospaced())

                ScrollView {
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(capture.samples.prefix(20)) { sample in
                            HStack {
                                Text(sample.kind).font(.caption.bold())
                                Text(sample.detail).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(height: 120)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color(nsColor: .textBackgroundColor)))
            }
        }
        .onAppear { capture.start() }
        .onDisappear { capture.stop() }
    }

    private func stat(_ label: String, _ value: Int) -> some View {
        VStack {
            Text("\(value)").font(.title2.bold())
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
    }
}