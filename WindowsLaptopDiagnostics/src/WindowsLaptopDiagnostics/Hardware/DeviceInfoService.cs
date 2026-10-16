using System;
using System.Collections.Generic;
using System.Linq;
using WindowsLaptopDiagnostics.Core;
using WindowsLaptopDiagnostics.Services;

namespace WindowsLaptopDiagnostics.Hardware;

/// <summary>A detected GPU adapter (real values, null when unsupported).</summary>
public sealed record GpuInfo(string Name, double? VramGb, string? DriverVersion, string? Resolution, int? RefreshHz);

/// <summary>A storage drive (real values).</summary>
public sealed record DiskInfo(string Model, string? Interface, double? SizeGb, string? Serial, string? Status);

/// <summary>
/// Snapshots the device inventory from real Windows APIs. Every field degrades
/// to a clear "Unsupported"/"Unavailable" label rather than fabricating a value.
/// </summary>
public sealed class DeviceInfoService
{
    public const string Unsupported = "Unsupported";
    public const string Unavailable = "Unavailable";

    private static readonly string[] SerialPlaceholders =
        { "to be filled by o.e.m.", "system serial number", "default string", "none", "0" };

    public string Manufacturer => Safe(() => WindowsApi.Manufacturer() ?? Unavailable);
    public string Model => Safe(() => WindowsApi.Model() ?? Unavailable);
    public string SerialNumber
    {
        get
        {
            var s = WindowsApi.SerialNumber();
            if (string.IsNullOrWhiteSpace(s)) return Unavailable;
            return SerialPlaceholders.Contains(s.ToLowerInvariant()) ? Unavailable : s;
        }
    }

    public string CpuName => Safe(() => WindowsApi.CpuName() ?? Unavailable);

    public string CpuTopology
    {
        get
        {
            var t = WindowsApi.CpuTopology();
            return t is { } x ? $"{x.Cores} cores / {x.Threads} threads" : Unavailable;
        }
    }

    public int LogicalProcessors => WindowsApi.CpuTopology()?.Threads ?? Environment.ProcessorCount;

    public string OsCaption => Safe(() => WindowsApi.OsCaption() ?? $"Windows {Environment.OSVersion.Version.Major}.{Environment.OSVersion.Version.Minor}");
    public string OsBuild => Safe(() => WindowsApi.OsBuild() ?? Unavailable);
    public string Architecture => Environment.Is64BitOperatingSystem ? "64-bit" : "32-bit";
    public string BiosVersion => Safe(() => WindowsApi.BiosVersion() ?? Unavailable);
    public string Baseboard => Safe(() => WindowsApi.BaseboardProduct() ?? Unavailable);
    public string ComputerName => Environment.MachineName;

    public string Uptime
    {
        get
        {
            var s = WindowsApi.UptimeSeconds();
            if (s is null) return Unavailable;
            var ts = TimeSpan.FromSeconds(s.Value);
            return ts.Days > 0 ? $"{ts.Days}d {ts.Hours}h" : $"{ts.Hours}h {ts.Minutes}m";
        }
    }

    /// <summary>Live memory snapshot (total / available GB / used %).</summary>
    public (double TotalGb, double AvailableGb, double UsedPercent) Memory()
    {
        var m = WindowsApi.MemoryStatus();
        if (m is null) return (0, 0, 0);
        return m.Value;
    }

    /// <summary>Power/battery state; Present=false when no battery.</summary>
    public (bool Present, bool OnAc, bool Charging, int ChargePercent) Power()
    {
        var p = WindowsApi.PowerStatus();
        if (p is null) return (false, false, false, -1);
        return p.Value;
    }

    public List<GpuInfo> Gpus()
    {
        var list = new List<GpuInfo>();
        foreach (var r in WindowsApi.GpuInfo())
        {
            var name = r.GetValueOrDefault("Name")?.ToString() ?? "Unknown GPU";
            double? vram = ToDouble(r.GetValueOrDefault("AdapterRAM")) is { } b ? b / (1024.0 * 1024 * 1024) : null;
            var driver = r.GetValueOrDefault("DriverVersion")?.ToString();
            var w = ToInt(r.GetValueOrDefault("CurrentHorizontalResolution"));
            var h = ToInt(r.GetValueOrDefault("CurrentVerticalResolution"));
            var hz = ToInt(r.GetValueOrDefault("CurrentRefreshRate"));
            string? res = w > 0 && h > 0 ? $"{w}x{h}" : null;
            list.Add(new GpuInfo(name, vram, driver, res, hz > 0 ? hz : null));
        }
        return list;
    }

    public List<DiskInfo> Disks()
    {
        var list = new List<DiskInfo>();
        foreach (var r in WindowsApi.PhysicalDisks())
        {
            var model = r.GetValueOrDefault("Model")?.ToString() ?? "Unknown disk";
            var iface = r.GetValueOrDefault("InterfaceType")?.ToString();
            var sizeRaw = ToDouble(r.GetValueOrDefault("Size"));
            double? sizeGb = sizeRaw is { } b ? b / (1024.0 * 1024 * 1024) : null;
            var serial = r.GetValueOrDefault("SerialNumber")?.ToString();
            var status = r.GetValueOrDefault("Status")?.ToString();
            list.Add(new DiskInfo(model, iface, sizeGb, serial, status));
        }
        return list;
    }

    public (double TotalGb, double UsedPercent)? StorageTotals()
    {
        double total = 0, used = 0;
        bool any = false;
        foreach (var r in WindowsApi.LogicalDisks())
        {
            if (ToInt(r.GetValueOrDefault("DriveType")) != 3) continue; // fixed disks only
            var size = ToDouble(r.GetValueOrDefault("Size"));
            var free = ToDouble(r.GetValueOrDefault("FreeSpace"));
            if (size is null || size <= 0) continue;
            total += size.Value / (1024.0 * 1024 * 1024);
            used += (size.Value - (free ?? 0)) / (1024.0 * 1024 * 1024);
            any = true;
        }
        return any ? (total, total > 0 ? used / total * 100 : 0) : null;
    }

    // ---- helpers ----
    private static string Safe(Func<string> f)
    {
        try { return f(); } catch { return Unavailable; }
    }
    private static double? ToDouble(object? o) =>
        double.TryParse(o?.ToString(), out var d) ? d : null;
    private static int ToInt(object? o) =>
        int.TryParse(o?.ToString(), out var i) ? i : 0;
}
