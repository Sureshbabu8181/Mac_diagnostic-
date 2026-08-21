import SwiftUI

/// Environment flag coming from user Settings: test-page action buttons use an
/// accent-colored background (true) or a plain white/neutral background (false).
private struct AccentTestButtonsKey: EnvironmentKey {
    static let defaultValue = true
}

extension EnvironmentValues {
    var accentTestButtons: Bool {
        get { self[AccentTestButtonsKey.self] }
        set { self[AccentTestButtonsKey.self] = newValue }
    }
}

private struct AccentAwareButtonModifier: ViewModifier {
    @Environment(\.accentTestButtons) private var accentTestButtons

    func body(content: Content) -> some View {
        if accentTestButtons {
            content.buttonStyle(.borderedProminent)
        } else {
            content.buttonStyle(.bordered)
        }
    }
}

extension View {
    /// Applies the bordered-prominent (accent background) style for test-page
    /// action buttons, or the neutral bordered style, per the Settings toggle.
    func testActionButton() -> some View {
        modifier(AccentAwareButtonModifier())
    }
}