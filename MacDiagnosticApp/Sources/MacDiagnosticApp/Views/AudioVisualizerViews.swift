import SwiftUI
import MacDiagnosticKit

/// Combined live/preview audio visualization: waveform on top, frequency
/// response bars underneath.
struct AudioPreviewView: View {
    let waveform: [CGFloat]
    let spectrum: [CGFloat]
    var live = false

    var body: some View {
        VStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Waveform")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(live ? "LIVE" : "RECORDED")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(live ? .green : .orange)
                }
                WaveformView(values: waveform)
                    .frame(height: 64)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Frequency Response")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                SpectrumBarsView(values: spectrum)
                    .frame(height: 64)
            }
        }
    }
}

/// Symmetric amplitude waveform drawn as vertical bars around a center line.
struct WaveformView: View {
    let values: [CGFloat]

    var body: some View {
        Canvas { context, size in
            guard !values.isEmpty else {
                drawEmptyBars(context: &context, size: size, fill: Color(nsColor: .controlBackgroundColor))
                return
            }
            let midY = size.height / 2
            let step = size.width / CGFloat(values.count)
            let barWidth = max(1, step * 0.7)
            for (i, v) in values.enumerated() {
                let amplitude = max(1.5, size.height / 2 * min(1, v))
                let x = CGFloat(i) * step
                let rect = CGRect(x: x, y: midY - amplitude, width: barWidth, height: amplitude * 2)
                context.fill(Path(roundedRect: rect, cornerRadius: barWidth / 3), with: .color(.green))
            }
        }
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private func drawEmptyBars(context: inout GraphicsContext, size: CGSize, fill: Color) {
        let step = size.width / 40
        let midY = size.height / 2
        for i in 0..<40 {
            let x = CGFloat(i) * step
            let rect = CGRect(x: x, y: midY - 1, width: max(1, step * 0.7), height: 2)
            context.fill(Path(roundedRect: rect, cornerRadius: 1), with: .color(fill))
        }
    }
}

/// Frequency response bars (bottom-up), colored from green (low) to red (high).
struct SpectrumBarsView: View {
    let values: [CGFloat]

    var body: some View {
        Canvas { context, size in
            guard !values.isEmpty else {
                drawEmptyBars(context: &context, size: size)
                return
            }
            let step = size.width / CGFloat(values.count)
            let barWidth = max(1, step * 0.7)
            for (i, v) in values.enumerated() {
                let height = max(1.5, size.height * min(1, v))
                let x = CGFloat(i) * step
                let rect = CGRect(x: x, y: size.height - height, width: barWidth, height: height)
                let hue = Double(i) / Double(max(1, values.count)) * 0.35
                let color = Color(hue: hue, saturation: 0.75, brightness: 0.95)
                context.fill(Path(roundedRect: rect, cornerRadius: 2), with: .color(color))
            }
        }
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private func drawEmptyBars(context: inout GraphicsContext, size: CGSize) {
        let step = size.width / 40
        for i in 0..<40 {
            let x = CGFloat(i) * step
            let rect = CGRect(x: x, y: size.height - 2, width: max(1, step * 0.7), height: 2)
            context.fill(Path(roundedRect: rect, cornerRadius: 1), with: .color(Color(nsColor: .controlBackgroundColor)))
        }
    }
}
