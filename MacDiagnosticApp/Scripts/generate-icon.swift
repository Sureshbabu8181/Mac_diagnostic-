#!/usr/bin/env swift
// Generates the app icon (diagnostic ECG-pulse motif) at all .icns sizes
// and compiles Resources/MacDiagnosticApp.icns with iconutil.
import AppKit
import Foundation

let root = CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : FileManager.default.currentDirectoryPath

let iconset = URL(fileURLWithPath: root).appendingPathComponent("Resources/AppIcon.iconset")
try? FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)

func drawIcon(size: CGFloat) -> NSImage {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()
    guard let ctx = NSGraphicsContext.current?.cgContext else {
        image.unlockFocus()
        return image
    }

    let rect = NSRect(x: 0, y: 0, width: size, height: size)
    let corner = size * 0.2237
    let path = NSBezierPath(roundedRect: rect, xRadius: corner, yRadius: corner)
    path.addClip()

    let colors = [
        NSColor(calibratedRed: 0.16, green: 0.42, blue: 0.98, alpha: 1).cgColor,
        NSColor(calibratedRed: 0.03, green: 0.07, blue: 0.20, alpha: 1).cgColor,
    ]
    let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                              colors: colors as CFArray, locations: [0, 1])!
    ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: size), end: CGPoint(x: 0, y: 0), options: [])

    // Subtle inner ring.
    let ring = NSBezierPath(roundedRect: rect.insetBy(dx: size * 0.02, dy: size * 0.02),
                            xRadius: corner * 0.8, yRadius: corner * 0.8)
    NSColor(calibratedWhite: 1, alpha: 0.18).setStroke()
    ring.lineWidth = size * 0.008
    ring.stroke()

    // ECG pulse line.
    let p = NSBezierPath()
    let base = size * 0.5
    p.move(to: NSPoint(x: size * 0.06, y: base))
    p.line(to: NSPoint(x: size * 0.20, y: base))
    p.line(to: NSPoint(x: size * 0.23, y: size * 0.36))
    p.line(to: NSPoint(x: size * 0.27, y: size * 0.62))
    p.line(to: NSPoint(x: size * 0.31, y: base))
    p.line(to: NSPoint(x: size * 0.39, y: base))
    p.line(to: NSPoint(x: size * 0.42, y: size * 0.40))
    p.line(to: NSPoint(x: size * 0.46, y: size * 0.66))
    p.line(to: NSPoint(x: size * 0.50, y: base))
    p.line(to: NSPoint(x: size * 0.94, y: base))
    NSColor(calibratedWhite: 1, alpha: 0.35).setStroke()
    p.lineWidth = size * 0.055
    p.lineCapStyle = .round
    p.lineJoinStyle = .round
    p.stroke()
    p.lineWidth = size * 0.022
    NSColor.white.setStroke()
    p.stroke()

    image.unlockFocus()
    return image
}

let specs: [(Int, Int)] = [(16, 16), (16, 32), (32, 32), (32, 64),
                           (128, 128), (128, 256), (256, 256), (256, 512),
                           (512, 512), (512, 1024)]

for (px, nameSize) in specs {
    let image = drawIcon(size: CGFloat(nameSize))
    let rep = NSBitmapImageRep(data: image.tiffRepresentation!)!
    let png = rep.representation(using: .png, properties: [:])!
    let filename = "icon_\(px)x\(px)\(nameSize == px ? "" : "@2x").png"
    try png.write(to: iconset.appendingPathComponent(filename))
    print("wrote \(filename)")
}

let icnsURL = URL(fileURLWithPath: root).appendingPathComponent("Resources/MacDiagnosticApp.icns")
try? FileManager.default.removeItem(at: icnsURL)
let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
process.arguments = ["-c", "icns", iconset.path, "-o", icnsURL.path]
try process.run()
process.waitUntilExit()
print(process.terminationStatus == 0 ? "icns OK: \(icnsURL.path)" : "icns FAILED")