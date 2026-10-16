using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Windows.Input;
using WindowsLaptopDiagnostics.Core;
using WindowsLaptopDiagnostics.Infrastructure;
using WindowsLaptopDiagnostics.Services;

namespace WindowsLaptopDiagnostics.ViewModels;

/// <summary>
/// Speaker/headphone diagnostic: real endpoint enumeration, live system volume
/// and mute state, and channel-routed tones for left/right/stereo/mono.
///
/// Honesty: sending a tone proves the endpoint accepted a stream. A result is
/// only ever Passed when the technician confirms each route was actually
/// heard; silence or an untested route never becomes a pass.
/// </summary>
public sealed class SpeakersViewModel : PageViewModelBase
{
    private ToneSession? _session;

    public SpeakersViewModel()
    {
        RefreshCommand = new RelayCommand(LoadEndpoints);
        PlayCommand = new RelayCommand(Play, () => !IsPlaying && SelectedEndpoint is not null);
        StopCommand = new RelayCommand(Stop, () => IsPlaying);
        HeardCommand = new RelayCommand(() => Record(true));
        NotHeardCommand = new RelayCommand(() => Record(false));
        ResetCommand = new RelayCommand(Reset);
    }

    public override string Title => "Speakers & Headphones";

    public ObservableCollection<AudioEndpoint> Endpoints { get; } = new();
    public IReadOnlyList<ToneRoute> Routes { get; } = Enum.GetValues<ToneRoute>();

    private AudioEndpoint? _selectedEndpoint;
    public AudioEndpoint? SelectedEndpoint
    {
        get => _selectedEndpoint;
        set
        {
            if (!SetProperty(ref _selectedEndpoint, value)) return;
            OnPropertyChanged(nameof(DeviceInfo));
            OnPropertyChanged(nameof(RouteDescriptions));
            RaiseCommands();
        }
    }

    private ToneRoute _selectedRoute = ToneRoute.Left;
    public ToneRoute SelectedRoute
    {
        get => _selectedRoute;
        set
        {
            if (!SetProperty(ref _selectedRoute, value)) return;
            OnPropertyChanged(nameof(RouteDescriptions));
        }
    }

    private bool _isPlaying;
    public bool IsPlaying
    {
        get => _isPlaying;
        private set
        {
            if (!SetProperty(ref _isPlaying, value)) return;
            OnPropertyChanged(nameof(StatusText));
            RaiseCommands();
        }
    }

    private string _statusText = "Select an output endpoint, then play a route.";
    public string StatusText { get => _statusText; private set => SetProperty(ref _statusText, value); }

    private string _error = "";
    public string Error { get => _error; private set => SetProperty(ref _error, value); }

    public string DeviceInfo => SelectedEndpoint is null
        ? "No endpoint selected"
        : $"Volume {SelectedEndpoint.VolumeScalar * 100:0}%{(SelectedEndpoint.Muted ? "  (MUTED)" : "")}" +
          (SelectedEndpoint.IsDefault ? "  ·  Windows default" : "");

    /// <summary>Exactly what each selectable route sends, per the real device channel count.</summary>
    public IReadOnlyList<string> RouteDescriptions => Routes
        .Select(r => $"{r}: {AudioService.DescribeRoute(r, SelectedEndpoint?.Channels ?? 2)}")
        .ToList();

    private readonly Dictionary<ToneRoute, bool?> _results = new();

    /// <summary>Per-route observation. null = not tested yet; never assumed.</summary>
    public IReadOnlyList<string> Checklist
    {
        get
        {
            return Routes.Select(r =>
            {
                string state = _results.TryGetValue(r, out var v)
                    ? (v == true ? "✓  heard as described" : "✗  NOT heard")
                    : "○  not tested";
                return $"{r,-7}  {state}";
            }).ToList();
        }
    }

    public string ResultSummary
    {
        get
        {
            int tested = _results.Count(kv => kv.Value is not null);
            int heard = _results.Count(kv => kv.Value == true);
            if (tested < Routes.Count) return $"Tested {tested} of {Routes.Count} routes";
            return heard == Routes.Count
                ? "All routes confirmed audible by the technician"
                : $"{Routes.Count - heard} route(s) reported as not audible";
        }
    }

    public ICommand RefreshCommand { get; }
    public ICommand PlayCommand { get; }
    public ICommand StopCommand { get; }
    public ICommand HeardCommand { get; }
    public ICommand NotHeardCommand { get; }
    public ICommand ResetCommand { get; }

    public override void OnActivated() => LoadEndpoints();

    public override void OnDeactivated() => Stop();

    private void LoadEndpoints()
    {
        StatusText = "Reading output endpoints…";
        _ = System.Threading.Tasks.Task.Run(() =>
        {
            var endpoints = AudioService.RenderEndpoints();
            System.Windows.Application.Current?.Dispatcher.Invoke(() =>
            {
                Endpoints.Clear();
                foreach (var e in endpoints) Endpoints.Add(e);
                SelectedEndpoint ??= Endpoints.FirstOrDefault(e => e.IsDefault) ?? Endpoints.FirstOrDefault();
                StatusText = Endpoints.Count == 0
                    ? "Windows reports no active audio output endpoint."
                    : $"{Endpoints.Count} output endpoint(s) found.";
                Error = "";
                RaiseCommands();
            });
        });
    }

    private void Play()
    {
        if (SelectedEndpoint is null) return;
        Stop();
        _session = AudioService.StartTone(SelectedEndpoint, SelectedRoute, out string? error);
        if (error is not null)
        {
            Error = error;
            StatusText = "Playback could not start.";
            IsPlaying = false;
            _session.Dispose();
            _session = null;
            return;
        }

        Error = "";
        IsPlaying = _session.IsPlaying;
        StatusText = IsPlaying
            ? $"Playing {SelectedRoute} route on {SelectedEndpoint.Name}. Listen, then record the result."
            : "The stream started but reports no playback.";
    }

    private void Stop()
    {
        _session?.Dispose();
        _session = null;
        if (IsPlaying)
        {
            IsPlaying = false;
            StatusText = "Stopped.";
        }
    }

    private void Record(bool heard)
    {
        _results[SelectedRoute] = heard;
        OnPropertyChanged(nameof(Checklist));
        OnPropertyChanged(nameof(ResultSummary));
        StatusText = heard
            ? $"{SelectedRoute} recorded as heard."
            : $"{SelectedRoute} recorded as NOT heard — recheck volume, mute, and the correct output device.";
    }

    private void Reset()
    {
        Stop();
        _results.Clear();
        Error = "";
        StatusText = "Results cleared. Select a route to test.";
        OnPropertyChanged(nameof(Checklist));
        OnPropertyChanged(nameof(ResultSummary));
    }

    private void RaiseCommands()
    {
        (PlayCommand as RelayCommand)?.RaiseCanExecuteChanged();
        (StopCommand as RelayCommand)?.RaiseCanExecuteChanged();
    }
}
