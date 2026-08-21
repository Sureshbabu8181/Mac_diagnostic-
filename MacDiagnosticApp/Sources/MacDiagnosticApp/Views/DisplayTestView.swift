import SwiftUI
import MacDiagnosticKit

/// Fullscreen VISUAL DISPLAY TEST. Technician inspects each pattern for dead
/// pixels, stuck pixels, uniformity and flicker. Always fullscreen; controls
/// are transparent overlays so they never hide the pattern. Explicitly a
/// visual test.
struct DisplayTestView: View {
    @ObservedObject var vm: SessionRunViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var index = 0
    @State private var showControls = true
    @State private var hideTask: Task<Void, Never>?

    private let flatPatterns: [(String, Color)] = [
        ("Black", .black), ("White", .white), ("Red", .red), ("Green", .green),
        ("Blue", .blue), ("Gray", Color(white: 0.5)),
    ]
    private let specialPatterns = ["Checkerboard", "Color Bars", "Gray Ramp", "Crosshatch", "Pixel Grid"]
    private let gradientColors: [Color] = [.red, .orange, .yellow, .green, .blue, .purple, .black]

    var body: some View {
        ZStack(alignment: .topLeading) {
            patternContent
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ignoresSafeArea()

            // Transparent back arrow (top-left) — exits the test.
            overlayCircleButton(systemImage: "chevron.left") {
                vm.skipManual()
                dismiss()
            }
            .padding(16)
            .help("Back")

            // Transparent previous / next arrows at the edges — hidden until the
            // mouse moves so the screen shows only the back arrow.
            VStack {
                Spacer()
                HStack {
                    overlayCircleButton(systemImage: "chevron.left", size: 54) { move(-1) }
                        .help("Previous pattern")
                    Spacer()
                    overlayCircleButton(systemImage: "chevron.right", size: 54) { move(1) }
                        .help("Next pattern")
                }
                Spacer()
            }
            .padding(.horizontal, 20)
            .opacity(showControls ? 1 : 0)

            // Transparent PASS / FAIL / SKIP controls at the bottom.
            VStack {
                Spacer()
                HStack(spacing: 16) {
                    verdictButton("PASS", systemImage: "checkmark") { finish(.pass) }
                    verdictButton("FAIL", systemImage: "xmark") { finish(.fail) }
                    verdictButton("SKIP", systemImage: "forward.end") { finish(.skipped) }
                }
                Text("\(index + 1) / \(patternCount) — \(patternName)")
                    .font(.caption.bold())
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(.black.opacity(0.35), in: Capsule())
            }
            .padding(.bottom, 24)
            .opacity(showControls ? 1 : 0)
        }
        .foregroundStyle(.white)
        .toolbar(.hidden, for: .windowToolbar)
        .onContinuousHover { phase in
            guard case .active = phase else { return }
            showControls = true
            hideTask?.cancel()
            hideTask = Task { @MainActor in
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                guard !Task.isCancelled else { return }
                showControls = false
            }
        }
        .onExitCommand {
            vm.skipManual()
            dismiss()
        }
    }

    private var patternName: String {
        if index < flatPatterns.count { return flatPatterns[index].0 }
        if index < flatPatterns.count + specialPatterns.count {
            return specialPatterns[index - flatPatterns.count]
        }
        return "Gradient"
    }

    private var patternCount: Int { flatPatterns.count + specialPatterns.count + 1 }

    @ViewBuilder
    private var patternContent: some View {
        switch patternName {
        case "Black": Rectangle().fill(.black)
        case "White": Rectangle().fill(.white)
        case "Red": Rectangle().fill(.red)
        case "Green": Rectangle().fill(.green)
        case "Blue": Rectangle().fill(.blue)
        case "Gray": Rectangle().fill(Color(white: 0.5))
        case "Checkerboard": CheckerboardView()
        case "Color Bars": ColorBarsView()
        case "Gray Ramp": GrayRampView()
        case "Crosshatch": CrosshatchView()
        case "Pixel Grid": PixelGridView()
        default: LinearGradient(colors: gradientColors, startPoint: .leading, endPoint: .trailing)
        }
    }

    private func move(_ delta: Int) {
        index = (index + delta + patternCount) % patternCount
    }

    private func finish(_ status: DiagnosticStatus) {
        if status == .skipped {
            vm.skipManual()
        } else {
            vm.advanceManual(status: status)
        }
    }

    private func overlayCircleButton(systemImage: String, size: CGFloat = 44,
                                     action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: size * 0.45, weight: .bold))
                .frame(width: size, height: size)
                .background(.black.opacity(0.35), in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
    }

    private func verdictButton(_ title: String, systemImage: String,
                               action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.headline)
                .padding(.horizontal, 22)
                .padding(.vertical, 11)
                .background(.black.opacity(0.4), in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

struct CheckerboardView: View {
    let size = 8
    var body: some View {
        GeometryReader { geo in
            let cell = geo.size.width / CGFloat(size)
            let cols = Int(geo.size.width / cell)
            let rows = Int(geo.size.height / cell)
            Canvas { context, _ in
                for r in 0..<rows {
                    for c in 0..<cols {
                        let rect = CGRect(x: CGFloat(c) * cell, y: CGFloat(r) * cell, width: cell, height: cell)
                        context.fill(Path(rect), with: .color((r + c) % 2 == 0 ? .black : .white))
                    }
                }
            }
        }
    }
}

/// SMPTE-style color bars — checks color purity and banding across the panel.
struct ColorBarsView: View {
    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array([Color.white, .yellow, .cyan, .green, Color(red: 1, green: 0, blue: 1), .red, .blue].enumerated()), id: \.offset) { _, color in
                Rectangle().fill(color)
            }
        }
    }
}

/// Smooth black-to-white ramp — checks banding and gradient smoothness.
struct GrayRampView: View {
    var body: some View {
        LinearGradient(colors: [.black, .white], startPoint: .top, endPoint: .bottom)
    }
}

/// Large crosshatch grid — checks panel geometry, linearity and convergence.
struct CrosshatchView: View {
    var body: some View {
        GeometryReader { geo in
            Path { p in
                let spacing: CGFloat = 100
                var x: CGFloat = 0
                while x <= geo.size.width {
                    p.move(to: CGPoint(x: x, y: 0))
                    p.addLine(to: CGPoint(x: x, y: geo.size.height))
                    x += spacing
                }
                var y: CGFloat = 0
                while y <= geo.size.height {
                    p.move(to: CGPoint(x: 0, y: y))
                    p.addLine(to: CGPoint(x: geo.size.width, y: y))
                    y += spacing
                }
            }
            .stroke(Color.white, lineWidth: 2)
            .background(Color.black)
        }
    }
}

/// Fine pixel grid — checks for dead/stuck pixels across the whole panel.
struct PixelGridView: View {
    var body: some View {
        GeometryReader { geo in
            let cell: CGFloat = 4
            let cols = Int(geo.size.width / cell)
            let rows = Int(geo.size.height / cell)
            Canvas { context, _ in
                for r in 0..<rows {
                    for c in 0..<cols {
                        let rect = CGRect(x: CGFloat(c) * cell, y: CGFloat(r) * cell, width: cell, height: cell)
                        context.fill(Path(rect), with: .color((r + c) % 2 == 0 ? .white : .black))
                    }
                }
            }
        }
    }
}