import Foundation
import CoreGraphics
import AppKit

/// PDF report renderer (AppKit text in a flipped CoreGraphics context).
/// Deterministic, offline, local. Text is drawn with NSAttributedString on a
/// flipped graphics context, which keeps letters upright — raw CoreText
/// CTLineDraw with a manual text matrix can flip/mirror glyphs in PDF output.
public enum PDFReportRenderer {
    struct TextRun {
        var string: String
        var fontSize: CGFloat
        var bold: Bool
        var color: CGColor
    }

    public static func render(session: DiagnosticSession, companyName: String) -> Data {
        let boxSize = CGSize(width: 612, height: 792) // US Letter portrait
        var pageRect = CGRect(origin: .zero, size: boxSize)
        let data = NSMutableData()

        guard let consumer = CGDataConsumer(data: data as CFMutableData),
              let ctx = CGContext(consumer: consumer, mediaBox: &pageRect, nil)
        else { return Data() }

        ctx.beginPDFPage(nil)

        var y = boxSize.height - 48

        // Header
        let company = companyName.isEmpty ? "MAC DIAGNOSTIC REPORT" : companyName
        draw(TextRun(string: company.uppercased(), fontSize: 18, bold: true, color: .black), at: CGPoint(x: 48, y: y), ctx: ctx)
        y -= 24
        draw(TextRun(string: "MAC HARDWARE DIAGNOSTIC REPORT", fontSize: 14, bold: true, color: gray), at: CGPoint(x: 48, y: y), ctx: ctx)
        y -= 30

        // Device section
        y = section(ctx, at: y, title: "DEVICE", lines: [
            ("Model", "\(session.device.modelName) (\(session.device.modelIdentifier))"),
            ("Serial", session.device.serialNumber),
            ("Chip", session.device.chip),
            ("macOS", "\(session.device.osVersion)  build \(session.device.osBuild)"),
            ("Memory", session.device.memoryGB),
            ("Storage", session.device.storageGB),
        ])

        y = section(ctx, at: y, title: "SESSION", lines: [
            ("Technician", session.technicianName),
            ("Started", DateFormatter.fmt.string(from: session.startedAt)),
            ("Ended", session.endedAt.map { DateFormatter.fmt.string(from: $0) } ?? "—"),
            ("App Version", session.appVersion),
            ("Session ID", session.id.uuidString),
        ])

        // Results matrix
        y = section(ctx, at: y, title: "DIAGNOSTIC RESULTS", lines: [])
        var results: [TextRun] = []
        for kind in DiagnosticKind.allCases {
            guard let result = session.result(for: kind) else { continue }
            let color: CGColor = statusColor(result.status)
            results.append(TextRun(string: "\(kind.displayName):  \(result.status.displayName)", fontSize: 12, bold: false, color: color))
            for metric in result.metrics.prefix(8) {
                results.append(TextRun(string: "   •  \(metric.name): \(metric.value)", fontSize: 10, bold: false, color: darkGray))
            }
        }
        for run in results {
            draw(run, at: CGPoint(x: 56, y: y), ctx: ctx)
            y -= CGFloat(run.string.isEmpty ? 0 : 15)
            if y < 80 {
                ctx.endPDFPage()
                ctx.beginPDFPage(nil)
                y = boxSize.height - 48
            }
        }

        y -= 8
        y = section(ctx, at: y, title: "OVERALL RESULT", lines: [])
        draw(TextRun(string: session.overall.displayName, fontSize: 16, bold: true, color: verdictColor(session.overall.verdict)), at: CGPoint(x: 56, y: y), ctx: ctx)

        ctx.endPDFPage()
        ctx.closePDF()
        return data as Data
    }

    private static let gray = CGColor(gray: 0.45, alpha: 1)
    private static let darkGray = CGColor(gray: 0.25, alpha: 1)
    private static let black = CGColor(gray: 0, alpha: 1)

    private static func statusColor(_ s: DiagnosticStatus) -> CGColor {
        switch s {
        case .pass: CGColor(red: 0.1, green: 0.55, blue: 0.2, alpha: 1)
        case .warning: CGColor(red: 0.8, green: 0.5, blue: 0.05, alpha: 1)
        case .fail: CGColor(red: 0.75, green: 0.1, blue: 0.1, alpha: 1)
        case .manualRequired, .notAvailable: CGColor(gray: 0.45, alpha: 1)
        default: black
        }
    }

    private static func verdictColor(_ v: DiagnosticSession.OverallResult.Verdict) -> CGColor {
        switch v {
        case .pass: CGColor(red: 0.1, green: 0.55, blue: 0.2, alpha: 1)
        case .passWithWarning: CGColor(red: 0.8, green: 0.5, blue: 0.05, alpha: 1)
        case .fail: CGColor(red: 0.75, green: 0.1, blue: 0.1, alpha: 1)
        case .manualRequired: CGColor(gray: 0.35, alpha: 1)
        case .inProgress: CGColor(gray: 0.5, alpha: 1)
        }
    }

    private static func section(_ ctx: CGContext, at y: CGFloat, title: String, lines: [(String, String)]) -> CGFloat {
        var cursor = y
        draw(TextRun(string: title, fontSize: 13, bold: true, color: black), at: CGPoint(x: 48, y: cursor), ctx: ctx)
        cursor -= 18
        for (k, v) in lines {
            draw(TextRun(string: "\(k):  \(v)", fontSize: 11, bold: false, color: darkGray), at: CGPoint(x: 56, y: cursor), ctx: ctx)
            cursor -= 15
        }
        return cursor - 12
    }

    // MARK: - Text drawing

    private static func draw(_ run: TextRun, at point: CGPoint, ctx: CGContext) {
        guard !run.string.isEmpty else { return }
        let font = NSFont(name: run.bold ? "Helvetica-Bold" : "Helvetica", size: run.fontSize)
            ?? NSFont.systemFont(ofSize: run.fontSize, weight: run.bold ? .bold : .regular)
        let color = NSColor(cgColor: run.color) ?? .black
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: color,
        ]
        let string = NSAttributedString(string: run.string, attributes: attributes)

        // Flipped context: `point` is the text's top-left in the top-down
        // coordinate system this renderer lays out in, and the text draws
        // upright (no inverted / mirrored glyphs).
        let graphics = NSGraphicsContext(cgContext: ctx, flipped: true)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = graphics
        string.draw(at: point)
        NSGraphicsContext.restoreGraphicsState()
    }
}

private extension DateFormatter {
    static let fmt: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return f
    }()
}