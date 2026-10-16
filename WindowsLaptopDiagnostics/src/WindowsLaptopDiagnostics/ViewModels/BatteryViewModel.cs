using System;
using System.Threading.Tasks;
using System.Windows.Input;
using WindowsLaptopDiagnostics.Core;
using WindowsLaptopDiagnostics.Infrastructure;
using WindowsLaptopDiagnostics.Services;

namespace WindowsLaptopDiagnostics.ViewModels;

/// <summary>
/// Battery status. Wear is shown only when both design and full-charge
/// capacities are actually exposed; otherwise it reads `Unavailable` with the
/// reason, and is never estimated from the current charge level.
/// </summary>
public sealed class BatteryViewModel : PageViewModelBase
{
    public BatteryViewModel()
    {
        RefreshCommand = new RelayCommand(Refresh);
    }

    public override string Title => "Battery & Charging";

    private string _charge = "reading…";
    public string Charge { get => _charge; private set => SetProperty(ref _charge, value); }

    private double _chargePercent;
    public double ChargePercent { get => _chargePercent; private set => SetProperty(ref _chargePercent, value); }

    private string _sourceState = "";
    public string SourceState { get => _sourceState; private set => SetProperty(ref _sourceState, value); }

    private string _designValue = "reading…";
    public string DesignValue { get => _designValue; private set => SetProperty(ref _designValue, value); }

    private string _fullValue = "reading…";
    public string FullValue { get => _fullValue; private set => SetProperty(ref _fullValue, value); }

    private string _wearValue = "reading…";
    public string WearValue { get => _wearValue; private set => SetProperty(ref _wearValue, value); }

    private bool _wearAvailable;
    /// <summary>False when wear cannot be computed — the UI must not imply a figure.</summary>
    public bool WearAvailable { get => _wearAvailable; private set => SetProperty(ref _wearAvailable, value); }

    private string _wearDetail = "";
    public string WearDetail { get => _wearDetail; private set => SetProperty(ref _wearDetail, value); }

    private string _wearNoteTitle = "Wear calculation";
    public string WearNoteTitle { get => _wearNoteTitle; private set => SetProperty(ref _wearNoteTitle, value); }

    private string _wearNote = "";
    /// <summary>
    /// Explains the wear figure, or why there is one. Written from the actual
    /// reading so it can never contradict the numbers shown beside it.
    /// </summary>
    public string WearNote { get => _wearNote; private set => SetProperty(ref _wearNote, value); }

    private string _statusText = "Reading power status…";
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
                var b = HardwareService.Battery();

                System.Windows.Application.Current?.Dispatcher.Invoke(() =>
                {
                    ChargePercent = b.ChargePercent;
                    Charge = $"{b.ChargePercent} %";
                    SourceState = b.OnAc
                        ? (b.Charging ? "On AC — charging" : "On AC — not charging")
                        : (b.Charging ? "On battery — charging" : "On battery");

                    DesignValue = b.DesignMwH is { } d ? $"{d:0} mWh" : "Unavailable";
                    FullValue = b.FullChargeMwH is { } f ? $"{f:0} mWh" : "Unavailable";

                    WearAvailable = b.WearPercent is not null;
                    WearValue = b.WearPercent is { } w ? $"{w:0.#} %" : "Unavailable";
                    WearDetail = b.DesignDetail;

                    if (b.WearPercent is { } wearNow && b.DesignMwH is { } designNow && b.FullChargeMwH is { } fullNow)
                    {
                        WearNoteTitle = "How wear was calculated";
                        WearNote =
                            $"Wear = (design {designNow:0} mWh − full charge {fullNow:0} mWh) ÷ design {designNow:0} mWh = {wearNow:0.#} %. " +
                            "Both figures were read from the battery firmware, so this is a measured value, not " +
                            "an estimate. A single sample still says nothing about cycle count, temperature " +
                            "history, or how the battery behaves under load — treat it as one indicator among " +
                            "several, not a verdict on its own.";
                    }
                    else
                    {
                        WearNoteTitle = "Why wear is unavailable";
                        WearNote =
                            "Wear needs two real numbers: the capacity the battery shipped with and the " +
                            "capacity it holds now. " + b.DesignDetail +
                            " It is never estimated from the current charge level — 95 % charge says nothing " +
                            "about how much the battery has aged.";
                    }

                    StatusText = b.DesignMwH is null
                        ? "Charge and power source are real readings. Wear cannot be calculated on this machine."
                        : "Charge, power source and capacities read from Windows.";
                });
            }
            catch (Exception ex)
            {
                Logger.Error("Battery refresh failed", ex);
                System.Windows.Application.Current?.Dispatcher.Invoke(() =>
                {
                    Error = ex.Message;
                    StatusText = "Battery inspection failed.";
                });
            }
        });
    }
}
