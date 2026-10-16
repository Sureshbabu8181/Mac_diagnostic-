using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Input;
using WindowsLaptopDiagnostics.Core;
using WindowsLaptopDiagnostics.Hardware;
using WindowsLaptopDiagnostics.Infrastructure;

namespace WindowsLaptopDiagnostics.ViewModels;

/// <summary>A simple labelled value row on the dashboard.</summary>
public sealed record InfoRow(string Label, string Value);

/// <summary>Dashboard overview populated from real Windows APIs.</summary>
public sealed class OverviewViewModel : PageViewModelBase
{
    private readonly DeviceInfoService _device;
    private readonly MainViewModel _nav;
    private bool _isBusy;

    public OverviewViewModel(DeviceInfoService device, MainViewModel nav)
    {
        _device = device;
        _nav = nav;
        RefreshCommand = new AsyncRelayCommand(RefreshAsync);
        RunDiagnosticsCommand = new RelayCommand(() => _nav.NavigateTo("auto"));
        OpenTestCommand = new RelayCommand(key => _nav.NavigateTo(key?.ToString() ?? "overview"));
    }

    public override string Title => "Overview";

    public ICommand RefreshCommand { get; }
    public ICommand RunDiagnosticsCommand { get; }
    public ICommand OpenTestCommand { get; }

    public bool IsBusy
    {
        get => _isBusy;
        private set => SetProperty(ref _isBusy, value);
    }

    // ---- device identity ----
    private string _deviceTitle = "Detecting…";
    public string DeviceTitle { get => _deviceTitle; private set => SetProperty(ref _deviceTitle, value); }

    private string _deviceSubtitle = "";
    public string DeviceSubtitle { get => _deviceSubtitle; private set => SetProperty(ref _deviceSubtitle, value); }

    // ---- card collections ----
    private List<InfoRow> _hardwareRows = new();
    public List<InfoRow> HardwareRows { get => _hardwareRows; private set => SetProperty(ref _hardwareRows, value); }

    private List<InfoRow> _resourceRows = new();
    public List<InfoRow> ResourceRows { get => _resourceRows; private set => SetProperty(ref _resourceRows, value); }

    private List<InfoRow> _gpuRows = new();
    public List<InfoRow> GpuRows { get => _gpuRows; private set => SetProperty(ref _gpuRows, value); }

    private List<InfoRow> _storageRows = new();
    public List<InfoRow> StorageRows { get => _storageRows; private set => SetProperty(ref _storageRows, value); }

    private List<InfoRow> _powerRows = new();
    public List<InfoRow> PowerRows { get => _powerRows; private set => SetProperty(ref _powerRows, value); }

    private string _memorySummary = "";
    public string MemorySummary { get => _memorySummary; private set => SetProperty(ref _memorySummary, value); }

    private double _memoryUsedPercent;
    public double MemoryUsedPercent { get => _memoryUsedPercent; private set => SetProperty(ref _memoryUsedPercent, value); }

    private string _storageSummary = "";
    public string StorageSummary { get => _storageSummary; private set => SetProperty(ref _storageSummary, value); }

    public string Timestamp => DateTime.Now.ToString("g");

    public override void OnActivated() => _ = RefreshAsync();

    private async Task RefreshAsync()
    {
        if (IsBusy) return;
        IsBusy = true;
        try
        {
            // Hardware reads hit WMI; keep them off the UI thread.
            await Task.Run(() =>
            {
                DeviceTitle = string.IsNullOrWhiteSpace(_device.Model) || _device.Model == DeviceInfoService.Unavailable
                    ? _device.Manufacturer
                    : $"{_device.Manufacturer} {_device.Model}";
                DeviceSubtitle = $"{_device.ComputerName} · Serial {_device.SerialNumber}";

                HardwareRows = new List<InfoRow>
                {
                    new("Processor", _device.CpuName),
                    new("Cores / Threads", _device.CpuTopology),
                    new("BIOS", _device.BiosVersion),
                    new("Baseboard", _device.Baseboard),
                    new("Operating System", _device.OsCaption),
                    new("Build", _device.OsBuild),
                    new("Architecture", _device.Architecture),
                    new("Uptime", _device.Uptime),
                };

                var mem = _device.Memory();
                ResourceRows = new List<InfoRow>
                {
                    new("Installed", $"{mem.TotalGb:0.0} GB"),
                    new("Available", $"{mem.AvailableGb:0.0} GB"),
                    new("In use", $"{mem.UsedPercent:0.0}%"),
                };
                MemorySummary = $"{mem.AvailableGb:0.0} GB free of {mem.TotalGb:0.0} GB";
                MemoryUsedPercent = mem.UsedPercent;

                GpuRows = _device.Gpus().Select(g =>
                {
                    var vram = g.VramGb is { } v ? $"{v:0.#} GB" : DeviceInfoService.Unavailable;
                    var res = g.Resolution is { } r ? $"{r} @ {g.RefreshHz}Hz" : DeviceInfoService.Unavailable;
                    return new InfoRow(g.Name, $"VRAM {vram} · {res}");
                }).ToList();

                var disks = _device.Disks();
                StorageRows = disks.Select(d =>
                {
                    var size = d.SizeGb is { } s ? $"{s:0} GB" : "?";
                    var iface = string.IsNullOrEmpty(d.Interface) ? "" : $" ({d.Interface})";
                    return new InfoRow(d.Model, $"{size}{iface}");
                }).ToList();
                var totals = _device.StorageTotals();
                StorageSummary = totals is { } t ? $"{t.UsedPercent:0}% used of {t.TotalGb:0} GB" : DeviceInfoService.Unavailable;

                var power = _device.Power();
                if (power.Present)
                {
                    var charge = power.ChargePercent >= 0 ? $"{power.ChargePercent}%" : DeviceInfoService.Unavailable;
                    PowerRows = new List<InfoRow>
                    {
                        new("Charge", charge),
                        new("Power source", power.OnAc ? "AC adapter" : "Battery"),
                        new("Charging", power.Charging ? "Yes" : "No"),
                    };
                }
                else
                {
                    PowerRows = new List<InfoRow> { new("Battery", "No battery detected (desktop)") };
                }
            });
        }
        finally
        {
            IsBusy = false;
        }
    }
}
