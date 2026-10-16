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

/// <summary>
/// USB controller and device enumeration, plus a guided manual check.
///
/// Detection evidence (what Windows reports) is kept strictly separate from the
/// manual checks the technician must confirm by hand; a manual check is never
/// merged into an automatic pass.
/// </summary>
public sealed class UsbViewModel : PageViewModelBase
{
    public UsbViewModel()
    {
        RefreshCommand = new RelayCommand(Refresh);
        ResetManualCommand = new RelayCommand(ResetManual, () => ManualDone > 0);
    }

    public override string Title => "USB & External Ports";

    public ObservableCollection<string> Devices { get; } = new();

    /// <summary>The guided manual checklist. Items start unchecked.</summary>
    public ObservableCollection<ManualCheck> Checks { get; } = new();

    private string _statusText = "Enumerating USB…";
    public string StatusText { get => _statusText; private set => SetProperty(ref _statusText, value); }

    private int _deviceCount;
    public int DeviceCount { get => _deviceCount; private set => SetProperty(ref _deviceCount, value); }

    private int _problemCount;
    public int ProblemCount { get => _problemCount; private set => SetProperty(ref _problemCount, value); }

    private int _manualDone;
    public int ManualDone { get => _manualDone; private set { if (SetProperty(ref _manualDone, value)) RaiseCommands(); } }

    private string _evidenceSummary = "";
    /// <summary>Explicitly labelled as detection evidence only.</summary>
    public string EvidenceSummary { get => _evidenceSummary; private set => SetProperty(ref _evidenceSummary, value); }

    private string _manualSummary = "";
    public string ManualSummary { get => _manualSummary; private set => SetProperty(ref _manualSummary, value); }

    private string _error = "";
    public string Error { get => _error; private set => SetProperty(ref _error, value); }

    public ICommand RefreshCommand { get; }
    public ICommand ResetManualCommand { get; }

    public sealed class ManualCheck : ObservableObject
    {
        private bool _done;
        public string Text { get; }
        public ManualCheck(string text) => Text = text;
        public bool Done
        {
            get => _done;
            set => SetProperty(ref _done, value);
        }
    }

    public override void OnActivated()
    {
        if (Checks.Count == 0)
        {
            Checks.Add(new ManualCheck("Known-good USB device is detected when plugged into the port under test."));
            Checks.Add(new ManualCheck("Device appears in Windows Explorer / Disk Management, not just in Device Manager."));
            Checks.Add(new ManualCheck("Data transfer completes without errors (copy a file both ways)."));
            Checks.Add(new ManualCheck("Device is ejected cleanly and re-plugged without a reconnect failure."));
            Checks.Add(new ManualCheck("Port holds the device physically (no loose fit, no drop-out on movement)."));
            foreach (var c in Checks)
                c.PropertyChanged += (_, _) => UpdateManualSummary();
        }
        Refresh();
    }

    private void UpdateManualSummary()
    {
        ManualDone = Checks.Count(c => c.Done);
        ManualSummary = Checks.Count(c => c.Done) == 0
            ? "No manual check confirmed yet — nothing is treated as passing."
            : $"{ManualDone} of {Checks.Count} manual checks confirmed by you.";
    }

    private void ResetManual()
    {
        foreach (var c in Checks) c.Done = false;
        UpdateManualSummary();
    }

    private void Refresh()
    {
        Error = "";
        _ = Task.Run(() =>
        {
            try
            {
                var usb = HardwareService.UsbInventory();
                int problems = usb.Count(d => d.ErrorCode != 0);

                var rows = new List<string>();
                foreach (var d in usb)
                {
                    rows.Add(d.Name);
                    rows.Add($"    {d.Id}");
                    rows.Add(d.ErrorCode == 0
                        ? $"    {d.Status} · no problem reported"
                        : $"    {d.Status} · error {d.ErrorCode}: {HardwareService.DescribePnpError(d.ErrorCode)}");
                    rows.Add("");
                }

                System.Windows.Application.Current?.Dispatcher.Invoke(() =>
                {
                    Devices.Clear();
                    foreach (var r in rows) Devices.Add(r);

                    DeviceCount = usb.Count;
                    ProblemCount = problems;

                    if (usb.Count == 0)
                    {
                        StatusText = "Windows reports no USB devices or controllers.";
                        EvidenceSummary = "No detection evidence available.";
                    }
                    else
                    {
                        StatusText = $"{usb.Count} USB device(s) and controller(s) enumerated.";
                        EvidenceSummary = problems == 0
                            ? $"Detection evidence: {usb.Count} USB entr(ies) reported by Windows, none with a " +
                              "driver problem code. This proves Windows sees them — it does not prove a port " +
                              "transfers data correctly."
                            : $"Detection evidence: {problems} of {usb.Count} USB entr(ies) report a problem code.";
                    }
                    UpdateManualSummary();
                });
            }
            catch (Exception ex)
            {
                Logger.Error("USB enumeration failed", ex);
                System.Windows.Application.Current?.Dispatcher.Invoke(() =>
                {
                    Error = ex.Message;
                    StatusText = "USB inspection failed.";
                });
            }
        });
    }

    private void RaiseCommands() =>
        (ResetManualCommand as RelayCommand)?.RaiseCanExecuteChanged();
}
