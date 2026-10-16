using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using WindowsLaptopDiagnostics.Infrastructure;
using WindowsLaptopDiagnostics.ViewModels;

namespace WindowsLaptopDiagnostics.Views;

/// <summary>
/// Display test setup/inventory view. DataContext is DisplayViewModel.
/// Opens the full-screen session window and tracks its run state.
/// </summary>
public partial class DisplayView : UserControl
{
    private DisplayViewModel? _vm;
    private DisplaySessionWindow? _session;

    public DisplayView()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        if (DataContext is not DisplayViewModel vm || ReferenceEquals(_vm, vm)) return;
        if (_vm is not null) _vm.SessionRequested -= OnSessionRequested;
        _vm = vm;
        _vm.SessionRequested += OnSessionRequested;
    }

    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        // Unsubscribe FIRST so a close we trigger cannot re-enter this page.
        if (_vm is not null)
        {
            _vm.SessionRequested -= OnSessionRequested;
            _vm = null;
        }

        // Close any live session. Its Closed handler null-guards the view model,
        // so closing after _vm is cleared is safe (no NullReferenceException).
        var live = _session;
        _session = null;
        if (live is not null && live.IsLoaded)
        {
            try { live.Close(); }
            catch { /* window may already be tearing down */ }
        }
    }

    private void OnSessionRequested() => OpenSession();

    private void OpenSession()
    {
        if (_vm is null) return;
        var vm = _vm;

        // Only one session at a time; close an existing one first.
        var existing = _session;
        _session = null;
        if (existing is not null && existing.IsLoaded)
        {
            try { existing.Close(); }
            catch { /* already closing */ }
        }

        vm.IsRunning = true;
        var session = new DisplaySessionWindow(vm);
        _session = session;

        // Capture `vm` in the closure (never the field) so this handler stays
        // correct even after this view is unloaded and _vm/_session are cleared.
        session.Closed += (_, _) =>
        {
            try { vm.IsRunning = false; }
            catch { /* view model already torn down */ }
            if (ReferenceEquals(_session, session)) _session = null;
        };

        session.Show();
    }
}
