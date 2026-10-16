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

/// <summary>One drive row for the inventory list.</summary>
public sealed record StorageDiskRow(string Model, string Interface, string Size, string Serial, string Status, string Health);

/// <summary>One volume row with its usage.</summary>
public sealed record StorageVolumeRow(string Letter, string Label, string Fs, string Usage, string Detail, bool Readable);

/// <summary>
/// Read-only storage health. No writes, no formats, no destructive patterns —
/// the only probe opens existing data for reading.
/// </summary>
public sealed class StorageViewModel : PageViewModelBase
{
    public StorageViewModel()
    {
        RefreshCommand = new RelayCommand(Refresh);
    }

    public override string Title => "SSD / HDD Health";

    public ObservableCollection<StorageDiskRow> Disks { get; } = new();
    public ObservableCollection<StorageVolumeRow> Volumes { get; } = new();

    private string _smartValue = "reading…";
    public string SmartValue { get => _smartValue; private set => SetProperty(ref _smartValue, value); }

    private string _smartDetail = "";
    public string SmartDetail { get => _smartDetail; private set => SetProperty(ref _smartDetail, value); }

    private bool _smartAvailable;
    public bool SmartAvailable { get => _smartAvailable; private set => SetProperty(ref _smartAvailable, value); }

    private string _statusText = "Reading storage…";
    public string StatusText { get => _statusText; private set => SetProperty(ref _statusText, value); }

    private string _error = "";
    public string Error { get => _error; private set => SetProperty(ref _error, value); }

    private string _readNote = "";
    /// <summary>States explicitly that the probe was read-only.</summary>
    public string ReadNote { get => _readNote; private set => SetProperty(ref _readNote, value); }

    public ICommand RefreshCommand { get; }

    public override void OnActivated()
    {
        ReadNote =
            "Everything on this page is read-only. No data is written to any drive, no volume is " +
            "formatted, and no destructive pattern is ever run against user storage.";
        Refresh();
    }

    private void Refresh()
    {
        Error = "";
        _ = Task.Run(() =>
        {
            try
            {
                var disks = HardwareService.Disks();
                var vols = HardwareService.Volumes();
                var (smartOk, smartVal, smartDetail) = HardwareService.SmartSummary();

                var diskRows = disks.Select(d => new StorageDiskRow(
                    d.Model,
                    d.Interface,
                    $"{d.SizeGb:0.#} GB",
                    string.IsNullOrWhiteSpace(d.Serial) ? "not reported" : d.Serial,
                    d.Status,
                    d.Health switch
                    {
                        DriveHealth.Ok => "OK",
                        DriveHealth.Failing => "Attention",
                        DriveHealth.Caution => "Caution",
                        _ => "Unknown",
                    })).ToList();

                var volRows = vols.Select(v => new StorageVolumeRow(
                    v.Letter,
                    v.Label,
                    v.FileSystem,
                    v.SizeGb > 0 ? $"{v.UsedPercent:0.#}% used · {v.FreeGb:0.#} GB free of {v.SizeGb:0.#} GB" : "no media",
                    v.Readable ? v.ReadDetail : v.ReadDetail,
                    v.Readable)).ToList();

                int unreadable = vols.Count(v => v.Readable == false);
                int attention = disks.Count(d => d.Health == DriveHealth.Failing);

                System.Windows.Application.Current?.Dispatcher.Invoke(() =>
                {
                    Disks.Clear();
                    foreach (var r in diskRows) Disks.Add(r);
                    Volumes.Clear();
                    foreach (var r in volRows) Volumes.Add(r);

                    SmartAvailable = smartOk;
                    SmartValue = smartVal;
                    SmartDetail = smartDetail;

                    if (disks.Count == 0)
                        StatusText = "Windows reports no physical disk.";
                    else if (attention > 0)
                        StatusText = $"{disks.Count} disk(s), {attention} reporting a problem. " +
                                     "Investigate before the drive fails.";
                    else
                        StatusText = $"{disks.Count} disk(s) and {vols.Count} volume(s) inventoried.";
                    if (unreadable > 0)
                        StatusText += $" {unreadable} volume(s) could not be read in this session.";
                });
            }
            catch (Exception ex)
            {
                Logger.Error("Storage refresh failed", ex);
                System.Windows.Application.Current?.Dispatcher.Invoke(() =>
                {
                    Error = ex.Message;
                    StatusText = "Storage inspection failed.";
                });
            }
        });
    }
}
