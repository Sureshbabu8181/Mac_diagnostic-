using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using WindowsLaptopDiagnostics.ViewModels;

namespace WindowsLaptopDiagnostics.Views;

/// <summary>
/// Keyboard test view.
///
/// Hooks PreviewKeyDown / PreviewKeyUp on the owning Window ONLY while this
/// page is loaded, so no key is observed outside the active diagnostic.
/// Only the Key identity is forwarded — never text or characters.
/// </summary>
public partial class KeyboardView : UserControl
{
    private KeyboardViewModel? _vm;
    private Window? _hookedWindow;

    public KeyboardView()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        if (DataContext is not KeyboardViewModel vm || ReferenceEquals(_vm, vm)) return;

        if (_vm is not null) Detach();

        _vm = vm;
        _vm.IsMonitoring = true;

        _hookedWindow = Window.GetWindow(this);
        if (_hookedWindow is not null)
        {
            _hookedWindow.PreviewKeyDown += HandleKeyDown;
            _hookedWindow.PreviewKeyUp += HandleKeyUp;
            _hookedWindow.LostKeyboardFocus += HandleFocusLost;
        }
        _vm.FocusWarning = false;
    }

    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        Detach();
    }

    private void Detach()
    {
        if (_hookedWindow is not null)
        {
            _hookedWindow.PreviewKeyDown -= HandleKeyDown;
            _hookedWindow.PreviewKeyUp -= HandleKeyUp;
            _hookedWindow.LostKeyboardFocus -= HandleFocusLost;
            _hookedWindow = null;
        }
        if (_vm is not null)
        {
            // Stop monitoring and release any pressed visuals on page exit.
            _vm.IsMonitoring = false;
            _vm = null;
        }
    }

    private void HandleKeyDown(object sender, KeyEventArgs e)
    {
        if (_vm is null || !_vm.IsMonitoring) return;

        // Never observe keys typed into text entry (e.g. the sidebar filter) —
        // recording those would capture typed characters.
        if (IsTextInput(e.OriginalSource as DependencyObject)) return;

        // Do not mark keys while modifiers are held for shell shortcuts
        // (Win combos are consumed by the shell anyway and never arrive).
        _vm.OnKeyDown(e.Key, e.IsRepeat);
    }

    private void HandleKeyUp(object sender, KeyEventArgs e)
    {
        if (_vm is null || !_vm.IsMonitoring) return;
        if (IsTextInput(e.OriginalSource as DependencyObject)) return;
        _vm.OnKeyUp(e.Key);
    }

    private void HandleFocusLost(object sender, KeyboardFocusChangedEventArgs e)
    {
        // Keyboard focus left the window: the OS will not deliver matching
        // key-ups, so clear pressed state to avoid stuck keys.
        _vm?.ReleaseAll();
    }

    private static bool IsTextInput(DependencyObject? o)
    {
        while (o is not null)
        {
            if (o is TextBoxBase or ComboBox) return true;
            o = VisualTreeHelper.GetParent(o) is DependencyObject p ? p : null;
        }
        return false;
    }
}
