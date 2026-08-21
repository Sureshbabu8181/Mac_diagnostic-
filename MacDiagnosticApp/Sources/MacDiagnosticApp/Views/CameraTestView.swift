import SwiftUI
import AppKit
import AVFoundation
import MacDiagnosticKit

/// Camera test: permission, live preview, frame count. No images/video saved.
struct CameraTestView: View {
    @ObservedObject var vm: SessionRunViewModel
    @Environment(\.dismiss) private var dismiss
    @StateObject private var monitor = CameraMonitor()
    @State private var permission = PermissionManager.status(for: .camera)
    @State private var notes = ""

    var body: some View {
        ZStack(alignment: .topLeading) {
            VStack(spacing: 18) {
                if !permission.granted {
                    permissionView
                } else {
                    preview
                    HStack(spacing: 24) {
                        stat("Frames Received", "\(monitor.frameCount)")
                        stat("Resolution", monitor.resolution.isEmpty ? "N/A" : monitor.resolution)
                    }
                }
                Spacer()
                verdictFooter
            }
            .padding(24)

            // No banner — just a transparent back arrow.
            Button {
                vm.skipManual()
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.title3.bold())
                    .frame(width: 36, height: 36)
                    .background(.black.opacity(0.35), in: Circle())
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(.white)
            .padding(16)
            .help("Back")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(nsColor: .windowBackgroundColor))
        .onAppear { startIfPossible() }
        .onDisappear { monitor.stop() }
    }

    private func startIfPossible() {
        reload()
        if permission.granted && !monitor.isRunning {
            monitor.configure()
        }
    }

    private var preview: some View {
        Group {
            if monitor.isRunning {
                CameraPreviewRepresentable(layer: monitor.previewLayer)
                    .frame(width: 560, height: 360)
                    .border(Color(nsColor: .separatorColor), width: 1)
            } else {
                VStack {
                    if let err = monitor.lastError {
                        Text(err).foregroundStyle(.red)
                    }
                    Button("Start Camera") { monitor.configure() }
                        .testActionButton()
                }
                .frame(width: 560, height: 360)
                .background(RoundedRectangle(cornerRadius: 0).fill(Color(nsColor: .textBackgroundColor)))
            }
        }
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack {
            Text(value).font(.title3.bold())
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
    }

    private var permissionView: some View {
        VStack(spacing: 12) {
            Text(permission.message)
            if permission.notDetermined {
                Button("Grant Camera Permission") {
                    Task {
                        _ = await PermissionManager.request(.camera)
                        startIfPossible()
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

    private var verdictFooter: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading) {
                Text("Technician Notes")
                TextEditor(text: $notes)
                    .frame(height: 52)
                    .scrollContentBackground(.hidden)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color(nsColor: .textBackgroundColor)))
            }
            .frame(width: 280)

            Spacer()

            HStack(spacing: 10) {
                Button("PASS") { record(.pass) }
                    .tint(.green).testActionButton()
                Button("FAIL") { record(.fail) }
                    .tint(.red).testActionButton()
                Button("SKIP") { record(.skipped) }
                    .buttonStyle(.bordered)
            }
        }
        .onChange(of: notes) { _, newValue in
            vm.currentNotes = newValue
        }
    }

    private func record(_ status: DiagnosticStatus) {
        if status == .skipped {
            vm.skipManual()
        } else {
            vm.advanceManual(status: status)
        }
    }

    private func reload() {
        permission = PermissionManager.status(for: .camera)
    }
}

struct CameraPreviewRepresentable: NSViewRepresentable {
    let layer: AVCaptureVideoPreviewLayer

    func makeNSView(context: Context) -> NSView {
        CameraPreviewView(layer: layer)
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        (nsView as? CameraPreviewView)?.previewLayer.frame = nsView.bounds
    }
}

/// Layer-backed host that makes the preview layer the view's backing layer.
/// Using `makeBackingLayer()` is the canonical way to host an
/// AVCaptureVideoPreviewLayer: AppKit keeps it sized to the view, so the
/// preview never ends up 0x0 or detached.
final class CameraPreviewView: NSView {
    let previewLayer: AVCaptureVideoPreviewLayer

    init(layer: AVCaptureVideoPreviewLayer) {
        previewLayer = layer
        super.init(frame: .zero)
        wantsLayer = true
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func makeBackingLayer() -> CALayer {
        previewLayer
    }

    override func layout() {
        super.layout()
        previewLayer.frame = bounds
    }
}