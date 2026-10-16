using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using WindowsLaptopDiagnostics.ViewModels;

namespace WindowsLaptopDiagnostics.Views;

/// <summary>
/// Microphone test view. Paints the live waveform envelope and drives the
/// level meter; handlers are attached only while the page is loaded.
/// </summary>
public partial class MicrophoneView : UserControl
{
    private MicrophoneViewModel? _vm;

    public MicrophoneView()
    {
        InitializeComponent();
        Loaded += OnLoadedUi;
        Unloaded += OnUnloadedUi;
    }

    private void OnLoadedUi(object sender, RoutedEventArgs e)
    {
        if (DataContext is not MicrophoneViewModel vm || ReferenceEquals(_vm, vm)) return;
        if (_vm is not null) _vm.WaveformChanged -= PaintWaveform;
        _vm = vm;
        _vm.WaveformChanged += PaintWaveform;
        _vm.OnActivated();
        UpdateLevelBar();
    }

    private void OnUnloadedUi(object sender, RoutedEventArgs e)
    {
        if (_vm is not null)
        {
            _vm.WaveformChanged -= PaintWaveform;
            _vm.OnDeactivated();
            _vm = null;
        }
        WaveCanvas.Children.Clear();
        LevelBar.Width = 0;
    }

    protected override void OnRenderSizeChanged(SizeChangedInfo sizeInfo)
    {
        base.OnRenderSizeChanged(sizeInfo);
        if (_vm is not null)
        {
            UpdateLevelBar();
            PaintWaveform(_vm.Waveform);
        }
    }

    private void UpdateLevelBar()
    {
        if (_vm is null || LevelBar is null) return;
        double width = WaveSurface.ActualWidth;
        if (width <= 0) return;

        // Map −60…0 dBFS onto the meter width.
        double fraction = Math.Clamp((_vm.Level + 60) / 60.0, 0, 1);
        LevelBar.Width = width * fraction;
    }

    private void PaintWaveform(IReadOnlyList<float>? peaks)
    {
        if (WaveCanvas is null) return;
        WaveCanvas.Children.Clear();
        UpdateLevelBar();
        if (peaks is null || peaks.Count == 0) return;

        double w = WaveSurface.ActualWidth;
        double h = WaveSurface.ActualHeight;
        if (w <= 0 || h <= 0) return;

        // Centre line
        WaveCanvas.Children.Add(new Line
        {
            X1 = 0, X2 = w, Y1 = h / 2, Y2 = h / 2,
            Stroke = new SolidColorBrush(Color.FromArgb(0x40, 0x22, 0xD3, 0xEE)),
            StrokeThickness = 1,
        });

        double barWidth = Math.Max(1, w / peaks.Count);
        var fill = new SolidColorBrush(Color.FromRgb(0x22, 0xD3, 0xEE));
        for (int i = 0; i < peaks.Count; i++)
        {
            double amplitude = Math.Clamp(peaks[i], 0, 1);
            double barHeight = Math.Max(2, amplitude * (h - 8));
            var bar = new Rectangle
            {
                Width = Math.Max(1, barWidth - 1),
                Height = barHeight,
                Fill = fill,
                Opacity = 0.5 + 0.5 * amplitude,
            };
            Canvas.SetLeft(bar, i * barWidth);
            Canvas.SetTop(bar, (h - barHeight) / 2);
            WaveCanvas.Children.Add(bar);
        }
    }
}
