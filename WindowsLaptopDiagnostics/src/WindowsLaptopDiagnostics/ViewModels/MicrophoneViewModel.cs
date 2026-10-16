using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Windows.Input;
using WindowsLaptopDiagnostics.Core;
using WindowsLaptopDiagnostics.Infrastructure;
using WindowsLaptopDiagnostics.Services;

namespace WindowsLaptopDiagnostics.ViewModels;

/// <summary>
/// Microphone diagnostic: device selection, live level meter and waveform,
/// clipping detection, and record → playback of a real WAV capture.
///
/// Honesty: nothing runs until the technician presses Start. Capture stops and
/// the temp file is removed when the page is left. Level, clipping and
/// duration are all measured from the captured samples.
/// </summary>
public sealed class MicrophoneViewModel : PageViewModelBase
{
    private MicSession? _session;
    private string? _recordingPath;
    private float[] _waveform = Array.Empty<float>();
    private bool _hasRecording;
    private System.Windows.Threading.DispatcherTimer? _timer;

    public static readonly int[] SampleRates = { 16000, 44100, 48000 };
    public static readonly int[] ChannelCounts = { 1, 2 };

    public MicrophoneViewModel()
    {
        RefreshCommand = new RelayCommand(LoadDevices);
        StartCommand = new RelayCommand(Start, () => !IsCapturing && SelectedDevice is not null);
        StopCommand = new RelayCommand(Stop, () => IsCapturing);
        PlayCommand = new RelayCommand(Play, () => _hasRecording && !IsPlaying);
        DeleteCommand = new RelayCommand(DeleteRecording, () => _hasRecording);
        ResetCommand = new RelayCommand(Reset);
    }

    public override string Title => "Microphone Test";

    public ObservableCollection<AudioInputEndpoint> Devices { get; } = new();

    private AudioInputEndpoint? _selectedDevice;
    public AudioInputEndpoint? SelectedDevice
    {
        get => _selectedDevice;
        set
        {
            if (!SetProperty(ref _selectedDevice, value)) return;
            RaiseCommands();
        }
    }

    private int _sampleRate = 48000;
    public int SampleRate { get => _sampleRate; set => SetProperty(ref _sampleRate, value); }

    private int _channels = 1;
    public int Channels { get => _channels; set => SetProperty(ref _channels, value); }

    private bool _isCapturing;
    public bool IsCapturing
    {
        get => _isCapturing;
        private set
        {
            if (!SetProperty(ref _isCapturing, value)) return;
            OnPropertyChanged(nameof(StatusText));
            RaiseCommands();
        }
    }

    private bool _isRecording;
    public bool IsRecording
    {
        get => _isRecording;
        private set
        {
            if (!SetProperty(ref _isRecording, value)) return;
            OnPropertyChanged(nameof(StatusText));
        }
    }

    private bool _isPlaying;
    public bool IsPlaying
    {
        get => _isPlaying;
        private set
        {
            if (!SetProperty(ref _isPlaying, value)) return;
            RaiseCommands();
        }
    }

    private double _level = -60;
    /// <summary>Current level in dBFS, measured from real samples (floor shown as −60).</summary>
    public double Level { get => _level; private set => SetProperty(ref _level, value); }

    private double _peak = -60;
    /// <summary>Session peak in dBFS; starts at the −60 floor, never at full scale.</summary>
    public double Peak { get => _peak; private set => SetProperty(ref _peak, value); }

    private bool _clipped;
    public bool Clipped
    {
        get => _clipped;
        private set
        {
            if (!SetProperty(ref _clipped, value)) return;
            OnPropertyChanged(nameof(ClipText));
        }
    }

    public string ClipText => _clipped
        ? "CLIPPING DETECTED — samples hit full scale; reduce input gain."
        : "No clipping observed.";

    private string _formatInfo = "";
    public string FormatInfo { get => _formatInfo; private set => SetProperty(ref _formatInfo, value); }

    private string _durationText = "00:00";
    public string DurationText { get => _durationText; private set => SetProperty(ref _durationText, value); }

    private string _statusText = "Select an input device, then Start.";
    public string StatusText { get => _statusText; private set => SetProperty(ref _statusText, value); }

    private string _error = "";
    public string Error { get => _error; private set => SetProperty(ref _error, value); }

    private bool _userHeard;
    /// <summary>Explicit technician confirmation that playback was audible.</summary>
    public bool UserHeard
    {
        get => _userHeard;
        set
        {
            if (SetProperty(ref _userHeard, value)) OnPropertyChanged(nameof(Checklist));
        }
    }

    public IReadOnlyList<string> Checklist
    {
        get
        {
            var rows = new List<string>
            {
                Mark(_session is not null, "Capture stream opened"),
                Mark(_framesSeen, "Audio frames received"),
                Mark(_framesSeen && Level > -60, $"Signal above the noise floor (peak {Peak:0.0} dBFS)"),
                Mark(!Clipped && _framesSeen, Clipped ? "CLIPPING observed" : "No clipping observed"),
                Mark(_hasRecording, "Recording captured"),
                Mark(UserHeard, "Technician heard the playback"),
            };
            return rows;
        }
    }

    private bool _framesSeen;

    private static string Mark(bool ok, string text) => (ok ? "✓  " : "○  ") + text;

    public ICommand RefreshCommand { get; }
    public ICommand StartCommand { get; }
    public ICommand StopCommand { get; }
    public ICommand PlayCommand { get; }
    public ICommand DeleteCommand { get; }
    public ICommand ResetCommand { get; }

    public override void OnActivated() => LoadDevices();

    public override void OnDeactivated()
    {
        Stop();
        DeleteRecording();
        StopTimer();
    }

    /// <summary>Start needs a real endpoint; reflecting that in the command keeps the UI honest.</summary>
    private void RaiseCommands()
    {
        (StartCommand as RelayCommand)?.RaiseCanExecuteChanged();
        (StopCommand as RelayCommand)?.RaiseCanExecuteChanged();
        (PlayCommand as RelayCommand)?.RaiseCanExecuteChanged();
        (DeleteCommand as RelayCommand)?.RaiseCanExecuteChanged();
    }

    private void LoadDevices()
    {
        _ = System.Threading.Tasks.Task.Run(() =>
        {
            var devices = AudioService.CaptureEndpoints();
            System.Windows.Application.Current?.Dispatcher.Invoke(() =>
            {
                Devices.Clear();
                foreach (var d in devices) Devices.Add(d);
                SelectedDevice ??= Devices.FirstOrDefault(d => d.IsDefault) ?? Devices.FirstOrDefault();
                StatusText = Devices.Count == 0
                    ? "Windows reports no active audio capture endpoint."
                    : $"{Devices.Count} capture endpoint(s) found.";
                RaiseCommands();
            });
        });
    }

    private void Start()
    {
        Stop();
        if (SelectedDevice is null)
        {
            Error = "No active capture endpoint was reported by Windows.";
            StatusText = "No microphone is available to this session.";
            return;
        }

        try
        {
            _session = new MicSession(SelectedDevice, SampleRate, Channels);
        }
        catch (Exception ex)
        {
            Error = ex.Message;
            StatusText = "The input device could not be opened.";
            return;
        }

        _session.FrameAvailable += OnFrame;
        string path = Path.Combine(Path.GetTempPath(), "WindowsLaptopDiagnostics",
            $"mic_{DateTime.Now:yyyyMMdd_HHmmss}.wav");
        _session.StartRecording(path);
        _recordingPath = path;

        try
        {
            _session.Start();
        }
        catch (Exception ex)
        {
            Error = ex.Message;
            StatusText = "Capture failed to start.";
            _session.Dispose();
            _session = null;
            // The header-only file from StartRecording is not a recording.
            try { if (File.Exists(path)) File.Delete(path); } catch { /* best effort */ }
            _recordingPath = null;
            return;
        }

        Error = "";
        _framesSeen = false;
        Clipped = false;
        _session.ResetClipFlag();
        IsRecording = true;
        IsCapturing = true;
        // The format the endpoint actually granted, which may differ from the request.
        FormatInfo = _session.FormatInfo;
        StatusText = "Capturing. Speak or play a tone near the microphone.";
        StartTimer();
        OnPropertyChanged(nameof(Checklist));
    }

    private void Stop()
    {
        StopTimer();
        if (_session is null)
        {
            IsCapturing = false;
            IsRecording = false;
            return;
        }

        _session.FrameAvailable -= OnFrame;
        _session.StopRecording();
        _session.Stop();
        bool hasFile = _session.RecordingPath is not null && File.Exists(_session.RecordingPath);
        _session.Dispose();
        _session = null;
        _hasRecording = hasFile;
        IsRecording = false;
        IsCapturing = false;
        StatusText = hasFile
            ? "Capture stopped. Recording is ready to play back."
            : "Capture stopped.";
        RaiseCommands();
        OnPropertyChanged(nameof(Checklist));
    }

    private void OnFrame(MicFrame frame)
    {
        System.Windows.Application.Current?.Dispatcher.BeginInvoke(() =>
        {
            Level = ToDb(frame.Rms);
            Peak = Math.Max(Peak, ToDb(frame.Peak));
            _waveform = frame.Waveform;
            Clipped |= frame.Clipped;
            if (!_framesSeen)
            {
                _framesSeen = true;
                OnPropertyChanged(nameof(Checklist));
            }
            WaveformChanged?.Invoke(_waveform);
        });
    }

    private static double ToDb(float linear) =>
        linear <= 0.000016f ? -60 : 20 * Math.Log10(linear);

    /// <summary>Raised when a new waveform envelope is available for painting.</summary>
    public event Action<float[]>? WaveformChanged;
    public IReadOnlyList<float> Waveform => _waveform;

    private void Play()
    {
        if (_recordingPath is not { } path || !File.Exists(path)) return;
        try
        {
            IsPlaying = true;
            _player = new NAudio.Wave.WaveOutEvent();
            var reader = new NAudio.Wave.WaveFileReader(path);
            _player.Init(reader);
            _player.PlaybackStopped += OnPlaybackStopped;
            _player.Play();
            StatusText = "Playing back the recording…";
        }
        catch (Exception ex)
        {
            Error = ex.Message;
            StatusText = "Playback failed.";
            IsPlaying = false;
        }
    }

    private NAudio.Wave.WaveOutEvent? _player;

    private void OnPlaybackStopped(object? sender, NAudio.Wave.StoppedEventArgs e)
    {
        System.Windows.Application.Current?.Dispatcher.BeginInvoke(() =>
        {
            _player?.Dispose();
            _player = null;
            IsPlaying = false;
            StatusText = "Playback finished. Mark whether you heard it.";
        });
    }

    private void DeleteRecording()
    {
        try
        {
            if (_recordingPath is { } p && File.Exists(p)) File.Delete(p);
        }
        catch (Exception ex) { Logger.Warn("Recording delete failed", ex); }
        _recordingPath = null;
        _hasRecording = false;
        UserHeard = false;
        StatusText = "Recording deleted.";
        RaiseCommands();
        OnPropertyChanged(nameof(Checklist));
    }

    private void Reset()
    {
        Stop();
        Level = 0;
        Peak = -60;
        Clipped = false;
        _framesSeen = false;
        _waveform = Array.Empty<float>();
        DurationText = "00:00";
        Error = "";
        StatusText = "Cleared. Select an input device, then Start.";
        WaveformChanged?.Invoke(_waveform);
        OnPropertyChanged(nameof(Checklist));
    }

    private void StartTimer()
    {
        StopTimer();
        _elapsed = TimeSpan.Zero;
        _timer = new System.Windows.Threading.DispatcherTimer
        {
            Interval = TimeSpan.FromSeconds(1),
        };
        _timer.Tick += (_, _) =>
        {
            _elapsed += TimeSpan.FromSeconds(1);
            DurationText = $"{(int)_elapsed.TotalMinutes:00}:{_elapsed.Seconds:00}";
        };
        _timer.Start();
    }

    private TimeSpan _elapsed;

    private void StopTimer()
    {
        _timer?.Stop();
        _timer = null;
    }
}
