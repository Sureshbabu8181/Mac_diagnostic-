using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;
using WindowsLaptopDiagnostics.ViewModels;

namespace WindowsLaptopDiagnostics.Views;

/// <summary>
/// GPU stress view. Hosts the rendering workload the view model controls: a
/// dense field of moving primitives drawn through WPF's hardware-accelerated
/// composition path. Start/Stop is driven entirely by the view model's
/// <see cref="GpuStressViewModel.WorkloadChanged"/> event, and every handler is
/// attached only while the page is loaded.
/// </summary>
public partial class GpuStressView : UserControl
{
    private const int ParticleCount = 400;

    private readonly List<Particle> _particles = new();
    private readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromMilliseconds(16) };
    private Canvas? _surface;
    private GpuStressViewModel? _vm;

    private sealed class Particle
    {
        public Shape Shape = null!;
        public double X;
        public double Y;
        public double Vx;
        public double Vy;
    }

    public GpuStressView()
    {
        InitializeComponent();
        _timer.Tick += OnTick;
        Loaded += OnLoadedUi;
        Unloaded += OnUnloadedUi;
    }

    private void OnLoadedUi(object sender, RoutedEventArgs e)
    {
        // RenderSurface is a named element in this view's XAML, so the partial
        // class field is available directly; the FindName fallback is defensive.
        _surface ??= RenderSurface;
        if (DataContext is GpuStressViewModel vm)
        {
            if (!ReferenceEquals(_vm, vm))
            {
                if (_vm is not null) _vm.WorkloadChanged -= OnWorkloadChanged;
                _vm = vm;
                _vm.WorkloadChanged += OnWorkloadChanged;
            }
            _vm.OnActivated();
        }
    }

    private void OnUnloadedUi(object sender, RoutedEventArgs e)
    {
        StopWorkload();
        if (_vm is not null)
        {
            _vm.WorkloadChanged -= OnWorkloadChanged;
            _vm.OnDeactivated();
            _vm = null;
        }
        if (_surface is not null) _surface.Children.Clear();
        _particles.Clear();
    }

    private void OnWorkloadChanged(bool active, int durationSeconds)
    {
        if (active) StartWorkload();
        else StopWorkload();
    }

    private void StartWorkload()
    {
        if (_surface is null) return;
        _surface.Children.Clear();
        _particles.Clear();

        var rng = new Random(12345);
        var palette = new[]
        {
            Color.FromRgb(0x22, 0xD3, 0xEE),
            Color.FromRgb(0x38, 0xB8, 0xDF),
            Color.FromRgb(0x2D, 0xD4, 0xBF),
            Color.FromRgb(0x60, 0xA5, 0xFA),
        };

        for (int i = 0; i < ParticleCount; i++)
        {
            double size = 3 + rng.NextDouble() * 7;
            var p = new Particle
            {
                Shape = new Ellipse
                {
                    Width = size,
                    Height = size,
                    Fill = new SolidColorBrush(palette[rng.Next(palette.Length)]),
                    Opacity = 0.75,
                },
                X = rng.NextDouble() * 800,
                Y = rng.NextDouble() * 500,
                Vx = (rng.NextDouble() - 0.5) * 9,
                Vy = (rng.NextDouble() - 0.5) * 9,
            };
            _particles.Add(p);
            _surface.Children.Add(p.Shape);
        }
        _timer.Start();
    }

    private void StopWorkload()
    {
        _timer.Stop();
        if (_surface is not null) _surface.Children.Clear();
        _particles.Clear();
    }

    private void OnTick(object? sender, EventArgs e)
    {
        if (_surface is null) return;
        double w = _surface.ActualWidth;
        double h = _surface.ActualHeight;
        if (w <= 0 || h <= 0) return;

        // Move, bounce off the edges, and redraw each primitive. This is the
        // composition work that loads the GPU; the utilisation it produces is
        // measured by the view model from Windows counters, not assumed here.
        foreach (var p in _particles)
        {
            p.X += p.Vx;
            p.Y += p.Vy;
            if (p.X < 0 || p.X > w) { p.Vx = -p.Vx; p.X = Math.Clamp(p.X, 0, w); }
            if (p.Y < 0 || p.Y > h) { p.Vy = -p.Vy; p.Y = Math.Clamp(p.Y, 0, h); }
            Canvas.SetLeft(p.Shape, p.X);
            Canvas.SetTop(p.Shape, p.Y);
        }
    }
}
