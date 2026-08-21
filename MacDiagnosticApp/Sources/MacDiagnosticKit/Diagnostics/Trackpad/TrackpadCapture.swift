import Foundation
import AppKit

public struct TrackpadSample: Identifiable, Sendable {
    public let id = UUID()
    public let kind: String
    public let detail: String
    public let date: Date
}

/// Captures pointer, click, scroll, pinch/zoom, rotate and force events via
/// local NSEvent monitors — active ONLY while the trackpad test screen runs.
@MainActor
public final class TrackpadCapture: ObservableObject, @unchecked Sendable {
    @Published public private(set) var pointer = CGPoint.zero
    @Published public private(set) var leftClicks = 0
    @Published public private(set) var rightClicks = 0
    @Published public private(set) var scrollEvents = 0
    @Published public private(set) var magnifications = 0
    @Published public private(set) var rotations = 0
    @Published public private(set) var swipes = 0
    @Published public private(set) var forceClicks = 0
    @Published public private(set) var samples: [TrackpadSample] = []
    @Published public private(set) var running = false

    private var monitors: [Any] = []
    private var lastSampleDate = Date.distantPast

    public init() {}

    public func start() {
        guard monitors.isEmpty else { return }
        running = true
        lastSampleDate = Date.distantPast
        add(.mouseMoved) { [weak self] e in self?.onMove(e) }
        add(.leftMouseDown) { [weak self] e in self?.onLeftDown(e) }
        add(.rightMouseDown) { [weak self] e in self?.onRightDown(e) }
        add(.scrollWheel) { [weak self] e in self?.onScroll(e) }
        add(.magnify) { [weak self] e in self?.onMagnify(e) }
        add(.rotate) { [weak self] e in self?.onRotate(e) }
        add(.swipe) { [weak self] e in self?.onSwipe(e) }
        add(.pressure) { [weak self] e in self?.onPressure(e) }
    }

    public func stop() {
        for monitor in monitors {
            NSEvent.removeMonitor(monitor)
        }
        monitors.removeAll()
        running = false
    }

    private func add(_ mask: NSEvent.EventTypeMask, _ handler: @escaping (NSEvent) -> Void) {
        if let monitor = NSEvent.addLocalMonitorForEvents(matching: mask, handler: { event in
            handler(event)
            return event
        }) {
            monitors.append(monitor)
        }
    }

    private func record(_ kind: String, _ detail: String) {
        if Date().timeIntervalSince(lastSampleDate) > 0.05 {
            lastSampleDate = Date()
            samples.insert(TrackpadSample(kind: kind, detail: detail, date: Date()), at: 0)
            if samples.count > 200 { samples.removeLast(samples.count - 200) }
        }
    }

    private func onMove(_ event: NSEvent) { pointer = event.locationInWindow; record("Move", String(format: "X %d  Y %d", Int(pointer.x), Int(pointer.y))) }
    private func onLeftDown(_ event: NSEvent) { leftClicks += 1; record("Click", "Left") }
    private func onRightDown(_ event: NSEvent) { rightClicks += 1; record("Click", "Right") }
    private func onScroll(_ event: NSEvent) { scrollEvents += 1; record("Scroll", String(format: "dx %.0f dy %.0f", event.scrollingDeltaX, event.scrollingDeltaY)) }
    private func onMagnify(_ event: NSEvent) { magnifications += 1; record("Pinch/Zoom", String(format: "%.2f", event.magnification)) }
    private func onRotate(_ event: NSEvent) { rotations += 1; record("Rotate", String(format: "%.1f°", event.rotation * 180 / .pi)) }
    private func onSwipe(_ event: NSEvent) { swipes += 1; record("Swipe", "") }
    private func onPressure(_ event: NSEvent) {
        if event.pressure > 0.9 { forceClicks += 1; record("Force Click", String(format: "%.2f", event.pressure)) }
    }
}