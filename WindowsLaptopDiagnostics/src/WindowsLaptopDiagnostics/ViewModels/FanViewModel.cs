using System;
using System.Collections.Generic;
using System.Windows.Input;
using WindowsLaptopDiagnostics.Core;
using WindowsLaptopDiagnostics.Infrastructure;
using WindowsLaptopDiagnostics.Services;

namespace WindowsLaptopDiagnostics.ViewModels;

/// <summary>
/// A single sample taken during the cooling observation window.
/// </summary>
public sealed record CoolingSample(double Seconds, double LoadPercent, double ClockMHz, double? TemperatureC);

/// <summary>
/// Fan and cooling test.
///
/// The plan allows a 10-second maximum-speed test *only* with a documented,
/// vendor-supported control method that can be saved and restored. No such
/// method exists here: <see cref="WindowsApi.FanControlSupported"/> is false and
/// no vendor WMI class is exposed. This module therefore runs in the explicitly
/// documented observation mode instead of guessing at an embedded-controller
/// register, and it says so on screen.
/// </summary>
public sealed class FanViewModel : PageViewModelBase
{
    private System.Threading.Timer? _poll;

    public FanViewModel()
    {
        StartCommand = new RelayCommand(Start, () => !IsRunning);
        CancelCommand = new RelayCommand(Cancel, () => IsRunning);
        ResetCommand = new RelayCommand(Reset, () => !IsRunning);
    }

    public override string Title => "Fan & Cooling";

    /// <summary>The observation window the plan specifies for this mode.</summary>
    public const int WindowSeconds = 10;

    /// <summary>
    /// Why the maximum-speed test is unavailable. Shown verbatim so the
    /// limitation is explicit rather than implied by a missing button.
    /// </summary>
    public string ControlUnavailableReason =>
        "The 10-second maximum-speed fan test is Unsupported on this machine. " +
        "It requires a documented, vendor-supported control method whose previous state can be " +
        "saved and restored on exit, cancel and fault. Windows exposes no such method here: " +
        "Win32_Fan reports no fan and no vendor control class is present. This module therefore " +
        "runs in observation mode only — it never writes to the embedded controller.";

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

    private string _fanText = "reading…";
    public string FanText { get => _fanText; private set => SetProperty(ref _fanText, value); }

    private string _tempText = "reading…";
    public string TemperatureText { get => _tempText; private set => SetProperty(ref _tempText, value); }

    private string _statusText = "Press Start to observe cooling behaviour for 10 seconds.";
    public string StatusText { get => _statusText; private set => SetProperty(ref _statusText, value); }

    private string _resultText = "";
    public string ResultText { get => _resultText; private set => SetProperty(ref _resultText, value); }

    private string _error = "";
    public string Error { get => _error; private set => SetProperty(ref _error, value); }

    public ICommand StartCommand { get; }
    public ICommand CancelCommand { get; }
    public ICommand ResetCommand { get; }

    public override void OnActivated() => RefreshFanOnce();

    public override void OnDeactivated() => Cancel();

    /// <summary>Reads the fan once so the sensor state is visible before any run.</summary>
    private void RefreshFanOnce()
    {
        _ = System.Threading.Tasks.Task.Run(() =>
        {
            var fan = PerformanceService.ReadFanRpm();
            var temp = PerformanceService.ReadCpuTemperature();
            System.Windows.Application.Current?.Dispatcher.Invoke(() =>
            {
                FanText = fan.State == SensorState.Available
                    ? $"{fan.Value:0} RPM"
                    : fan.State.Label();
                TemperatureText = temp.State == SensorState.Available
                    ? $"{temp.Value:0.#} °C"
                    : temp.State.Label();
                OnPropertyChanged(nameof(SensorNotes));
            });
        });
    }

    /// <summary>Per-sensor provenance, so Unsupported is explained, not just coloured.</summary>
    public IReadOnlyList<string> SensorNotes
    {
        get
        {
            var notes = new List<string>();
            var fan = PerformanceService.ReadFanRpm();
            if (fan.State != SensorState.Available) notes.Add($"Fan RPM: {fan.Detail}");
            var temp = PerformanceService.ReadCpuTemperature();
            if (temp.State != SensorState.Available) notes.Add($"Temperature: {temp.Detail}");
            return notes;
        }
    }

    private void Start()
    {
        Error = "";
        ResultText = "";
        ProgressPercent = 0;
        IsRunning = true;
        StatusText = "Observing load, clock and temperature for 10 seconds. Nothing is written to the hardware.";

        var samples = new List<CoolingSample>();
        var sw = System.Diagnostics.Stopwatch.StartNew();

        _poll = new System.Threading.Timer(_ =>
        {
            double s = sw.Elapsed.TotalSeconds;
            double load = 0, clock = 0;
            double? temp = null;

            var cpu = PerformanceService.ReadCpu(out string throttleExplain);
            if (cpu.State == SensorState.Available && cpu.Value is { } c)
            {
                load = c.LoadPercent;
                clock = c.ClockMHz;
            }
            var ts = PerformanceService.ReadCpuTemperature();
            if (ts.State == SensorState.Available && ts.Value is { } tv) temp = tv;

            samples.Add(new CoolingSample(s, load, clock, temp));

            System.Windows.Application.Current?.Dispatcher.BeginInvoke(() =>
            {
                ProgressPercent = Math.Min(100, s * 100.0 / WindowSeconds);
                ElapsedText = $"00:{(int)s:00}";
                TemperatureText = temp is { } t ? $"{t:0.#} °C" : TemperatureText;
            });

            if (s >= WindowSeconds)
            {
                Cancel();
                Summarise(samples);
            }
        }, null, 0, 1000);
    }

    private void Summarise(List<CoolingSample> samples)
    {
        System.Windows.Application.Current?.Dispatcher.BeginInvoke(() =>
        {
            IsRunning = false;
            if (samples.Count == 0)
            {
                StatusText = "No samples were collected.";
                return;
            }

            var withTemp = samples.FindAll(s => s.TemperatureC.HasValue);
            double avgLoad = 0, maxLoad = 0, avgClock = 0, maxClock = 0;
            foreach (var s in samples) { avgLoad += s.LoadPercent; avgClock += s.ClockMHz; maxLoad = Math.Max(maxLoad, s.LoadPercent); maxClock = Math.Max(maxClock, s.ClockMHz); }
            avgLoad /= samples.Count;
            avgClock /= samples.Count;

            var parts = new List<string>
            {
                $"average load {avgLoad:0.#}% (peak {maxLoad:0.#}%)",
                $"average clock {avgClock:0} MHz (peak {maxClock:0} MHz)",
            };

            if (withTemp.Count > 0)
            {
                double min = double.MaxValue, max = double.MinValue;
                foreach (var s in withTemp) { min = Math.Min(min, s.TemperatureC!.Value); max = Math.Max(max, s.TemperatureC!.Value); }
                parts.Add($"temperature {min:0.#} → {max:0.#} °C over {withTemp.Count} samples");
                ResultText = string.Join("; ", parts) + ". " +
                    "Because no fan RPM is exposed, cooling effectiveness cannot be proven from this data alone — " +
                    "rising temperature under sustained load is the observable signal.";
            }
            else
            {
                ResultText = string.Join("; ", parts) + ". " +
                    "Temperature is unavailable in this session, so only load and clock were observed; " +
                    "cooling cannot be assessed without a temperature source.";
            }

            StatusText = "Observation complete. Nothing was written to the hardware.";
        });
    }

    private void Cancel()
    {
        _poll?.Dispose();
        _poll = null;
        if (IsRunning)
        {
            IsRunning = false;
            StatusText = "Observation stopped on request.";
        }
    }

    private void Reset()
    {
        Cancel();
        ProgressPercent = 0;
        ElapsedText = "00:00";
        ResultText = "";
        Error = "";
        StatusText = "Cleared. Press Start to observe cooling behaviour for 10 seconds.";
        RefreshFanOnce();
    }

    private void RaiseCommands()
    {
        (StartCommand as RelayCommand)?.RaiseCanExecuteChanged();
        (CancelCommand as RelayCommand)?.RaiseCanExecuteChanged();
        (ResetCommand as RelayCommand)?.RaiseCanExecuteChanged();
    }
}
