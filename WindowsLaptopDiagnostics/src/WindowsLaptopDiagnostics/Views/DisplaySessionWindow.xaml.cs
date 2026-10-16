using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using WindowsLaptopDiagnostics.ViewModels;

namespace WindowsLaptopDiagnostics.Views;

/// <summary>
/// Full-screen display pattern session.
///
/// Occupies the target display, paints the selected pattern, and shows a
/// translucent overlay that auto-hides after inactivity (reappears on pointer
/// or key activity). Esc exits and restores the previous window state.
/// </summary>
public partial class DisplaySessionWindow : Window
{
    private readonly DisplayViewModel _vm;
    private readonly DispatcherTimer _hideTimer;
    private bool _overlayVisible = true;
    private bool _paused;
    private Rect _savedBounds;
    private WindowState _savedState;
    private WindowStyle _savedStyle;

    public DisplaySessionWindow(DisplayViewModel vm)
    {
        _vm = vm;
        InitializeComponent();

        _hideTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };
        _hideTimer.Tick += (_, _) => HideOverlay();
    }

    // ------------------------------------------------------------------ //
    // Full-screen placement on the target display
    // ------------------------------------------------------------------ //

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        // Save the caller's window state so we can restore it on exit.
        var parent = Application.Current.MainWindow;
        if (parent is not null)
        {
            _savedState = parent.WindowState;
            _savedStyle = parent.WindowStyle;
            _savedBounds = new Rect(parent.Left, parent.Top, parent.Width, parent.Height);
        }

        PlaceOnTargetDisplay();
        Focus();
        Keyboard.Focus(this);
        ShowOverlay();
        Render();
    }

    private void PlaceOnTargetDisplay()
    {
        var head = _vm.SelectedDisplay;
        if (head is null || head.Width <= 0 || head.Height <= 0)
        {
            // No usable geometry: fall back to maximised on the current screen
            // rather than guessing a position.
            WindowState = WindowState.Maximized;
            return;
        }

        // Position from EnumDisplaySettings dmPositionX/Y (virtual-desktop coords).
        WindowStartupLocation = WindowStartupLocation.Manual;
        WindowState = WindowState.Normal;
        Left = head.X;
        Top = head.Y;
        Width = head.Width;
        Height = head.Height;
    }

    private void RestoreParent()
    {
        var parent = Application.Current.MainWindow;
        if (parent is null) return;
        parent.WindowStyle = _savedStyle;
        parent.WindowState = _savedState;
        parent.Left = _savedBounds.Left;
        parent.Top = _savedBounds.Top;
        parent.Width = _savedBounds.Width;
        parent.Height = _savedBounds.Height;
    }

    // ------------------------------------------------------------------ //
    // Pattern rendering
    // ------------------------------------------------------------------ //

    private void Render()
    {
        var p = _vm.CurrentPattern;
        TitleText.Text = p.Name;
        SubText.Text = _vm.PatternPosition + "  ·  " + _vm.ModeSummary;
        HintText.Text = p.Description ?? "";
        PausedBadge.Visibility = _paused ? Visibility.Visible : Visibility.Collapsed;
        PauseBtn.Content = _paused ? "Resume" : "Pause";

        double w = ActualWidth, h = ActualHeight;
        if (w <= 0 || h <= 0) return;

        PatternCanvas.Children.Clear();
        Brush brush = p.Kind switch
        {
            "Gradient" => BuildGradient(p.Key),
            "Geometry" => Brushes.Black,
            "Uniform"  => BuildUniform(p.Key),
            _          => BuildSolid(p.Key),
        };

        var rect = new System.Windows.Shapes.Rectangle
        {
            Width = w,
            Height = h,
            Fill = brush,
        };
        PatternCanvas.Children.Add(rect);

        if (p.Key == "checker") DrawChecker(w, h);
        if (p.Key == "grid") DrawPixelGrid(w, h);
        if (p.Key == "corners") DrawCornerMarks(w, h);
        if (p.Key == "contrast") DrawContrastSteps(w, h);
    }

    private static Brush BuildSolid(string key) => key switch
    {
        "black"   => Brushes.Black,
        "white"   => Brushes.White,
        "red"     => new SolidColorBrush(Color.FromRgb(255, 0, 0)),
        "green"   => new SolidColorBrush(Color.FromRgb(0, 255, 0)),
        "blue"    => new SolidColorBrush(Color.FromRgb(0, 0, 255)),
        "gray50"  => new SolidColorBrush(Color.FromRgb(128, 128, 128)),
        "gray16"  => new SolidColorBrush(Color.FromRgb(16, 16, 16)),
        "gray235" => new SolidColorBrush(Color.FromRgb(235, 235, 235)),
        _         => Brushes.Black,
    };

    private static Brush BuildUniform(string key) =>
        key == "uniform"
            ? new SolidColorBrush(Color.FromRgb(180, 180, 180))
            : Brushes.Black;

    private static Brush BuildGradient(string key)
    {
        if (key == "rgbgrad")
        {
            // Each third ramps its own primary black -> full, so banding/steps
            // and dead subpixels are visible. Duplicate stops at the 1/3 and
            // 2/3 boundaries create hard edges (no cross-fade between primaries).
            var ramp = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(1, 0) };
            ramp.GradientStops.Add(new GradientStop(Colors.Black, 0.0));
            ramp.GradientStops.Add(new GradientStop(Colors.Red, 1.0 / 3.0));
            ramp.GradientStops.Add(new GradientStop(Colors.Black, 1.0 / 3.0));
            ramp.GradientStops.Add(new GradientStop(Colors.Green, 2.0 / 3.0));
            ramp.GradientStops.Add(new GradientStop(Colors.Black, 2.0 / 3.0));
            ramp.GradientStops.Add(new GradientStop(Colors.Blue, 1.0));
            return ramp;
        }

        // Grayscale ramp 0 -> 255
        var gray = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(1, 0) };
        gray.GradientStops.Add(new GradientStop(Color.FromRgb(0, 0, 0), 0.0));
        gray.GradientStops.Add(new GradientStop(Color.FromRgb(255, 255, 255), 1.0));
        return gray;
    }

    /// <summary>Create a rectangle positioned on the canvas (attached properties
    /// cannot be set in an object initializer).</summary>
    private System.Windows.Shapes.Rectangle MakeRect(
        double left, double top, double width, double height, Brush fill)
    {
        var r = new System.Windows.Shapes.Rectangle
        {
            Width = Math.Max(0, width),
            Height = Math.Max(0, height),
            Fill = fill,
        };
        System.Windows.Controls.Canvas.SetLeft(r, left);
        System.Windows.Controls.Canvas.SetTop(r, top);
        return r;
    }

    private void DrawChecker(double w, double h)
    {
        const int cell = 40;
        var light = new SolidColorBrush(Color.FromRgb(235, 235, 235));
        for (int y = 0, row = 0; y < h; y += cell, row++)
        {
            for (int x = 0, col = 0; x < w; x += cell, col++)
            {
                if ((row + col) % 2 != 0) continue;
                PatternCanvas.Children.Add(MakeRect(x, y, cell, cell, light));
            }
        }
    }

    private void DrawPixelGrid(double w, double h)
    {
        var lineBrush = new SolidColorBrush(Color.FromRgb(0, 255, 0));
        // Fine grid at 1px effective line weight where possible.
        for (int x = 0; x < w; x += 10)
            PatternCanvas.Children.Add(MakeRect(x, 0, 1, h, lineBrush));
        for (int y = 0; y < h; y += 10)
            PatternCanvas.Children.Add(MakeRect(0, y, w, 1, lineBrush));
        // Bold centre cross-hair for alignment
        var cross = new SolidColorBrush(Color.FromRgb(255, 0, 0));
        PatternCanvas.Children.Add(MakeRect(w / 2 - 1.5, 0, 3, h, cross));
        PatternCanvas.Children.Add(MakeRect(0, h / 2 - 1.5, w, 3, cross));
    }

    private void DrawCornerMarks(double w, double h)
    {
        var brush = new SolidColorBrush(Color.FromRgb(255, 255, 255));
        const double len = 60, th = 4, m = 20;

        void H(double x, double y, double width) =>
            PatternCanvas.Children.Add(MakeRect(x, y, width, th, brush));
        void V(double x, double y, double height) =>
            PatternCanvas.Children.Add(MakeRect(x, y, th, height, brush));

        H(m, m, len); V(m, m, len);
        H(w - m - len, m, len); V(w - m - th, m, len);
        H(m, h - m - th, len); V(m, h - m - len, len);
        H(w - m - len, h - m - th, len); V(w - m - th, h - m - len, len);
    }

    private void DrawContrastSteps(double w, double h)
    {
        const int steps = 16;
        double bandW = w / steps;
        for (int i = 0; i < steps; i++)
        {
            byte v = (byte)Math.Round(i * 255.0 / (steps - 1));
            PatternCanvas.Children.Add(
                MakeRect(i * bandW, 0, bandW + 1, h, new SolidColorBrush(Color.FromRgb(v, v, v))));
        }
    }

    // ------------------------------------------------------------------ //
    // Overlay auto-hide
    // ------------------------------------------------------------------ //

    private void ShowOverlay()
    {
        _overlayVisible = true;
        Overlay.Visibility = Visibility.Visible;
        HintBar.Visibility = Visibility.Visible;
        _hideTimer.Stop();
        _hideTimer.Start();
    }

    private void HideOverlay()
    {
        if (IsMouseOver) return;
        _overlayVisible = false;
        Overlay.Visibility = Visibility.Collapsed;
        HintBar.Visibility = Visibility.Collapsed;
        _hideTimer.Stop();
    }

    private void OnMouseMove(object sender, MouseEventArgs e)
    {
        if (!_overlayVisible) ShowOverlay();
        else
        {
            _hideTimer.Stop();
            _hideTimer.Start();
        }
    }

    private void OnOverlayEnter(object sender, MouseEventArgs e)
    {
        _hideTimer.Stop();
        Overlay.Opacity = 1.0;
    }

    private void OnOverlayLeave(object sender, MouseEventArgs e)
    {
        _hideTimer.Stop();
        _hideTimer.Start();
    }

    // ------------------------------------------------------------------ //
    // Input
    // ------------------------------------------------------------------ //

    private void OnKeyDown(object sender, KeyEventArgs e)
    {
        ShowOverlay();
        switch (e.Key)
        {
            case Key.Escape:
                e.Handled = true;
                ExitSession();
                break;
            case Key.Right:
            case Key.Down:
                e.Handled = true;
                _vm.Next();
                Render();
                break;
            case Key.Left:
            case Key.Up:
                e.Handled = true;
                _vm.Previous();
                Render();
                break;
            case Key.Space:
            case Key.P:
                e.Handled = true;
                TogglePause();
                break;
            case Key.R:
                e.Handled = true;
                Restart();
                break;
            case Key.Home:
                e.Handled = true;
                _vm.PatternIndex = 0;
                Render();
                break;
        }
    }

    private void OnKeyUp(object sender, KeyEventArgs e)
    {
        // Never leave a key visually stuck: always refresh overlay state.
        if (e.Key is Key.Escape or Key.Left or Key.Right or Key.Up or Key.Down or Key.Space or Key.P or Key.R)
            e.Handled = true;
    }

    private void TogglePause()
    {
        _paused = !_paused;
        _vm.Paused = _paused;
        PausedBadge.Visibility = _paused ? Visibility.Visible : Visibility.Collapsed;
        PauseBtn.Content = _paused ? "Resume" : "Pause";
    }

    private void Restart()
    {
        _vm.PatternIndex = 0;
        _paused = false;
        _vm.Paused = false;
        PausedBadge.Visibility = Visibility.Collapsed;
        PauseBtn.Content = "Pause";
        Render();
        ShowOverlay();
    }

    private void OnMouseLeftDown(object sender, MouseButtonEventArgs e)
    {
        ShowOverlay();
        if (Overlay.IsMouseOver) return;
        if (_paused) return;
        _vm.Next();
        Render();
    }

    private void OnMouseRightDown(object sender, MouseButtonEventArgs e)
    {
        ShowOverlay();
        if (_paused) return;
        _vm.Previous();
        Render();
    }

    private void OnPrev(object sender, RoutedEventArgs e) { ShowOverlay(); _vm.Previous(); Render(); }
    private void OnNext(object sender, RoutedEventArgs e) { ShowOverlay(); _vm.Next(); Render(); }
    private void OnPause(object sender, RoutedEventArgs e) { ShowOverlay(); TogglePause(); }
    private void OnRestart(object sender, RoutedEventArgs e) { Restart(); }
    private void OnExit(object sender, RoutedEventArgs e) { ExitSession(); }

    private void ExitSession()
    {
        _hideTimer.Stop();
        _vm.EndSession();
        Close();
    }

    private void OnClosed(object? sender, EventArgs e)
    {
        _hideTimer.Stop();
        _hideTimer.Tick -= (_, _) => { };
        RestoreParent();
        Application.Current.MainWindow?.Activate();
    }
}
