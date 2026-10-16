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
/// Read-only Windows and driver health: device problem codes, servicing state
/// and which remediation steps would need administrator rights. No repair action
/// is ever executed by this page.
/// </summary>
public sealed class WindowsHealthViewModel : PageViewModelBase
{
    public WindowsHealthViewModel()
    {
        RefreshCommand = new RelayCommand(Refresh);
    }

    public override string Title => "Windows & Driver Health";

    public ObservableCollection<string> Problems { get; } = new();
    public ObservableCollection<string> Servicing { get; } = new();

    private string _deviceSummary = "reading…";
    public string DeviceSummary { get => _deviceSummary; private set => SetProperty(ref _deviceSummary, value); }

    private bool _healthy;
    public bool Healthy { get => _healthy; private set => SetProperty(ref _healthy, value); }

    private string _build = "reading…";
    public string Build { get => _build; private set => SetProperty(ref _build, value); }

    private string _statusText = "Reading device state…";
    public string StatusText { get => _statusText; private set => SetProperty(ref _statusText, value); }

    private string _adminNote = "";
    /// <summary>Lists what would need elevation, without performing any of it.</summary>
    public string AdminNote { get => _adminNote; private set => SetProperty(ref _adminNote, value); }

    private string _error = "";
    public string Error { get => _error; private set => SetProperty(ref _error, value); }

    public ICommand RefreshCommand { get; }

    public override void OnActivated()
    {
        AdminNote =
            "Read-only inspection. Driver reinstall, service restart, DISM/SFC repair and Windows " +
            "Update changes are NOT performed here — several need administrator rights and can " +
            "alter the system. They are listed as recommendations only.";
        Refresh();
    }

    private void Refresh()
    {
        Error = "";
        _ = Task.Run(() =>
        {
            try
            {
                var problems = HardwareService.DriverProblems();
                var (build, install, hotfixCount, hotfixes, detail) = HardwareService.ServicingState();

                int stopped = problems.Count(p => HardwareService.IsDeviceStopped(p.Code));
                bool needAdmin = stopped > 0;

                System.Windows.Application.Current?.Dispatcher.Invoke(() =>
                {
                    Problems.Clear();
                    if (problems.Count == 0)
                    {
                        int total = 0;
                        try
                        {
                            using var searcher = new System.Management.ManagementObjectSearcher(
                                "SELECT DeviceID FROM Win32_PnPEntity");
                            foreach (System.Management.ManagementObject _ in searcher.Get()) total++;
                        }
                        catch { /* reported as unknown below */ }
                        Problems.Add(total > 0
                            ? $"All {total} enumerated devices report ConfigManagerErrorCode = 0."
                            : "No device problem codes found (device count unavailable).");
                        Healthy = true;
                    }
                    else
                    {
                        foreach (var (name, cls, code, meaning) in problems)
                        {
                            Problems.Add(name);
                            Problems.Add($"    class {cls} · error {code}");
                            Problems.Add($"    {meaning}");
                            Problems.Add("");
                        }
                        Healthy = problems.Count(p => HardwareService.IsDeviceStopped(p.Code)) == 0;
                    }

                    DeviceSummary = problems.Count == 0
                        ? "No device reports a driver problem."
                        : $"{problems.Count} device(s) with a problem code, {stopped} of them stopped/disabled.";

                    Build = $"Build {build}";
                    Servicing.Clear();
                    Servicing.Add(install.Length > 0 ? $"Windows install date   {install}" : "Windows install date   Unavailable");
                    Servicing.Add($"Reported build         {build}");
                    Servicing.Add($"Updates via WMI        {hotfixCount}");
                    Servicing.Add("");
                    Servicing.Add(detail);
                    foreach (var h in hotfixes.Take(12)) Servicing.Add($"    {h}");
                    if (hotfixes.Count > 12) Servicing.Add($"    … {hotfixCount - 12} more");

                    StatusText = needAdmin
                        ? "Some devices are stopped — resolving that typically requires administrator rights."
                        : "Device and servicing state read (nothing was changed).";
                });
            }
            catch (Exception ex)
            {
                Logger.Error("Windows health refresh failed", ex);
                System.Windows.Application.Current?.Dispatcher.Invoke(() =>
                {
                    Error = ex.Message;
                    StatusText = "Windows health inspection failed.";
                });
            }
        });
    }
}
