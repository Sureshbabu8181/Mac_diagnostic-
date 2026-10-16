using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Management;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Threading.Tasks;
using WindowsLaptopDiagnostics.Infrastructure;

namespace WindowsLaptopDiagnostics.Services;

/// <summary>Where a connectivity failure is localised, based on evidence gathered in order.</summary>
public enum FaultDomain
{
    Healthy,
    NoAdapter,
    NoAddress,
    Router,
    Dns,
    Internet,
    Unknown,
}

/// <summary>One IP-enabled adapter with its addressing.</summary>
public sealed record AdapterInfo(
    string Description,
    string Mac,
    bool Dhcp,
    IReadOnlyList<string> Addresses,
    IReadOnlyList<string> Gateways,
    IReadOnlyList<string> DnsServers,
    string MediaState);

/// <summary>Result of the staged reachability probe.</summary>
public sealed record NetworkProbe(
    FaultDomain Domain,
    string Verdict,
    double? GatewayLatencyMs,
    double? DnsLatencyMs,
    double? InternetLatencyMs,
    IReadOnlyList<string> Evidence);

/// <summary>
/// Network and Bluetooth inspection. Probes are staged — adapter → address →
/// gateway → DNS → internet — so a failure is localised to the smallest scope
/// the evidence actually supports instead of reporting "no internet".
/// </summary>
public static class ConnectivityService
{
    /// <summary>Used for the internet probe only, and only on explicit request.</summary>
    private const string InternetProbeHost = "www.msftconnecttest.com";

    public static List<AdapterInfo> Adapters()
    {
        var list = new List<AdapterInfo>();
        try
        {
            // NetConnectionStatus belongs to Win32_NetworkAdapter, not this class;
            // including it made the whole SELECT fail as "Invalid query" and
            // silently returned an empty adapter list.
            using var searcher = new ManagementObjectSearcher(
                "SELECT Description, MACAddress, DHCPEnabled, IPAddress, DefaultIPGateway, DNSServerSearchOrder " +
                "FROM Win32_NetworkAdapterConfiguration WHERE IPEnabled = TRUE");
            foreach (ManagementObject obj in searcher.Get())
            {
                var addrs = Strings(obj["IPAddress"]);
                var gws = Strings(obj["DefaultIPGateway"]);
                var dns = Strings(obj["DNSServerSearchOrder"]);

                list.Add(new AdapterInfo(
                    obj["Description"]?.ToString() ?? "(unnamed adapter)",
                    obj["MACAddress"]?.ToString() ?? "",
                    bool.TryParse(obj["DHCPEnabled"]?.ToString(), out bool dhcp) && dhcp,
                    addrs, gws, dns,
                    addrs.Count > 0 ? "Has an IP address" : "No IP address"));
            }
        }
        catch (Exception ex) { Logger.Warn("Adapter enumeration failed", ex); }
        return list;
    }

    private static List<string> Strings(object? raw) => raw switch
    {
        null => new List<string>(),
        string[] a => a.Where(s => !string.IsNullOrWhiteSpace(s)).ToList(),
        string s when !string.IsNullOrWhiteSpace(s) => new List<string> { s },
        _ => new List<string>(),
    };

    /// <summary>
    /// Staged probe. Optional stages run only when the caller asks for them, so
    /// opening the app never causes outbound traffic on its own.
    /// </summary>
    public static async Task<NetworkProbe> ProbeAsync(bool includeInternet, bool includeDns)
    {
        var evidence = new List<string>();

        var adapters = Adapters();
        var withAddr = adapters.Where(a => a.Addresses.Count > 0).ToList();

        if (adapters.Count == 0)
        {
            evidence.Add("No IP-enabled adapter reported by Windows.");
            return new NetworkProbe(FaultDomain.NoAdapter,
                "No network adapter is enabled with IP, so no further probe is meaningful.",
                null, null, null, evidence);
        }

        if (withAddr.Count == 0)
        {
            evidence.Add($"{adapters.Count} adapter(s) present but none hold an IP address.");
            return new NetworkProbe(FaultDomain.NoAddress,
                "An adapter is present but has no IP address — check the connection or DHCP lease.",
                null, null, null, evidence);
        }

        evidence.Add($"{withAddr.Count} adapter(s) with an address: " +
                     string.Join(", ", withAddr.Select(a => a.Description)));

        string? gateway = withAddr.SelectMany(a => a.Gateways)
            .FirstOrDefault(g => IPAddress.TryParse(g, out _));
        if (gateway is null)
        {
            evidence.Add("No default gateway configured.");
            return new NetworkProbe(FaultDomain.NoAddress,
                "The adapter has an address but no default gateway, so local configuration is incomplete.",
                null, null, null, evidence);
        }
        evidence.Add($"Gateway {gateway} configured.");

        // Stage 1 — link to the router.
        double? gwMs = await PingAsync(gateway, 3).ConfigureAwait(false);
        if (gwMs is null)
        {
            evidence.Add($"Gateway {gateway} did not answer 3 echo requests.");
            return new NetworkProbe(FaultDomain.Router,
                "The local adapter is configured but the router/gateway does not respond — " +
                "fault is on the local link or the gateway itself.",
                null, null, null, evidence);
        }
        evidence.Add($"Gateway answered in {gwMs:0} ms.");

        double? dnsMs = null;
        if (includeDns)
        {
            // Stage 2 — can the resolver answer? Uses the adapter's own servers.
            var servers = withAddr.SelectMany(a => a.DnsServers)
                .Where(s => IPAddress.TryParse(s, out _)).Distinct().ToList();
            if (servers.Count == 0)
            {
                evidence.Add("No DNS server configured.");
            }
            else
            {
                evidence.Add($"DNS servers: {string.Join(", ", servers)}");
                dnsMs = await MeasureDnsAsync(servers[0]).ConfigureAwait(false);
                if (dnsMs is null)
                {
                    evidence.Add($"DNS server {servers[0]} did not resolve a name.");
                    return new NetworkProbe(FaultDomain.Dns,
                        "The router responds but DNS does not resolve — the fault is in name " +
                        "resolution, not in the link.",
                        gwMs, null, null, evidence);
                }
                evidence.Add($"DNS resolved in {dnsMs:0} ms.");
            }
        }

        if (!includeInternet)
        {
            evidence.Add("Internet probe not requested — skipped by design.");
            return new NetworkProbe(FaultDomain.Healthy,
                "Local link and configuration look healthy. Internet reachability was not probed.",
                gwMs, dnsMs, null, evidence);
        }

        // Stage 3 — beyond the router.
        double? inetMs = await PingAsync("1.1.1.1", 3).ConfigureAwait(false);
        if (inetMs is null)
        {
            evidence.Add("Public address 1.1.1.1 did not answer.");
            return new NetworkProbe(FaultDomain.Internet,
                "Router and DNS respond, but a public address does not — the fault is upstream " +
                "of this network (ISP or wider internet).",
                gwMs, dnsMs, null, evidence);
        }
        evidence.Add($"Public address answered in {inetMs:0} ms.");

        double? webMs = await HttpProbeAsync().ConfigureAwait(false);
        if (webMs is null)
        {
            evidence.Add("HTTP reachability check failed.");
            return new NetworkProbe(FaultDomain.Internet,
                "ICMP reaches the internet but the HTTP endpoint does not — likely a proxy, " +
                "firewall or captive portal in the path.",
                gwMs, dnsMs, inetMs, evidence);
        }
        evidence.Add($"HTTP endpoint reachable in {webMs:0} ms.");

        return new NetworkProbe(FaultDomain.Healthy,
            $"Gateway, DNS and internet all respond (gateway {gwMs:0} ms, DNS {dnsMs:0.#} ms, HTTP {webMs:0} ms).",
            gwMs, dnsMs, webMs, evidence);
    }

    private static async Task<double?> PingAsync(string host, int count)
    {
        try
        {
            using var ping = new Ping();
            var times = new List<double>();
            for (int i = 0; i < count; i++)
            {
                var reply = await ping.SendPingAsync(host, 2000).ConfigureAwait(false);
                if (reply.Status == IPStatus.Success) times.Add(reply.RoundtripTime);
                else return null;
            }
            return Math.Round(times.Average(), 1);
        }
        catch (Exception ex)
        {
            Logger.Info($"Ping {host} failed: {ex.Message}");
            return null;
        }
    }

    private static async Task<double?> MeasureDnsAsync(string server)
    {
        // The BCL resolver always uses the adapter's configured servers, so this
        // measures real resolution through the servers listed on the adapter.
        try
        {
            var sw = Stopwatch.StartNew();
            var resolve = Dns.GetHostAddressesAsync(InternetProbeHost);
            var winner = await Task.WhenAny(resolve, Task.Delay(3000)).ConfigureAwait(false);
            if (winner != resolve) return null;

            sw.Stop();
            var addresses = await resolve.ConfigureAwait(false);
            return addresses.Length > 0 ? sw.Elapsed.TotalMilliseconds : (double?)null;
        }
        catch (Exception ex)
        {
            Logger.Info($"DNS resolution via {server} failed: {ex.Message}");
            return null;
        }
    }

    private static async Task<double?> HttpProbeAsync()
    {
        try
        {
            var sw = Stopwatch.StartNew();
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(6) };
            using var resp = await http.GetAsync(
                $"http://{InternetProbeHost}/connecttest.txt").ConfigureAwait(false);
            sw.Stop();
            return resp.IsSuccessStatusCode ? sw.Elapsed.TotalMilliseconds : (double?)null;
        }
        catch (Exception ex)
        {
            Logger.Info($"HTTP probe failed: {ex.Message}");
            return null;
        }
    }

    // ------------------------------------------------------------------ //
    // Bluetooth
    // ------------------------------------------------------------------ //

    public sealed record BluetoothDevice(string Name, string PnpId, string Status, int ErrorCode);

    public static List<BluetoothDevice> AdaptersAndRadios()
    {
        var list = new List<BluetoothDevice>();
        try
        {
            using var searcher = new ManagementObjectSearcher(
                "SELECT Name, PNPDeviceID, Status, ConfigManagerErrorCode FROM Win32_PnPEntity WHERE PNPClass = 'Bluetooth'");
            foreach (ManagementObject obj in searcher.Get())
            {
                list.Add(new BluetoothDevice(
                    obj["Name"]?.ToString() ?? "(unnamed)",
                    obj["PNPDeviceID"]?.ToString() ?? "",
                    obj["Status"]?.ToString() ?? "Unknown",
                    int.TryParse(obj["ConfigManagerErrorCode"]?.ToString(), out int c) ? c : 0));
            }
        }
        catch (Exception ex) { Logger.Warn("Bluetooth enumeration failed", ex); }

        // A radio is present only if one of these entries is an actual adapter
        // rather than an RFCOMM/protocol endpoint.
        return list;
    }

    /// <summary>True only when a real radio adapter (not a protocol node) is present.</summary>
    public static bool RadioPresent(IEnumerable<BluetoothDevice> devices) =>
        devices.Any(d =>
            !d.PnpId.StartsWith("BTH", StringComparison.OrdinalIgnoreCase) &&
            d.Name.Contains("Bluetooth", StringComparison.OrdinalIgnoreCase) &&
            !d.Name.Contains("RFCOMM", StringComparison.OrdinalIgnoreCase) &&
            !d.Name.Contains("Protocol", StringComparison.OrdinalIgnoreCase) &&
            !d.Name.Contains("Enumerator", StringComparison.OrdinalIgnoreCase));

    public static string DiscoveryRequirement() =>
        "Pairing and discovery require the Windows *Bluetooth* permission plus Location services. " +
        "If permission was denied the result is reported as Permission Required, never as " +
        "'no devices found'.";
}
