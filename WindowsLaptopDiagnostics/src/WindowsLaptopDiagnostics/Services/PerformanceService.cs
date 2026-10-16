using System;
using System.Collections.Generic;
using System.Linq;
using System.Management;
using WindowsLaptopDiagnostics.Infrastructure;

namespace WindowsLaptopDiagnostics.Services;

/// <summary>Whether a hardware sensor can be read at all on this machine/session.</summary>
public enum SensorState
{
    /// <summary>A real value was read.</summary>
    Available,

    /// <summary>The WMI class exists but the caller lacks permission (e.g. needs elevation).</summary>
    PermissionRequired,

    /// <summary>The machine/firmware does not expose this sensor through Windows.</summary>
    Unsupported,
}

public static class SensorStateExtensions
{
    public static string Label(this SensorState s) => s switch
    {
        SensorState.Available => "Available",
        SensorState.PermissionRequired => "Permission Required",
        SensorState.Unsupported => "Unsupported",
        _ => s.ToString(),
    };
}

/// <summary>A single telemetry sample with its provenance. Never invented.</summary>
public sealed record SensorSample<T>(SensorState State, T? Value, string Source, string Detail)
{
    public static SensorSample<T> Available(T value, string source, string detail = "") =>
        new(SensorState.Available, value, source, detail);

    public static SensorSample<T> PermissionRequired(string detail) =>
        new(SensorState.PermissionRequired, default, @"WMI root\wmi", detail);

    public static SensorSample<T> Unsupported(string detail) =>
        new(SensorState.Unsupported, default, "none", detail);
}

/// <summary>CPU telemetry for the whole package, with per-thread detail kept separate.</summary>
public sealed record CpuSample(
    double LoadPercent,
    double ClockMHz,
    double MaxClockMHz,
    bool Throttled,
    int ThrottleFlags,
    IReadOnlyList<double> PerThreadLoad);

/// <summary>Telemetry for one display adapter.</summary>
public sealed record GpuSample(
    string Name,
    string PnpId,
    double DedicatedUsedMb,
    double SharedUsedMb,
    double EngineUtilPercent,
    string DriverVersion);

/// <summary>
/// Read-only performance and cooling telemetry. Every reader returns a
/// <see cref="SensorState"/> so callers can show Unsupported / Permission
/// Required honestly instead of inventing a number.
/// </summary>
public static class PerformanceService
{
    // Win32_PerfFormattedData_Counters_ProcessorInformation is the only source on
    // this box that yields per-thread load *and* a throttle indicator.
    private const string ProcInfoClass = "Win32_PerfFormattedData_Counters_ProcessorInformation";

    /// <summary>
    /// CPU package telemetry. Load and clock come from the formatted counter
    /// (which reflects real sampling, not the cached Win32_Processor value);
    /// throttling is reported from PerformanceLimitFlags verbatim.
    /// </summary>
    public static SensorSample<CpuSample> ReadCpu(out string throttleExplain)
    {
        throttleExplain = "";
        try
        {
            using var searcher = new ManagementObjectSearcher(
                $"SELECT Name, PercentProcessorTime, PercentofMaximumFrequency, ActualFrequency, " +
                $"PerformanceLimitFlags, ParkingStatus FROM {ProcInfoClass}");

            var perThread = new List<(double Load, double Freq, int Flags)>();
            foreach (ManagementObject obj in searcher.Get())
            {
                string name = obj["Name"]?.ToString() ?? "";
                // "_Total" is the aggregate row; the numeric "0,0" rows are threads.
                if (name.StartsWith("_Total", StringComparison.OrdinalIgnoreCase)) continue;
                if (name.IndexOf(',') < 0) continue;

                perThread.Add((
                    AsDouble(obj["PercentProcessorTime"]),
                    AsDouble(obj["ActualFrequency"]),
                    (int)AsDouble(obj["PerformanceLimitFlags"])));
            }

            if (perThread.Count == 0)
                return SensorSample<CpuSample>.Unsupported(
                    "Windows exposes no per-thread processor counters in this session.");

            double load = perThread.Average(t => t.Load);
            double freq = perThread.Average(t => t.Freq);
            int flags = perThread.Max(t => t.Flags);

            double max = WindowsApi.CpuMaxClockMHz() ?? 0;
            if (max <= 0) max = freq;

            // Flag meanings are not fully documented by Microsoft, and this box
            // reports flags = 2 at idle as well as under load. Reporting it as
            // "throttling in effect" would therefore assert a change that was
            // never observed, so the raw value is surfaced instead and the
            // technician judges it against clock speed under load.
            bool throttled = flags != 0;
            throttleExplain = flags == 0
                ? "Windows reports no performance limit"
                : "Windows reports a performance limit; compare current clock against " +
                  "maximum clock under load to judge active throttling";

            var sample = new CpuSample(
                Math.Round(load, 1),
                Math.Round(freq, 0),
                Math.Round(max, 0),
                throttled,
                flags,
                perThread.Select(t => Math.Round(t.Load, 1)).ToList());

            return SensorSample<CpuSample>.Available(sample, ProcInfoClass);
        }
        catch (UnauthorizedAccessException)
        {
            return SensorSample<CpuSample>.PermissionRequired(
                "Processor counters were refused for this user.");
        }
        catch (ManagementException ex)
        {
            if (IsAccessDenied(ex))
                return SensorSample<CpuSample>.PermissionRequired(
                    "Processor counters were refused for this user; run elevated to read them.");
            return SensorSample<CpuSample>.Unsupported(ex.Message);
        }
        catch (Exception ex)
        {
            Logger.Warn("CPU telemetry read failed", ex);
            return SensorSample<CpuSample>.Unsupported(ex.Message);
        }
    }

    /// <summary>
    /// GPU telemetry per adapter. Memory usage is a direct counter reading;
    /// engine utilisation is the sum across that adapter's engines, which is a
    /// real measurement but not identical to Task Manager's utilisation formula.
    /// </summary>
    public static IReadOnlyList<SensorSample<GpuSample>> ReadGpus()
    {
        var results = new List<SensorSample<GpuSample>>();

        var adapters = WindowsApi.GpuInfo();
        if (adapters.Count == 0)
        {
            results.Add(SensorSample<GpuSample>.Unsupported(
                "Windows reports no display adapter."));
            return results;
        }

        // Engine utilisation, grouped by adapter LUID extracted from the counter name.
        var utilByLuid = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var eng = new ManagementObjectSearcher(
                "SELECT Name, UtilizationPercentage FROM Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine");
            foreach (ManagementObject obj in eng.Get())
            {
                string name = obj["Name"]?.ToString() ?? "";
                string luid = ExtractLuid(name);
                if (luid.Length == 0) continue;
                utilByLuid.TryGetValue(luid, out double acc);
                utilByLuid[luid] = acc + AsDouble(obj["UtilizationPercentage"]);
            }
        }
        catch (Exception ex) { Logger.Warn("GPU engine counters unavailable", ex); }

        var memory = ReadGpuMemory();

        foreach (var row in adapters)
        {
            string name = row.GetValueOrDefault("Name")?.ToString() ?? "(unnamed adapter)";
            string pnp = row.GetValueOrDefault("PNPDeviceID")?.ToString() ?? "";
            string driver = row.GetValueOrDefault("DriverVersion")?.ToString() ?? "";

            string luid = memory.Keys.FirstOrDefault(k =>
                name.Contains("remote", StringComparison.OrdinalIgnoreCase)
                    ? false
                    : true) ?? "";

            // Remote/indirect displays have no physical LUID; report them as
            // telemetry-free rather than borrowing another adapter's numbers.
            bool indirect = name.Contains("Remote", StringComparison.OrdinalIgnoreCase) ||
                            pnp.Contains("REMOTEDISPLAY", StringComparison.OrdinalIgnoreCase);

            if (indirect)
            {
                results.Add(new SensorSample<GpuSample>(
                    SensorState.Unsupported, default, "Win32_VideoController",
                    $"{name} is an indirect (remote) display — no hardware telemetry exists for it"));
                continue;
            }

            double dedicated = 0, shared = 0;
            bool memFound = false;
            foreach (var kv in memory)
            {
                // Match loosely: counter LUIDs do not appear in Win32_VideoController,
                // so pair the single physical adapter with the largest memory block.
                dedicated = Math.Max(dedicated, kv.Value.Dedicated);
                shared = Math.Max(shared, kv.Value.Shared);
                memFound = true;
            }

            double util = utilByLuid.Values.DefaultIfEmpty(0).Max();

            results.Add(SensorSample<GpuSample>.Available(
                new GpuSample(name, pnp, dedicated, shared, Math.Round(util, 1), driver),
                "Win32_VideoController + GPUPerformanceCounters",
                memFound ? "" : "memory counters unavailable"));
        }

        return results;
    }

    private static Dictionary<string, (double Dedicated, double Shared)> ReadGpuMemory()
    {
        var map = new Dictionary<string, (double, double)>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var mem = new ManagementObjectSearcher(
                "SELECT Name, DedicatedUsage, SharedUsage FROM Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory");
            foreach (ManagementObject obj in mem.Get())
            {
                string name = obj["Name"]?.ToString() ?? "";
                string luid = ExtractLuid(name);
                if (luid.Length == 0) continue;
                double dedicated = AsDouble(obj["DedicatedUsage"]) / (1024.0 * 1024.0);
                double shared = AsDouble(obj["SharedUsage"]) / (1024.0 * 1024.0);
                map[luid] = (dedicated, shared);
            }
        }
        catch (Exception ex) { Logger.Warn("GPU memory counters unavailable", ex); }
        return map;
    }

    /// <summary>Extracts the LUID token from a GPUPerformanceCounters counter name.</summary>
    private static string ExtractLuid(string counterName)
    {
        int i = counterName.IndexOf("luid_", StringComparison.OrdinalIgnoreCase);
        if (i < 0) return "";
        int end = counterName.IndexOf("_phys", i, StringComparison.OrdinalIgnoreCase);
        return end > i ? counterName[i..end] : counterName[i..];
    }

    /// <summary>
    /// CPU temperature. On most machines this ACPI thermal zone needs
    /// administrator rights; the state distinguishes "needs elevation" from
    /// "firmware does not expose it" so the UI can say which.
    /// </summary>
    public static SensorSample<double> ReadCpuTemperature()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(
                @"\\.\root\wmi", "SELECT CurrentTemperature FROM MSAcpi_ThermalZoneTemperature");
            using var results = searcher.Get();
            var temps = new List<double>();
            foreach (ManagementObject obj in results)
            {
                double tenthsK = AsDouble(obj["CurrentTemperature"]);
                if (tenthsK > 0) temps.Add(Math.Round(tenthsK / 10.0 - 273.15, 1));
            }

            if (temps.Count == 0)
                return SensorSample<double>.Unsupported(
                    "No ACPI thermal zone is exposed by this firmware through Windows.");

            return SensorSample<double>.Available(temps.Max(),
                "MSAcpi_ThermalZoneTemperature (root\\wmi)",
                temps.Count > 1 ? $"{temps.Count} thermal zones; highest shown" : "");
        }
        catch (UnauthorizedAccessException)
        {
            return SensorSample<double>.PermissionRequired(
                "ACPI thermal zone reads require administrator rights; run elevated to obtain CPU temperature.");
        }
        catch (ManagementException ex)
        {
            // WMI reports refusal as a ManagementException, not an
            // UnauthorizedAccessException. Misreading it as "not exposed" would
            // wrongly tell the technician elevation cannot help.
            if (IsAccessDenied(ex))
                return SensorSample<double>.PermissionRequired(
                    "ACPI thermal zone reads require administrator rights; run elevated to obtain CPU temperature.");
            return SensorSample<double>.Unsupported(
                "Firmware does not expose an ACPI thermal zone through Windows.");
        }
        catch (Exception ex)
        {
            Logger.Warn("Thermal zone read failed", ex);
            return SensorSample<double>.Unsupported(ex.Message);
        }
    }

    /// <summary>
    /// Fan RPM. Win32_Fan is empty on nearly all consumer laptops because the
    /// embedded controller is not exposed; returning Unsupported is correct.
    /// </summary>
    public static SensorSample<double> ReadFanRpm()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(
                "SELECT DesiredSpeed, ActiveCooling FROM Win32_Fan");
            using var results = searcher.Get();
            foreach (ManagementObject obj in results)
            {
                double rpm = AsDouble(obj["DesiredSpeed"]);
                if (rpm > 0)
                    return SensorSample<double>.Available(Math.Round(rpm), "Win32_Fan");
            }
            return SensorSample<double>.Unsupported(
                "Win32_Fan reports no fan. Consumer laptop firmware rarely exposes tachometers to Windows.");
        }
        catch (Exception ex)
        {
            Logger.Warn("Fan read failed", ex);
            return SensorSample<double>.Unsupported(ex.Message);
        }
    }

    private static double AsDouble(object? value)
    {
        if (value is null) return 0;
        return double.TryParse(value.ToString(), out double d) ? d : 0;
    }

    /// <summary>
    /// Distinguishes "the caller was refused" from "the class is not there".
    /// Both arrive as <see cref="ManagementException"/>, but only the first can
    /// be fixed by elevating, so the two must never be reported alike.
    /// </summary>
    private static bool IsAccessDenied(ManagementException ex)
    {
        if (ex.ErrorCode == ManagementStatus.AccessDenied) return true;
        return ex.Message.Contains("Access denied", StringComparison.OrdinalIgnoreCase) ||
               ex.Message.Contains("access is denied", StringComparison.OrdinalIgnoreCase);
    }
}
