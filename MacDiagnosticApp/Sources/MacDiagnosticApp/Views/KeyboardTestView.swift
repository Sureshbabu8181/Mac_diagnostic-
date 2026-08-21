import SwiftUI
import MacDiagnosticKit

/// Interactive keyboard test: local NSEvent monitor only while this screen is
/// active. Never collects typed text; only key press/release events.
struct KeyboardTestView: View {
    @ObservedObject var vm: SessionRunViewModel
    @StateObject private var capture = KeyboardCapture()

    var body: some View {
        ManualTestContainer(
            title: "Keyboard",
            whyItMatters: "Press every key and watch it highlight. Missing, repeated or stuck keys indicate a keyboard fault. Key events are captured only while this screen is open; no text is stored.",
            kind: .keyboard,
            vm: vm
        ) {
            VStack(spacing: 12) {
                onScreenKeyboard

                HStack(spacing: 20) {
                    stat("Untested", "\(capture.untestedKeys().count)", .secondary)
                    stat("Repeated", "\(capture.repeatedKeys.count)", capture.repeatedKeys.isEmpty ? .green : .orange)
                    stat("Stuck", "\(capture.stuckKeys.count)", capture.stuckKeys.isEmpty ? .green : .red)
                    Button(capture.running ? "Reset" : "Start") {
                        capture.reset()
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
        .onAppear { capture.start() }
        .onDisappear { capture.stop() }
    }

    private func stat(_ label: String, _ value: String, _ color: Color) -> some View {
        VStack {
            Text(value).font(.title2.bold()).foregroundStyle(color)
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
    }

    private var onScreenKeyboard: some View {
        KeyboardVisualView(
            keys: capture.layout,
            pressed: capture.pressed,
            completed: capture.completed,
            repeated: capture.repeatedKeys
        )
        .frame(maxWidth: 900)
        .frame(height: 310)
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .textBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(nsColor: .separatorColor), lineWidth: 1.5))
    }
}

/// Positional Mac keyboard rendered inside a fixed frame. Keys sit on a real
/// (row, column) grid — including the function row, numeric row and arrow
/// cluster — and the whole board scales to fit, so every key is always visible.
struct KeyboardVisualView: View {
    let keys: [KeyboardKey]
    let pressed: Set<UInt16>
    let completed: Set<UInt16>
    let repeated: Set<UInt16>

    private let maxColumns = 18.0
    private let totalRows = 8.0
    private let rowHeightFactor = 1.25

    var body: some View {
        GeometryReader { geo in
            let unit = min(geo.size.width / maxColumns, geo.size.height / (totalRows * rowHeightFactor))
            let keyHeight = unit * rowHeightFactor
            let gap = min(unit * 0.14, 5.5)
            ZStack(alignment: .topLeading) {
                ForEach(keys, id: \.id) { key in
                    KeyCapView(
                        label: key.label,
                        isPressed: pressed.contains(key.keyCode),
                        isDone: completed.contains(key.keyCode),
                        isRepeated: repeated.contains(key.keyCode)
                    )
                    .frame(width: max(key.width * unit - gap, 8), height: max(keyHeight - gap, 8))
                    .position(x: (key.column + key.width / 2) * unit,
                              y: (Double(key.row) * rowHeightFactor + rowHeightFactor / 2) * unit)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }
}

struct KeyCapView: View {
    let label: String
    let isPressed: Bool
    let isDone: Bool
    let isRepeated: Bool

    var body: some View {
        Text(label)
            .font(.system(size: 12, weight: .semibold))
            .lineLimit(1)
            .minimumScaleFactor(0.4)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(background, in: RoundedRectangle(cornerRadius: 7))
            .overlay(RoundedRectangle(cornerRadius: 7).stroke(borderColor, lineWidth: 1.5))
    }

    private var borderColor: Color {
        if isPressed { return .blue }
        if isDone { return .green }
        if isRepeated { return .orange }
        return Color(nsColor: .separatorColor)
    }

    private var background: Color {
        if isRepeated { return .orange.opacity(0.8) }
        if isPressed { return .blue.opacity(0.7) }
        if isDone { return .green.opacity(0.35) }
        return Color(nsColor: .controlBackgroundColor)
    }
}