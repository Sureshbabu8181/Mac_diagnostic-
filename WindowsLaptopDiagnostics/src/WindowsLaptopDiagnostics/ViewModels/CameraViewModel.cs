using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using WindowsLaptopDiagnostics.Core;
using WindowsLaptopDiagnostics.Infrastructure;
using WindowsLaptopDiagnostics.Services;

namespace WindowsLaptopDiagnostics.ViewModels;

/// <summary>
/// Camera diagnostic: probes real capture devices, streams a live preview,
/// and reports frame count plus FPS measured from actual delivered frames.
///
/// Honesty: the measured FPS is computed from frames the device really
/// delivered over a 2-second window; the advertised FPS is shown separately
/// and never substituted for it. Access conflicts surface as errors.
/// </summary>
public sealed class CameraViewModel : PageViewModelBase
{
    private CameraSession? _session;
    private WriteableBitmap? _bitmap;
    private int _bitmapWidth;
    private int _bitmapHeight;

    public CameraViewModel()
    {
        ScanCommand = new RelayCommand(Scan);
        StartCommand = new RelayCommand(Start, () => !IsRunning && SelectedCamera is not null);
        StopCommand = new RelayCommand(Stop, () => IsRunning);
        RestartCommand = new RelayCommand(() => { Stop(); Start(); }, () => IsRunning);
        ResetCommand = new RelayCommand(Reset);
    }

    public override string Title => "Camera Test";

    public ObservableCollection<CameraProbe> Cameras { get; } = new();

    private CameraProbe? _selectedCamera;
    public CameraProbe? SelectedCamera
    {
        get => _selectedCamera;
        set
        {
            if (!SetProperty(ref _selectedCamera, value)) return;
            OnPropertyChanged(nameof(DeviceInfo));
            RaiseCommands();
        }
    }

    private bool _isRunning;
    public bool IsRunning
    {
        get => _isRunning;
        private set
        {
            if (!SetProperty(ref _isRunning, value)) return;
            OnPropertyChanged(nameof(StatusText));
            RaiseCommands();
        }
    }

    private long _frameCount;
    public long FrameCount { get => _frameCount; private set => SetProperty(ref _frameCount, value); }

    private double _measuredFps;
    /// <summary>Frames per second measured from real delivered frames.</summary>
    public double MeasuredFps { get => _measuredFps; private set => SetProperty(ref _measuredFps, value); }

    private string _actualResolution = "—";
    public string ActualResolution { get => _actualResolution; private set => SetProperty(ref _actualResolution, value); }

    private string _statusText = "Scan for cameras, then Start the preview.";
    public string StatusText { get => _statusText; private set => SetProperty(ref _statusText, value); }

    private string _error = "";
    public string Error { get => _error; private set => SetProperty(ref _error, value); }

    private bool _userConfirmed;
    /// <summary>Explicit technician confirmation that the picture was recognisable.</summary>
    public bool UserConfirmed
    {
        get => _userConfirmed;
        set
        {
            if (SetProperty(ref _userConfirmed, value)) OnPropertyChanged(nameof(Checklist));
        }
    }

    public ImageSource? Preview => _bitmap;

    public string DeviceInfo => SelectedCamera is null
        ? "No camera selected"
        : $"Backend {SelectedCamera.Backend} · advertised {SelectedCamera.Width}×{SelectedCamera.Height} @ {SelectedCamera.ReportedFps:0.#} fps" +
          (SelectedCamera.Error is null ? "" : $" · {SelectedCamera.Error}");

    public IReadOnlyList<string> Checklist => new[]
    {
        Mark(Cameras.Count > 0, $"Camera device(s) detected ({Cameras.Count})"),
        Mark(_session is not null, "Capture session opened"),
        Mark(FrameCount > 0, $"Frames delivered ({FrameCount})"),
        Mark(MeasuredFps > 0, $"Measured frame rate ({MeasuredFps:0.0} fps over the last window)"),
        Mark(_resolutionSeen, $"Actual capture resolution ({ActualResolution})"),
        Mark(UserConfirmed, "Technician confirmed a clear picture"),
    };

    private bool _resolutionSeen;
    private static string Mark(bool ok, string text) => (ok ? "✓  " : "○  ") + text;

    public ICommand ScanCommand { get; }
    public ICommand StartCommand { get; }
    public ICommand StopCommand { get; }
    public ICommand RestartCommand { get; }
    public ICommand ResetCommand { get; }

    public override void OnActivated()
    {
        if (Cameras.Count == 0) Scan();
    }

    public override void OnDeactivated() => Stop();

    /// <summary>Probe a small range of device indices with real open/close attempts.</summary>
    private void Scan()
    {
        StatusText = "Scanning for camera devices…";
        _ = Task.Run(() =>
        {
            var found = new List<CameraProbe>();
            for (int i = 0; i < 4; i++)
            {
                try
                {
                    // Constructing CameraSession opens the device; the using
                    // releases it again before the preview opens one for real.
                    using var probe = new CameraSession(i);
                    found.Add(new CameraProbe(i, probe.Backend, probe.Width, probe.Height, probe.ReportedFps, null));
                }
                catch (Exception ex)
                {
                    // Index i simply has no device — that is expected, not an error.
                    if (i == 0) Logger.Info($"Camera scan: {ex.Message}");
                }
            }
            Application.Current?.Dispatcher.Invoke(() =>
            {
                Cameras.Clear();
                foreach (var c in found) Cameras.Add(c);
                SelectedCamera ??= Cameras.FirstOrDefault();
                StatusText = Cameras.Count == 0
                    ? "No camera device could be opened. It may be in use, disabled, or absent."
                    : $"{Cameras.Count} camera device(s) opened successfully.";
                Error = "";
                OnPropertyChanged(nameof(Checklist));
                RaiseCommands();
            });
        });
    }

    private void Start()
    {
        if (SelectedCamera is null) return;
        Stop();
        try
        {
            _session = new CameraSession(SelectedCamera.Index);
        }
        catch (Exception ex)
        {
            Error = ex.Message;
            StatusText = "The camera could not be opened.";
            IsRunning = false;
            return;
        }

        _session.FrameAvailable += OnFrame;
        _session.FPSUpdated += OnFps;
        _session.Start();

        Error = "";
        FrameCount = 0;
        MeasuredFps = 0;
        _resolutionSeen = false;
        ActualResolution = "—";
        IsRunning = true;
        StatusText = "Preview running. Look at the picture and confirm below.";
        OnPropertyChanged(nameof(Checklist));
    }

    private void Stop()
    {
        if (_session is null)
        {
            IsRunning = false;
            return;
        }

        _session.FrameAvailable -= OnFrame;
        _session.FPSUpdated -= OnFps;
        var session = _session;
        _session = null;
        session.Dispose();

        IsRunning = false;
        if (session.LastError is not null)
        {
            Error = session.LastError;
            StatusText = "Capture ended with an error.";
        }
        else
        {
            StatusText = FrameCount > 0
                ? $"Stopped. {FrameCount} frames delivered."
                : "Stopped before any frame was delivered.";
        }
        OnPropertyChanged(nameof(Checklist));
    }

    private void OnFrame(byte[] pixels, int width, int height, int stride)
    {
        Application.Current?.Dispatcher.BeginInvoke(() =>
        {
            // Resolution is a property of the incoming frames themselves, so it
            // is refreshed on every shape change — including a restart where
            // the bitmap from the previous run is still cached.
            string resolution = $"{width}×{height}";
            if (ActualResolution != resolution)
            {
                ActualResolution = resolution;
                _resolutionSeen = true;
                OnPropertyChanged(nameof(Checklist));
            }

            if (_bitmap is null || _bitmapWidth != width || _bitmapHeight != height)
            {
                _bitmap = new WriteableBitmap(width, height, 96, 96, PixelFormats.Bgra32, null);
                _bitmapWidth = width;
                _bitmapHeight = height;
                OnPropertyChanged(nameof(Preview));
            }

            _bitmap!.Lock();
            try
            {
                _bitmap.WritePixels(new Int32Rect(0, 0, width, height), pixels, stride, 0);
            }
            finally
            {
                _bitmap.Unlock();
            }

            FrameCount = _session?.FrameCount ?? FrameCount;
            OnPropertyChanged(nameof(Preview));
            OnPropertyChanged(nameof(Checklist));
        });
    }

    private void OnFps(double fps) => Application.Current?.Dispatcher.BeginInvoke(() =>
    {
        MeasuredFps = fps;
        OnPropertyChanged(nameof(Checklist));
    });

    private void Reset()
    {
        Stop();
        FrameCount = 0;
        MeasuredFps = 0;
        _resolutionSeen = false;
        ActualResolution = "—";
        UserConfirmed = false;
        _bitmap = null;
        OnPropertyChanged(nameof(Preview));
        Error = "";
        StatusText = "Cleared. Scan for cameras, then Start.";
        OnPropertyChanged(nameof(Checklist));
    }

    private void RaiseCommands()
    {
        (StartCommand as RelayCommand)?.RaiseCanExecuteChanged();
        (StopCommand as RelayCommand)?.RaiseCanExecuteChanged();
        (RestartCommand as RelayCommand)?.RaiseCanExecuteChanged();
    }
}
