using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Threading.Tasks;
using System.Windows.Input;
using WindowsLaptopDiagnostics.Core;
using WindowsLaptopDiagnostics.Infrastructure;
using WindowsLaptopDiagnostics.Services;

namespace WindowsLaptopDiagnostics.ViewModels;

/// <summary>
/// Temperature and sensor dashboard.
///
/// Every row carries its source and an honest state. A sensor the machine does
/// not expose reads Unsupported; one that needs administrator rights reads
/// Permission Required. Nothing is ever substituted or estimated.
/// </summary>
public sealed class ThermalViewModel : PageViewModelBase
{
    private System.Threading.Timer? _poll;

    public ThermalViewModel()
    {
        RefreshCommand = new RelayCommand(Refresh);
    }

    public override string Title => "Temperature & Sensors";

    public ObservableCollection<string> Rows { get; } = new();
    public ObservableCollection<string> Notes { get; } = new();

    private string _statusText = "Reading sensors…";
    public string StatusText { get => _statusText; private set => SetProperty(ref _statusText, value); }

    private string _error = "";
    public string Error { get => _error; private set => SetProperty(ref _error, value); }

    public ICommand RefreshCommand { get; }

    public override void OnActivated()
    {
        Refresh();
        _poll = new System.Threading.Timer(_ => Refresh(), null, 2000, 2000);
    }

    public override void OnDeactivated()
    {
        _poll?.Dispose();
        _poll = null;
    }

    private void Refresh()
    {
        _ = Task.Run(() =>
        {
            var rows = new List<string>();
            var notes = new List<string>();

            // CPU temperature
            var temp = PerformanceService.ReadCpuTemperature();
            rows.Add(temp.State == SensorState.Available
                ? $"CPU temperature      {temp.Value:0.#} °C      ({temp.Source})"
                : $"CPU temperature      {temp.State.Label()}      ({temp.Source})");
            if (temp.State != SensorState.Available) notes.Add($"CPU temperature: {temp.Detail}");

            // Fan RPM
            var fan = PerformanceService.ReadFanRpm();
            rows.Add(fan.State == SensorState.Available
                ? $"Fan speed            {fan.Value:0} RPM      ({fan.Source})"
                : $"Fan speed            {fan.State.Label()}      ({fan.Source})");
            if (fan.State != SensorState.Available) notes.Add($"Fan speed: {fan.Detail}");

            // CPU load / clock / throttle
            var cpu = PerformanceService.ReadCpu(out string throttleExplain);
            if (cpu.State == SensorState.Available && cpu.Value is { } c)
            {
                rows.Add($"CPU utilisation      {c.LoadPercent:0.#} %         ({cpu.Source})");
                rows.Add($"CPU clock            {c.ClockMHz:0} MHz     (of {c.MaxClockMHz:0} MHz max)");
                rows.Add($"Performance limit    flags = {c.ThrottleFlags}   ({throttleExplain})");
                notes.Add($"Per-thread utilisation: {string.Join(", ", c.PerThreadLoad)}");
            }
            else
            {
                rows.Add($"CPU utilisation      {cpu.State.Label()}");
                if (cpu.State != SensorState.Available) notes.Add($"CPU utilisation: {cpu.Detail}");
            }

            // GPU
            var gpus = PerformanceService.ReadGpus();
            foreach (var g in gpus)
            {
                if (g.State == SensorState.Available && g.Value is { } v)
                {
                    rows.Add($"GPU utilisation      {v.EngineUtilPercent:0.#} %         ({v.Name})");
                    rows.Add($"GPU memory           {v.DedicatedUsedMb:0} MB dedicated, {v.SharedUsedMb:0} MB shared");
                }
                else
                {
                    rows.Add($"GPU telemetry        {g.State.Label()}         ({g.Detail})");
                }
            }

            System.Windows.Application.Current?.Dispatcher.BeginInvoke(() =>
            {
                Rows.Clear();
                foreach (var r in rows) Rows.Add(r);
                Notes.Clear();
                foreach (var n in notes) Notes.Add(n);

                int available = 0;
                foreach (var line in rows) if (line.Contains(" °C") || line.Contains("RPM")) available++;
                StatusText = available == 0
                    ? "No thermal sensor is readable in this session — see the notes below for why."
                    : $"{rows.Count} sensor reading(s) refreshed.";
            });
        });
    }
}
