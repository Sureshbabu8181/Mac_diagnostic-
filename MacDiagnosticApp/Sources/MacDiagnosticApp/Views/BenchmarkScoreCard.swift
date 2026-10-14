import SwiftUI
import MacDiagnosticKit

/// Prominent benchmark score card: big 0–100 number, letter grade, and a
/// per-component breakdown bar list (CPU, GPU, Memory, Storage, Battery,
/// Thermals, Health).
struct BenchmarkScoreCard: View {
    let score: BenchmarkScore

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 16) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("DEVICE BENCHMARK")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text("\(score.overall)")
                            .font(.system(size: 44, weight: .heavy, design: .rounded))
                            .foregroundStyle(scoreColor)
                        Text("/ 100")
                            .font(.title3)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                VStack(spacing: 4) {
                    Text(score.grade)
                        .font(.system(size: 30, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                        .frame(width: 54, height: 54)
                        .background(scoreColor, in: RoundedRectangle(cornerRadius: 12))
                    Text(score.label)
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                }
            }

            Divider()

            VStack(spacing: 6) {
                ForEach(score.components, id: \.name) { component in
                    HStack {
                        Text(component.name)
                            .font(.callout.bold())
                            .frame(width: 90, alignment: .leading)
                        ProgressView(value: Double(component.score), total: 100)
                            .frame(maxWidth: 180)
                            .tint(color(for: component.score))
                        Text("\(component.score)")
                            .font(.callout.monospacedDigit().bold())
                            .frame(width: 30, alignment: .trailing)
                        Text(component.detail)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(nsColor: .separatorColor), lineWidth: 0.5))
    }

    private var scoreColor: Color {
        color(for: score.overall)
    }

    private func color(for value: Int) -> Color {
        switch value {
        case 90...100: .green
        case 75..<90: .blue
        case 60..<75: .orange
        default: .red
        }
    }
}
