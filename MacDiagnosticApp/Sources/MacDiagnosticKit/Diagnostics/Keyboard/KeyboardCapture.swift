import Foundation
import AppKit
import Carbon

public struct KeyboardKey: Identifiable, Hashable, Sendable {
    public let keyCode: UInt16
    public var label: String
    public var kind: Kind
    public let row: Int
    public let column: Double
    public let width: Double

    public enum Kind: String, Sendable {
        case key, modifier, utility, arrow, space, fn
    }

    public var id: UInt16 { keyCode }

    public init(keyCode: UInt16, label: String, kind: Kind = .key,
                row: Int = 0, column: Double = 0, width: Double = 1) {
        self.keyCode = keyCode
        self.label = label
        self.kind = kind
        self.row = row
        self.column = column
        self.width = width
    }
}

/// Captures key events ONLY while the keyboard test screen is active.
/// Uses a local NSEvent monitor (app-delivered events), so no Accessibility
/// permission and no background logging. Typed text is never stored.
@MainActor
public final class KeyboardCapture: ObservableObject, @unchecked Sendable {
    @Published public private(set) var pressed: Set<UInt16> = []
    @Published public private(set) var completed: Set<UInt16> = []
    @Published public private(set) var repeatedKeys: Set<UInt16> = []
    @Published public private(set) var stuckKeys: Set<UInt16> = []
    @Published public private(set) var eventCount = 0
    @Published public private(set) var running = false

    public let layout: [KeyboardKey]
    private var monitor: Any?
    private var stuckTimer: Timer?
    private var keyDownTimestamps: [UInt16: Date] = [:]
    private var keyDownCounts: [UInt16: Int] = [:]
    public let stuckThreshold: TimeInterval

    public init(layout: [KeyboardKey] = KeyboardLayout.universal(), stuckThreshold: TimeInterval = 3.0) {
        self.layout = layout
        self.stuckThreshold = stuckThreshold
    }

    public var layoutKeyCodes: Set<UInt16> {
        Set(layout.map(\.keyCode))
    }

    public func start() {
        guard monitor == nil else { return }
        running = true
        pressed.removeAll()
        completed.removeAll()
        repeatedKeys.removeAll()
        stuckKeys.removeAll()
        eventCount = 0
        keyDownTimestamps.removeAll()
        keyDownCounts.removeAll()

        monitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .keyUp, .flagsChanged]) { [weak self] event in
            guard let self else { return event }
            self.handle(event)
            return event
        }

        let timer = Timer(timeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in self?.detectStuckKeys() }
        }
        RunLoop.main.add(timer, forMode: .common)
        stuckTimer = timer
    }

    public func stop() {
        if let monitor {
            NSEvent.removeMonitor(monitor)
        }
        monitor = nil
        stuckTimer?.invalidate()
        stuckTimer = nil
        running = false
    }

    public func reset() {
        stop()
        start()
    }

    private func handle(_ event: NSEvent) {
        eventCount += 1
        let keyCode = event.keyCode
        let type = event.type

        switch type {
        case .keyDown:
            // Key held & auto-repeat produces consecutive keyDowns; flag repeats.
            if let prev = keyDownTimestamps[keyCode], Date().timeIntervalSince(prev) < 0.5 {
                repeatedKeys.insert(keyCode)
            }
            keyDownTimestamps[keyCode] = Date()
            keyDownCounts[keyCode, default: 0] += 1
            pressed.insert(keyCode)
            if layoutKeyCodes.contains(keyCode) {
                markCompleted(keyCode)
            }
        case .keyUp:
            pressed.remove(keyCode)
            stuckKeys.remove(keyCode)
            if let count = keyDownCounts[keyCode] {
                keyDownCounts[keyCode] = max(0, count - 1)
                if count <= 1 { keyDownCounts.removeValue(forKey: keyCode) }
            }
        case .flagsChanged:
            // Modifiers arrive as flagsChanged. A "pressed" modifier has its
            // flag set in event.modifierFlags.
            let modifierCodes: [(UInt16, NSEvent.ModifierFlags)] = [
                (56, .shift), (60, .shift),
                (59, .control), (62, .control),
                (58, .option), (61, .option),
                (55, .command), (54, .command),
                (57, .capsLock),
            ]
            for (code, flag) in modifierCodes {
                if layoutKeyCodes.contains(code) {
                    if event.modifierFlags.contains(flag) {
                        pressed.insert(code)
                        markCompleted(code)
                    } else {
                        pressed.remove(code)
                    }
                }
            }
        default:
            break
        }
    }

    private func markCompleted(_ keyCode: UInt16) {
        completed.insert(keyCode)
    }

    /// Flags layout keys that have been physically held down (keyDown with no
    /// matching keyUp) past the stuck threshold — the definitive stuck-key signal.
    private func detectStuckKeys() {
        let now = Date()
        for (code, pressedAt) in keyDownTimestamps {
            guard layoutKeyCodes.contains(code), pressed.contains(code),
                  now.timeIntervalSince(pressedAt) >= stuckThreshold else { continue }
            stuckKeys.insert(code)
        }
    }

    /// Number of distinct layout keys not yet hit (excluding modifiers which
    /// may be absent from some boards and are flagged instead).
    public func untestedKeys(excludeModifiers: Bool = true) -> Set<UInt16> {
        var expected = layoutKeyCodes
        if excludeModifiers {
            expected.subtract([56, 60, 59, 62, 58, 61, 55, 54, 57])
        }
        return expected.subtracting(completed)
    }
}

/// Universal positional keyboard layout. Every physical key occupies a real
/// (row, column) slot so the on-screen view mirrors the physical board. Text
/// key labels are resolved from the CURRENT macOS keyboard layout (via the
/// public Carbon UCKeyTranslate API), so the test works on any language /
/// region / ANSI or ISO board. Special/utility keys keep curated universal
/// labels. Nothing here requires Accessibility or other permissions.
public enum KeyboardLayout: Sendable {
    private static let keyboard = SystemKeyboard()

    public static func universal() -> [KeyboardKey] {
        var keys: [KeyboardKey] = []

        func add(_ code: UInt16, _ label: String, _ kind: KeyboardKey.Kind,
                 _ row: Int, _ col: Double, _ width: Double = 1) {
            let resolved = kind == .key ? (keyboard.glyph(for: code) ?? "") : ""
            keys.append(KeyboardKey(keyCode: code,
                                    label: resolved.isEmpty ? label : resolved,
                                    kind: kind, row: row, column: col, width: width))
        }

        // Function row
        add(122, "F1", .utility, 0, 0); add(120, "F2", .utility, 0, 1)
        add(99, "F3", .utility, 0, 2); add(118, "F4", .utility, 0, 3)
        add(96, "F5", .utility, 0, 5); add(97, "F6", .utility, 0, 6)
        add(98, "F7", .utility, 0, 7); add(100, "F8", .utility, 0, 8)
        add(101, "F9", .utility, 0, 10); add(109, "F10", .utility, 0, 11)
        add(103, "F11", .utility, 0, 12); add(111, "F12", .utility, 0, 13)

        // Number / symbol row
        add(50, "`", .key, 1, 0)
        add(18, "1", .key, 1, 1); add(19, "2", .key, 1, 2); add(20, "3", .key, 1, 3)
        add(21, "4", .key, 1, 4); add(23, "5", .key, 1, 5); add(22, "6", .key, 1, 6)
        add(26, "7", .key, 1, 7); add(28, "8", .key, 1, 8); add(25, "9", .key, 1, 9)
        add(29, "0", .key, 1, 10); add(27, "-", .key, 1, 11); add(24, "=", .key, 1, 12)
        add(51, "⌫", .utility, 1, 13, 2)

        // QWERTY row
        add(48, "⇥", .utility, 2, 0, 1.5)
        add(12, "Q", .key, 2, 1.5); add(13, "W", .key, 2, 2.5); add(14, "E", .key, 2, 3.5)
        add(15, "R", .key, 2, 4.5); add(17, "T", .key, 2, 5.5); add(16, "Y", .key, 2, 6.5)
        add(32, "U", .key, 2, 7.5); add(34, "I", .key, 2, 8.5); add(31, "O", .key, 2, 9.5)
        add(35, "P", .key, 2, 10.5); add(33, "[", .key, 2, 11.5); add(30, "]", .key, 2, 12.5)
        add(42, "\\", .key, 2, 13.5)

        // ASDF row
        add(57, "⇪", .modifier, 3, 0, 1.75)
        add(0, "A", .key, 3, 1.75); add(1, "S", .key, 3, 2.75); add(2, "D", .key, 3, 3.75)
        add(3, "F", .key, 3, 4.75); add(5, "G", .key, 3, 5.75); add(4, "H", .key, 3, 6.75)
        add(38, "J", .key, 3, 7.75); add(40, "K", .key, 3, 8.75); add(37, "L", .key, 3, 9.75)
        add(41, ";", .key, 3, 10.75); add(39, "'", .key, 3, 11.75)
        add(36, "⏎", .utility, 3, 12.75, 2.25)

        // ZXCV row — ANSI vs ISO-aware
        let iso = keyboard.isISO
        add(56, "⇧", .modifier, 4, 0, iso ? 1.75 : 2.25)
        if iso { add(10, "§/±", .key, 4, 1.75) }
        let zCol = iso ? 2.75 : 2.25
        add(6, "Z", .key, 4, zCol); add(7, "X", .key, 4, zCol + 1)
        add(8, "C", .key, 4, zCol + 2); add(9, "V", .key, 4, zCol + 3)
        add(11, "B", .key, 4, zCol + 4); add(45, "N", .key, 4, zCol + 5)
        add(46, "M", .key, 4, zCol + 6); add(43, ",", .key, 4, zCol + 7)
        add(47, ".", .key, 4, zCol + 8); add(44, "/", .key, 4, zCol + 9)
        add(60, "⇧", .modifier, 4, 13.25, 1.75)

        // Modifier + bottom row (arrow cluster sits on rows 6-7 below)
        add(59, "⌃", .modifier, 5, 0); add(58, "⌥", .modifier, 5, 1)
        add(55, "⌘", .modifier, 5, 2); add(49, "Space", .space, 5, 3, 6)
        add(54, "⌘", .modifier, 5, 9); add(61, "⌥", .modifier, 5, 10)
        add(62, "⌃", .modifier, 5, 11); add(63, "fn", .fn, 5, 12)

        // Utility + arrow cluster: Home/PageUp above End/PageDown, ↑ above ← ↓ →,
        // forward delete on the far right.
        add(115, "Home", .utility, 6, 12, 0.9); add(116, "PageUp", .utility, 6, 12.9, 0.9)
        add(126, "↑", .arrow, 6, 13.9)
        add(119, "End", .utility, 7, 12, 0.9); add(121, "PageDown", .utility, 7, 12.9, 0.9)
        add(123, "←", .arrow, 7, 13.9); add(125, "↓", .arrow, 7, 14.9)
        add(124, "→", .arrow, 7, 15.9); add(117, "⌦", .utility, 7, 16.9)

        return keys
    }

    /// Deprecated ANSI-only snapshot; replaced by `universal()`.
    @available(*, deprecated, message: "Use KeyboardLayout.universal()")
    public static let standard: [KeyboardKey] = universal()

    /// Number of columns in the widest row (used for consistent key sizing).
    public static let columnCount = 18
}

/// Resolves a virtual keyCode to the character it produces under the CURRENT
/// keyboard layout using the public Carbon text-input API. Never injects input.
public struct SystemKeyboard: Sendable {
    private let layoutData: Data?
    public let isISO: Bool

    public init() {
        let layoutType = KBGetLayoutType(Int16(LMGetKbdType()))
        isISO = layoutType == kKeyboardISO || layoutType == kKeyboardJIS

        var data: Data?
        if let source = TISCopyCurrentKeyboardLayoutInputSource()?.takeRetainedValue(),
           let prop = TISGetInputSourceProperty(source, kTISPropertyUnicodeKeyLayoutData) {
            let cfData = Unmanaged<CFData>.fromOpaque(prop).takeUnretainedValue()
            data = CFDataGetBytePtr(cfData).map {
                Data(bytes: $0, count: CFDataGetLength(cfData))
            }
        }
        layoutData = data
    }

    /// Primary (unshifted) character produced by `keyCode`, or nil when the key
    /// is not a text-producing key under the active layout.
    public func glyph(for keyCode: UInt16) -> String? {
        guard let layoutData else { return nil }
        return layoutData.withUnsafeBytes { raw -> String? in
            guard let layout = raw.bindMemory(to: UCKeyboardLayout.self).baseAddress else { return nil }
            var deadKeyState = UInt32(0)
            var length = 0
            var buffer = [UniChar](repeating: 0, count: 4)
            let status = UCKeyTranslate(layout,
                                        keyCode,
                                        UInt16(kUCKeyActionDisplay),
                                        0,
                                        UInt32(LMGetKbdType()),
                                        OptionBits(kUCKeyTranslateNoDeadKeysBit),
                                        &deadKeyState,
                                        buffer.count,
                                        &length,
                                        &buffer)
            guard status == noErr, length > 0 else { return nil }
            return String(utf16CodeUnits: buffer, count: length)
        }
    }
}