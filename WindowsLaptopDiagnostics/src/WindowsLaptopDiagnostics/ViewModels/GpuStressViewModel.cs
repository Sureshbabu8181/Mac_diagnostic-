using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Input;
using WindowsLaptopDiagnostics.Core;
using WindowsLaptopDiagnostics.Infrastructure;
using WindowsLaptopDiagnostics.Services;

namespace WindowsLaptopDiagnostics.ViewModels;

/// <summary>One display adapter as reported by Windows.</summary>
public sealed record GpuAdapterInfo(string Name, string Driver, string State, string Detail);

/// <summary>
/// GPU diagnostic: adapter inventory, live telemetry, and a bounded rendering
/// workload with progress and cancel.
///
/// Honesty: telemetry is only shown for adapters Windows actually exposes
/// counters for. The workload loads the GPU's composition pipeline and the
/// before/during utilisation is measured, not assumed.
/// </summary>
public sealed class GpuStressViewModel : PageViewModelBase
{
    private System.Threading.Timer? _poll;
    private bool _workloadActive;
    private double _baselineUtil;

    public GpuStressViewModel()
    {
        RefreshCommand = new RelayCommand(Refresh);
        StartCommand = new RelayCommand(StartWorkload, () => !IsRunning);
        CancelCommand = new RelayCommand(StopWorkload, () => IsRunning);
        ResetCommand = new RelayCommand(Reset, () => !IsRunning);
    }

    public override string Title => "GPU Stress Test";

    public static readonly int[] DurationOptions = { 10, 30, 60, 120 };

    private int _durationSeconds = 30;
    public int DurationSeconds { get => _durationSeconds; set => SetProperty(ref _durationSeconds, value); }

    public ObservableCollection<GpuAdapterInfo> Adapters { get; } = new();
    public ObservableCollection<string> TelemetryLines { get; } = new();

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

    private double _progressPercent;
    public double ProgressPercent { get => _progressPercent; private set => SetProperty(ref _progressPercent, value); }

    private string _elapsedText = "00:00";
    public string ElapsedText { get => _elapsedText; private set => SetProperty(ref _elapsedText, value); }

    private string _statusText = "Reading display adapters…";
    public string StatusText { get => _statusText; private set => SetProperty(ref _statusText, value); }

    private string _resultText = "";
    public string ResultText { get => _resultText; private set => SetProperty(ref _resultText, value); }

    private string _error = "";
    public string Error { get => _error; private set => SetProperty(ref _error, value); }

    private string _workloadNote = "";
    /// <summary>Explains exactly what the workload does and does not prove.</summary>
    public string WorkloadNote
    {
        get => _workloadNote;
        private set => SetProperty(ref _workloadNote, value);
    }

    public ICommand RefreshCommand { get; }
    public ICommand StartCommand { get; }
    public ICommand CancelCommand { get; }
    public ICommand ResetCommand { get; }

    public override void OnActivated()
    {
        WorkloadNote =
            "The workload animates a dense field of moving primitives through WPF's hardware-accelerated " +
            "composition path, which loads the GPU's rendering pipeline. It is not a compute-shader or " +
            "vendor-specific benchmark, and utilisation is measured from Windows counters rather than assumed.";
        Refresh();
        StartPolling();
    }

    public override void OnDeactivated()
    {
        StopWorkload();
        StopPolling();
    }

    /// <summary>Raised so the view can start/stop its rendering animation.</summary>
    public event Action<bool, int>? WorkloadChanged;

    private void Refresh()
    {
        _ = Task.Run(() =>
        {
            var adapters = PerformanceService.ReadGpus();
            var rows = new List<GpuAdapterInfo>();
            foreach (var a in adapters)
            {
                if (a.State == SensorState.Available && a.Value is { } v)
                {
                    rows.Add(new GpuAdapterInfo(
                        v.Name,
                        string.IsNullOrWhiteSpace(v.DriverVersion) ? "driver version not reported" : v.DriverVersion,
                        "telemetry available",
                        $"dedicated {v.DedicatedUsedMb:0} MB · shared {v.SharedUsedMb:0} MB · " +
                        $"engine utilisation {v.EngineUtilPercent:0.#}%"));
                }
                else
                {
                    // Detail reads "<full adapter name> is an indirect (remote) display — …".
                    // Split on that marker so the whole name survives, not just word one.
                    string detail = a.Detail;
                    string name = detail.Contains(" is an indirect", StringComparison.OrdinalIgnoreCase)
                        ? detail[..detail.IndexOf(" is an indirect", StringComparison.OrdinalIgnoreCase)].Trim()
                        : "display adapter";
                    rows.Add(new GpuAdapterInfo(
                        name, "—",
                        a.State == SensorState.PermissionRequired ? "permission required" : "unsupported",
                        detail));
                }
            }

            System.Windows.Application.Current?.Dispatcher.Invoke(() =>
            {
                Adapters.Clear();
                foreach (var r in rows) Adapters.Add(r);
                StatusText = rows.Count == 0
                    ? "Windows reports no display adapter."
                    : $"{rows.Count} display adapter(s) reported by Windows.";
            });
        });
    }

    private void StartPolling()
    {
        StopPolling();
        _poll = new System.Threading.Timer(_ => PollTelemetry(), null, 0, 1000);
    }

    private void StopPolling()
    {
        _poll?.Dispose();
        _poll = null;
    }

    private void PollTelemetry()
    {
        var samples = PerformanceService.ReadGpus();
        System.Windows.Application.Current?.Dispatcher.BeginInvoke(() =>
        {
            TelemetryLines.Clear();
            foreach (var s in samples)
            {
                if (s.State == SensorState.Available && s.Value is { } v)
                {
                    TelemetryLines.Add($"{v.Name}");
                    TelemetryLines.Add($"   engine utilisation  {v.EngineUtilPercent:0.#}%");
                    TelemetryLines.Add($"   dedicated memory     {v.DedicatedUsedMb:0} MB");
                    TelemetryLines.Add($"   shared memory        {v.SharedUsedMb:0} MB");
                }
                else
                {
                    TelemetryLines.Add($"   telemetry {s.State.Label().ToLowerInvariant()}: {s.Detail}");
                }
            }
        });
    }

    private void StartWorkload()
    {
        var physical = PerformanceService.ReadGpus()
            .FirstOrDefault(s => s.State == SensorState.Available);
        if (physical is null)
        {
            Error = "No adapter exposes telemetry, so a measured load cannot be reported.";
            StatusText = "The rendering workload cannot report a result on this machine.";
            return;
        }

        Error = "";
        ResultText = "";
        ProgressPercent = 0;
        _baselineUtil = physical.Value!.EngineUtilPercent;
        _workloadActive = true;
        IsRunning = true;
        WorkloadChanged?.Invoke(true, DurationSeconds);
        StatusText = $"Rendering workload running for {DurationSeconds} s. Cancel returns immediately.";

        var sw = System.Diagnostics.Stopwatch.StartNew();
        _ = Task.Run(() =>
        {
            var samples = new List<double>();
            while (sw.Elapsed.TotalSeconds < DurationSeconds && _workloadActive)
            {
                var now = PerformanceService.ReadGpus()
                    .FirstOrDefault(s => s.State == SensorState.Available);
                if (now?.Value is { } v) samples.Add(v.EngineUtilPercent);

                System.Windows.Application.Current?.Dispatcher.BeginInvoke(() =>
                {
                    ProgressPercent = Math.Min(100, sw.Elapsed.TotalSeconds * 100.0 / DurationSeconds);
                    ElapsedText = $"{(int)(sw.Elapsed.TotalSeconds / 60):00}:{(int)sw.Elapsed.TotalSeconds % 60:00}";
                });
                System.Threading.Thread.Sleep(500);
            }

            bool cancelled = _workloadActive;
            _workloadActive = false;
            System.Windows.Application.Current?.Dispatcher.BeginInvoke(() =>
            {
                WorkloadChanged?.Invoke(false, 0);
                IsRunning = false;
                ProgressPercent = 100;

                if (samples.Count == 0)
                {
                    StatusText = "No telemetry was sampled during the run.";
                    ResultText = "";
                    return;
                }

                double peak = samples.Max();
                double avg = samples.Average();
                StatusText = cancelled
                    ? "Stopped on request. Rendering has returned to idle."
                    : "Rendering workload complete.";
                ResultText =
                    $"Engine utilisation went from {_baselineUtil:0.#}% idle to an average of {avg:0.#}% " +
                    $"and a peak of {peak:0.#}% while rendering. Measured from Windows GPU counters over " +
                    $"{samples.Count} samples.";
            });
        });
    }

    private void StopWorkload()
    {
        if (!_workloadActive && !IsRunning) return;
        _workloadActive = false;
        WorkloadChanged?.Invoke(false, 0);
        IsRunning = false;
        StatusText = "Stopped on request. Rendering has returned to idle.";
    }

    private void Reset()
    {
        StopWorkload();
        ProgressPercent = 0;
        ElapsedText = "00:00";
        ResultText = "";
        Error = "";
        StatusText = "Cleared.";
        Refresh();
    }

    private void RaiseCommands()
    {
        (StartCommand as RelayCommand)?.RaiseCanExecuteChanged();
        (CancelCommand as RelayCommand)?.RaiseCanExecuteChanged();
        (ResetCommand as RelayCommand)?.RaiseCanExecuteChanged();
    }
}
