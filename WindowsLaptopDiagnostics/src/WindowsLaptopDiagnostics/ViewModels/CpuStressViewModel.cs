using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Input;
using WindowsLaptopDiagnostics.Core;
using WindowsLaptopDiagnostics.Infrastructure;
using WindowsLaptopDiagnostics.Services;

namespace WindowsLaptopDiagnostics.ViewModels;

/// <summary>
/// Bounded CPU stress test.
///
/// Honesty: load, clock and the throttle flag are read from Windows processor
/// counters while the workload runs. Temperature is only shown when the ACPI
/// thermal zone is readable; otherwise the page says so and the thermal safety
/// limit is documented as inactive rather than pretending it is armed.
/// </summary>
public sealed class CpuStressViewModel : PageViewModelBase
{
    private CpuStress? _stress;

    public CpuStressViewModel()
    {
        StartCommand = new RelayCommand(Start, () => !IsRunning);
        CancelCommand = new RelayCommand(Cancel, () => IsRunning);
        ResetCommand = new RelayCommand(Reset, () => !IsRunning);
    }

    public override string Title => "CPU Stress Test";

    /// <summary>Options are conservative by default, as the plan requires.</summary>
    public static readonly int[] DurationOptions = { 10, 30, 60, 120, 300 };

    private int _durationSeconds = 30;
    public int DurationSeconds
    {
        get => _durationSeconds;
        set { if (SetProperty(ref _durationSeconds, value)) RaiseCommands(); }
    }

    private int _threadCount = Math.Max(1, Environment.ProcessorCount - 1);
    public int ThreadCount
    {
        get => _threadCount;
        set { if (SetProperty(ref _threadCount, Math.Clamp(value, 1, 64))) RaiseCommands(); }
    }

    public string ThreadHint =>
        $"This machine reports {Environment.ProcessorCount} logical processors. " +
        "Leaving one idle keeps the UI responsive; set 1 for the gentlest test.";

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

    private double _loadPercent;
    public double LoadPercent { get => _loadPercent; private set => SetProperty(ref _loadPercent, value); }

    private double _clockMHz;
    public double ClockMHz { get => _clockMHz; private set => SetProperty(ref _clockMHz, value); }

    private string _temperatureText = "reading…";
    public string TemperatureText { get => _temperatureText; private set => SetProperty(ref _temperatureText, value); }

    private bool _throttled;
    public bool Throttled
    {
        get => _throttled;
        private set
        {
            if (!SetProperty(ref _throttled, value)) return;
            OnPropertyChanged(nameof(ThrottleText));
        }
    }

    public string ThrottleText => _throttled
        ? "Windows reports a performance-limit flag. Compare the clock above against maximum clock: " +
          "sustained boosting means the flag is a capability state, not active throttling."
        : "No performance-limit flag reported (PerformanceLimitFlags = 0).";

    private string _thermalStatusText = "";
    public string ThermalStatusText { get => _thermalStatusText; private set => SetProperty(ref _thermalStatusText, value); }

    private string _statusText = "Choose a duration and thread count, then start.";
    public string StatusText { get => _statusText; private set => SetProperty(ref _statusText, value); }

    private string _resultText = "";
    public string ResultText { get => _resultText; private set => SetProperty(ref _resultText, value); }

    /// <summary>
    /// Makes clear whether the tiles are live or frozen at the last sample, so
    /// a stale 81 % is never mistaken for the machine's state right now.
    /// </summary>
    private string _readingsCaption = "Idle — start a run to see live readings.";
    public string ReadingsCaption { get => _readingsCaption; private set => SetProperty(ref _readingsCaption, value); }

    private string _error = "";
    public string Error { get => _error; private set => SetProperty(ref _error, value); }

    /// <summary>Per-thread load bars, one entry per logical processor.</summary>
    public ObservableCollection<double> ThreadLoads { get; } = new();

    public ICommand StartCommand { get; }
    public ICommand CancelCommand { get; }
    public ICommand ResetCommand { get; }

    public override void OnActivated()
    {
        if (ThreadLoads.Count == 0)
            for (int i = 0; i < Environment.ProcessorCount; i++) ThreadLoads.Add(0);
        RefreshThermalCapability();
    }

    public override void OnDeactivated() => Cancel();

    /// <summary>
    /// Determines once whether the thermal safety limit can be armed at all.
    /// The UI must say so rather than implying a limit that does not exist.
    /// </summary>
    private void RefreshThermalCapability()
    {
        var temp = PerformanceService.ReadCpuTemperature();
        switch (temp.State)
        {
            case SensorState.Available:
                ThermalStatusText =
                    $"Thermal limit armed: the run stops itself at {CpuStress.ThermalStopC:0} °C " +
                    $"(warning at {CpuStress.ThermalWarnC:0} °C).";
                break;
            case SensorState.PermissionRequired:
                ThermalStatusText =
                    "Thermal limit is NOT armed — CPU temperature needs administrator rights. " +
                    "The workload is still bounded by its duration and can be cancelled at any time.";
                break;
            default:
                ThermalStatusText =
                    "Thermal limit is NOT armed — this firmware exposes no CPU temperature to Windows. " +
                    "The workload is still bounded by its duration and can be cancelled at any time.";
                break;
        }
        OnPropertyChanged(nameof(ThreadHint));
    }

    private void Start()
    {
        _stress?.Dispose();
        _stress = new CpuStress();
        _stress.Progress += OnProgress;
        _stress.Completed += OnCompleted;

        ThreadLoads.Clear();
        for (int i = 0; i < Environment.ProcessorCount; i++) ThreadLoads.Add(0);

        Error = "";
        ResultText = "";
        LoadPercent = 0;
        ClockMHz = 0;
        Throttled = false;
        ProgressPercent = 0;
        ElapsedText = "00:00";

        try
        {
            _stress.Start(ThreadCount, DurationSeconds);
        }
        catch (Exception ex)
        {
            Error = ex.Message;
            StatusText = "The workload could not start.";
            IsRunning = false;
            return;
        }

        IsRunning = true;
        ReadingsCaption = "Live — sampled several times a second while the run is active.";
        StatusText = $"Running {ThreadCount} worker(s) for up to {DurationSeconds} s. Cancel is immediate.";
    }

    private void OnProgress(StressProgress p)
    {
        System.Windows.Application.Current?.Dispatcher.BeginInvoke(() =>
        {
            ProgressPercent = Math.Min(100, p.ElapsedSeconds * 100.0 / DurationSeconds);
            ElapsedText = $"{(int)(p.ElapsedSeconds / 60):00}:{(int)p.ElapsedSeconds % 60:00}";
            LoadPercent = p.LoadPercent;
            ClockMHz = p.ClockMHz;
            Throttled = p.Throttled;
            TemperatureText = p.TemperatureC is { } t ? $"{t:0.#} °C" : "unavailable";

            var cpu = PerformanceService.ReadCpu(out string throttleExplain);
            if (cpu.State == SensorState.Available && cpu.Value is { } c)
            {
                ThreadLoads.Clear();
                foreach (double v in c.PerThreadLoad) ThreadLoads.Add(v);
            }
            else
            {
                ThermalStatusText = cpu.Detail;
            }
        });
    }

    private void OnCompleted(StressResult r)
    {
        System.Windows.Application.Current?.Dispatcher.BeginInvoke(() =>
        {
            IsRunning = false;
            ProgressPercent = 100;
            ReadingsCaption = "Last sample from the run above — the processor is idle again now.";
            ElapsedText = $"{(int)(r.ActualSeconds / 60):00}:{(int)r.ActualSeconds % 60:00}";
            StatusText = r.EndedReason switch
            {
                var s when s.StartsWith("cancelled") => "Stopped on request. Load returns to idle within about a second.",
                var s when s.Contains("thermal") => $"Stopped early by the thermal safety limit: {r.EndedReason}.",
                _ => "Run complete.",
            };

            var parts = new System.Collections.Generic.List<string>
            {
                $"Ran {r.AvgLoadPercent:0.#}% average load across {ThreadCount} worker(s) for {r.ActualSeconds:0.#} s",
                $"average clock {r.AvgClockMHz:0} MHz (peak {r.MaxClockMHz:0} MHz)",
            };
            if (r.PeakTemperatureC > 0)
                parts.Add($"peak temperature {r.PeakTemperatureC:0.#} °C");
            if (r.ThrottleObserved)
                parts.Add("a processor performance limit was observed during the run");
            ResultText = string.Join("; ", parts) + ".";
        });
    }

    private void Cancel()
    {
        _stress?.Cancel();
        IsRunning = false;
        ReadingsCaption = "Last sample from the run above — the processor is idle again now.";
        StatusText = "Stopped on request.";
    }

    private void Reset()
    {
        _stress?.Dispose();
        _stress = null;
        ProgressPercent = 0;
        ElapsedText = "00:00";
        LoadPercent = 0;
        ClockMHz = 0;
        Throttled = false;
        TemperatureText = "reading…";
        ResultText = "";
        Error = "";
        ReadingsCaption = "Idle — start a run to see live readings.";
        StatusText = "Cleared. Choose a duration and thread count, then start.";
        RefreshThermalCapability();
    }

    private void RaiseCommands()
    {
        (StartCommand as RelayCommand)?.RaiseCanExecuteChanged();
        (CancelCommand as RelayCommand)?.RaiseCanExecuteChanged();
        (ResetCommand as RelayCommand)?.RaiseCanExecuteChanged();
    }
}
