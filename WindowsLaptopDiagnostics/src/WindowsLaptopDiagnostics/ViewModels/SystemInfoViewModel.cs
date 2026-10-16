using System;
using System.Collections.ObjectModel;
using System.Threading.Tasks;
using System.Windows.Input;
using WindowsLaptopDiagnostics.Core;
using WindowsLaptopDiagnostics.Infrastructure;
using WindowsLaptopDiagnostics.Services;

namespace WindowsLaptopDiagnostics.ViewModels;

/// <summary>Read-only system inventory. Every row names its source.</summary>
public sealed class SystemInfoViewModel : PageViewModelBase
{
    public SystemInfoViewModel()
    {
        RefreshCommand = new RelayCommand(Refresh);
    }

    public override string Title => "System Information";

    public ObservableCollection<string> Rows { get; } = new();

    private string _statusText = "Reading inventory…";
    public string StatusText { get => _statusText; private set => SetProperty(ref _statusText, value); }

    private string _error = "";
    public string Error { get => _error; private set => SetProperty(ref _error, value); }

    public ICommand RefreshCommand { get; }

    public override void OnActivated() => Refresh();

    private void Refresh()
    {
        Error = "";
        _ = Task.Run(() =>
        {
            try
            {
                var inventory = HardwareService.SystemInventory();
                System.Windows.Application.Current?.Dispatcher.Invoke(() =>
                {
                    Rows.Clear();
                    foreach (var (k, v) in inventory)
                        Rows.Add($"{k,-22}{v}");
                    StatusText = $"{inventory.Count} items read from WMI and Windows APIs.";
                });
            }
            catch (Exception ex)
            {
                Logger.Error("System inventory failed", ex);
                System.Windows.Application.Current?.Dispatcher.Invoke(() =>
                {
                    Error = ex.Message;
                    StatusText = "Inventory read failed.";
                });
            }
        });
    }
}
