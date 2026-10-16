using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using WindowsLaptopDiagnostics.ViewModels;

namespace WindowsLaptopDiagnostics.Views;

/// <summary>
/// Touchpad/mouse test view. Forwards pointer events to the view model and
/// paints the movement trail. Events are only forwarded while this page is
/// loaded, so nothing is observed outside the active diagnostic.
/// </summary>
public partial class TouchpadView : UserControl
{
    private TouchpadViewModel? _vm;

    public TouchpadView()
    {
        InitializeComponent();
        Loaded += OnLoadedUi;
        Unloaded += OnUnloadedUi;
    }

    private void OnLoadedUi(object sender, RoutedEventArgs e)
    {
        UpdateMaxLabel();
        if (DataContext is not TouchpadViewModel vm || ReferenceEquals(_vm, vm)) return;
        if (_vm is not null) _vm.RedrawTrailRequested -= PaintTrail;
        _vm = vm;
        _vm.RedrawTrailRequested += PaintTrail;
        _vm.OnActivated();
    }

    private void UpdateMaxLabel()
    {
        MaxLabel.Text = $"{Surface.ActualWidth:F0},{Surface.ActualHeight:F0}";
    }

    protected override void OnRenderSizeChanged(SizeChangedInfo sizeInfo)
    {
        base.OnRenderSizeChanged(sizeInfo);
        if (MaxLabel is not null) UpdateMaxLabel();
    }

    private void OnUnloadedUi(object sender, RoutedEventArgs e)
    {
        if (_vm is not null)
        {
            _vm.RedrawTrailRequested -= PaintTrail;
            _vm.OnDeactivated();
            _vm = null;
        }
        TrailCanvas.Children.Clear();
    }

    private Point Local(MouseEventArgs e) => e.GetPosition(Surface);

    private void OnMouseMove(object sender, MouseEventArgs e)
    {
        if (_vm is null) return;
        _vm.OnPointerMove(Local(e), new Size(Surface.ActualWidth, Surface.ActualHeight));
    }

    private void OnLeftDown(object sender, MouseButtonEventArgs e)
    {
        Surface.CaptureMouse();
        _vm?.OnLeftDown(Local(e));
        e.Handled = true;
    }

    private void OnLeftUp(object sender, MouseButtonEventArgs e)
    {
        if (Surface.IsMouseCaptured) Surface.ReleaseMouseCapture();
        _vm?.OnLeftUp(Local(e));
        e.Handled = true;
    }

    private void OnRightDown(object sender, MouseButtonEventArgs e)
    {
        _vm?.OnRightClick(Local(e));
        e.Handled = true;
    }

    private void OnWheel(object sender, MouseWheelEventArgs e)
    {
        _vm?.OnWheel(e.Delta);
        e.Handled = true;
    }

    private void OnMouseLeave(object sender, MouseEventArgs e)
    {
        _vm?.OnPointerLeave();
    }

    /// <summary>Repaint the recorded trail as a polyline plus a current dot.</summary>
    private void PaintTrail()
    {
        if (_vm is null) return;
        TrailCanvas.Children.Clear();

        var pts = _vm.Trail;
        if (pts.Count >= 2)
        {
            var line = new Polyline
            {
                Stroke = new SolidColorBrush(Color.FromRgb(0x22, 0xD3, 0xEE)),
                StrokeThickness = 2,
                StrokeLineJoin = PenLineJoin.Round,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap = PenLineCap.Round,
                Opacity = 0.85,
            };
            foreach (var p in pts) line.Points.Add(p);
            TrailCanvas.Children.Add(line);
        }

        if (pts.Count > 0)
        {
            var last = pts[^1];
            var dot = new Ellipse
            {
                Width = 10,
                Height = 10,
                Fill = new SolidColorBrush(Color.FromRgb(0x67, 0xE8, 0xF9)),
            };
            Canvas.SetLeft(dot, last.X - 5);
            Canvas.SetTop(dot, last.Y - 5);
            TrailCanvas.Children.Add(dot);

            var ring = new Ellipse
            {
                Width = 22,
                Height = 22,
                Stroke = new SolidColorBrush(Color.FromRgb(0x22, 0xD3, 0xEE)),
                StrokeThickness = 1.5,
                Opacity = 0.6,
            };
            Canvas.SetLeft(ring, last.X - 11);
            Canvas.SetTop(ring, last.Y - 11);
            TrailCanvas.Children.Add(ring);
        }
    }
}
