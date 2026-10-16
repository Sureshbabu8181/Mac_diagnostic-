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
/// Bluetooth adapter presence and radio status. Discovery is only offered when
/// the Windows Bluetooth permission is granted; a denial is reported as
/// Permission Required rather than "no devices found".
/// </summary>
public sealed class BluetoothViewModel : PageViewModelBase
{
    public BluetoothViewModel()
    {
        RefreshCommand = new RelayCommand(Refresh);
    }

    public override string Title => "Bluetooth";

    public ObservableCollection<string> Devices { get; } = new();

    private string _radioState = "reading…";
    public string RadioState { get => _radioState; private set => SetProperty(ref _radioState, value); }

    private string _statusText = "Reading Bluetooth devices…";
    public string StatusText { get => _statusText; private set => SetProperty(ref _statusText, value); }

    private string _discoveryNote = "";
    public string DiscoveryNote { get => _discoveryNote; private set => SetProperty(ref _discoveryNote, value); }

    private string _error = "";
    public string Error { get => _error; private set => SetProperty(ref _error, value); }

    public ICommand RefreshCommand { get; }

    public override void OnActivated()
    {
        DiscoveryNote = ConnectivityService.DiscoveryRequirement();
        Refresh();
    }

    private void Refresh()
    {
        Error = "";
        _ = Task.Run(() =>
        {
            try
            {
                var devices = ConnectivityService.AdaptersAndRadios();
                bool radio = ConnectivityService.RadioPresent(devices);

                System.Windows.Application.Current?.Dispatcher.Invoke(() =>
                {
                    Devices.Clear();

                    if (devices.Count == 0)
                    {
                        Devices.Add("Windows reports no Bluetooth class entries.");
                        RadioState = "Unsupported";
                        StatusText = "No Bluetooth stack reported by Windows.";
                        return;
                    }

                    foreach (var d in devices)
                    {
                        string health = d.ErrorCode == 0
                            ? "OK"
                            : $"error {d.ErrorCode}: {HardwareService.DescribePnpError(d.ErrorCode)}";
                        Devices.Add($"{d.Name}");
                        Devices.Add($"    {d.PnpId}");
                        Devices.Add($"    {d.Status} · {health}");
                        Devices.Add("");
                    }

                    RadioState = radio ? "Radio present" : "No radio (protocol nodes only)";
                    StatusText = radio
                        ? $"{devices.Count} Bluetooth entrie(s); a radio adapter is present. " +
                          "Discovery requires the Bluetooth permission."
                        : $"{devices.Count} Bluetooth entrie(s), but no radio adapter — only protocol/" +
                          "enumerator nodes. Nothing can be discovered without a radio.";
                });
            }
            catch (Exception ex)
            {
                Logger.Error("Bluetooth refresh failed", ex);
                System.Windows.Application.Current?.Dispatcher.Invoke(() =>
                {
                    Error = ex.Message;
                    StatusText = "Bluetooth inspection failed.";
                });
            }
        });
    }
}
