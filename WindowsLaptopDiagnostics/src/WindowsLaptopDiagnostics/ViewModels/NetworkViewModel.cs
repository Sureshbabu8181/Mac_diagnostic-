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
/// Network inspection. Adapter addressing is read immediately on activation;
/// the gateway / DNS / internet probes run only when the technician asks, so
/// merely opening the page causes no outbound traffic.
/// </summary>
public sealed class NetworkViewModel : PageViewModelBase
{
    public NetworkViewModel()
    {
        RefreshCommand = new RelayCommand(Refresh);
        LocalCheckCommand = new AsyncRelayCommand(() => Probe(false), () => !IsProbing);
        FullCheckCommand = new AsyncRelayCommand(() => Probe(true), () => !IsProbing);
    }

    public override string Title => "Wi-Fi & Network";

    public ObservableCollection<string> Adapters { get; } = new();
    public ObservableCollection<string> Evidence { get; } = new();

    private string _statusText = "Reading adapters…";
    public string StatusText { get => _statusText; private set => SetProperty(ref _statusText, value); }

    private string _verdict = "";
    public string Verdict { get => _verdict; private set => SetProperty(ref _verdict, value); }

    private string _domain = "";
    /// <summary>Where the fault was localised, or "none found".</summary>
    public string Domain { get => _domain; private set => SetProperty(ref _domain, value); }

    private string _latencyText = "";
    public string LatencyText { get => _latencyText; private set => SetProperty(ref _latencyText, value); }

    private bool _isProbing;
    public bool IsProbing
    {
        get => _isProbing;
        private set { if (SetProperty(ref _isProbing, value)) RaiseCommands(); }
    }

    private string _error = "";
    public string Error { get => _error; private set => SetProperty(ref _error, value); }

    private bool _localTrafficAllowed = true;
    /// <summary>Gateway ping stays inside the LAN; gated so the UI is explicit.</summary>
    public bool LocalTrafficAllowed
    {
        get => _localTrafficAllowed;
        set { if (SetProperty(ref _localTrafficAllowed, value)) RaiseCommands(); }
    }

    private bool _internetTrafficAllowed;
    /// <summary>Off by default — the internet probe only runs when enabled.</summary>
    public bool InternetTrafficAllowed
    {
        get => _internetTrafficAllowed;
        set { if (SetProperty(ref _internetTrafficAllowed, value)) RaiseCommands(); }
    }

    public ICommand RefreshCommand { get; }
    public ICommand LocalCheckCommand { get; }
    public ICommand FullCheckCommand { get; }

    public override void OnActivated()
    {
        Verdict = "";
        Domain = "";
        LatencyText = "";
        Evidence.Clear();
        StatusText = "Reading adapter configuration. No traffic has been sent yet.";
        Refresh();
    }

    private void Refresh()
    {
        Error = "";
        _ = Task.Run(() =>
        {
            var adapters = ConnectivityService.Adapters();
            System.Windows.Application.Current?.Dispatcher.Invoke(() =>
            {
                Adapters.Clear();
                if (adapters.Count == 0)
                {
                    Adapters.Add("No IP-enabled adapter reported by Windows.");
                    StatusText = "No adapter holds an IP address.";
                    return;
                }

                foreach (var a in adapters)
                {
                    Adapters.Add($"{a.Description}");
                    Adapters.Add($"    MAC   {a.Mac}   DHCP {(a.Dhcp ? "on" : "off")}");
                    Adapters.Add($"    IP    {(a.Addresses.Count > 0 ? string.Join(", ", a.Addresses) : "none")}");
                    Adapters.Add($"    Gate  {(a.Gateways.Count > 0 ? string.Join(", ", a.Gateways) : "none")}");
                    Adapters.Add($"    DNS   {(a.DnsServers.Count > 0 ? string.Join(", ", a.DnsServers) : "none")}");
                    Adapters.Add("");
                }
                StatusText = $"{adapters.Count} adapter(s) with IP read from Windows.";
            });
        });
    }

    private async Task Probe(bool includeInternet)
    {
        if (IsProbing) return;

        // Guard on the actual flags rather than trusting the button alone.
        bool wantInternet = includeInternet && InternetTrafficAllowed;
        bool wantLocal = LocalTrafficAllowed || wantInternet;

        IsProbing = true;
        Error = "";
        Evidence.Clear();
        Verdict = "Running staged probe…";
        Domain = "—";
        StatusText = wantInternet
            ? "Probing gateway, DNS and internet…"
            : wantLocal ? "Probing gateway…" : "Local traffic disabled — reading configuration only.";

        try
        {
            if (!wantLocal)
            {
                Domain = "Not probed";
                Verdict = "No probe sent. Enable local traffic to test the gateway, or the internet option to go further.";
                StatusText = "Configuration only.";
                return;
            }

            var probe = await ConnectivityService.ProbeAsync(wantInternet, wantLocal);

            foreach (var e in probe.Evidence) Evidence.Add(e);

            Verdict = probe.Verdict;
            Domain = probe.Domain switch
            {
                FaultDomain.Healthy => "No fault found",
                FaultDomain.NoAdapter => "No adapter",
                FaultDomain.NoAddress => "Local configuration",
                FaultDomain.Router => "Router / local link",
                FaultDomain.Dns => "DNS",
                FaultDomain.Internet => "Upstream of this network",
                _ => "Undetermined",
            };
            LatencyText =
                $"gateway {probe.GatewayLatencyMs?.ToString("0") ?? "—"} ms · " +
                $"DNS {probe.DnsLatencyMs?.ToString("0.#") ?? "—"} ms · " +
                $"internet {probe.InternetLatencyMs?.ToString("0") ?? "—"} ms";
            StatusText = "Probe complete.";
        }
        catch (Exception ex)
        {
            Logger.Error("Network probe failed", ex);
            Error = ex.Message;
            Verdict = "The probe failed before a verdict could be reached.";
            StatusText = "Probe failed.";
        }
        finally
        {
            IsProbing = false;
        }
    }

    private void RaiseCommands()
    {
        (LocalCheckCommand as RelayCommand)?.RaiseCanExecuteChanged();
        (FullCheckCommand as RelayCommand)?.RaiseCanExecuteChanged();
    }
}
