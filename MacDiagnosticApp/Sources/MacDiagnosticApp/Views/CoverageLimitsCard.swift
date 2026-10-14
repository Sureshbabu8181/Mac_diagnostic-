import SwiftUI
import MacDiagnosticKit

/// Collapsible disclosure card listing things macOS does not expose or that
/// are measured only as documented proxies. Shown on result screens so the
/// technician and customer see the exact coverage of a run.
struct CoverageLimitsCard: View {
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                withAnimation(.easeInOut(duration: 0.15)) { expanded.toggle() }
            } label: {
                HStack {
                    Image(systemName: "info.circle")
                    Text("Test Coverage & Limitations").font(.headline)
                    Spacer()
                    Image(systemName: expanded ? "chevron.up" : "chevron.down")
                        .font(.caption)
                }
            }
            .buttonStyle(.plain)

            if expanded {
                ForEach(CoverageLimits.items, id: \.area) { item in
                    VStack(alignment: .leading, spacing: 1) {
                        Text(item.area).font(.callout.weight(.semibold))
                        Text(item.detail).font(.caption).foregroundStyle(.secondary)
                    }
                    .padding(.leading, 24)
                }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color(nsColor: .controlBackgroundColor)))
    }
}
