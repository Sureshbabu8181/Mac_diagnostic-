using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Management;
using WindowsLaptopDiagnostics.Infrastructure;

namespace WindowsLaptopDiagnostics.Services;

/// <summary>Health verdict for a device, always backed by a real read.</summary>
public enum DriveHealth
{
    Ok,
    Caution,
    Failing,
    Unknown,
}

/// <summary>One physical disk as reported by Windows.</summary>
public sealed record DiskInfo(
    string Model,
    string Interface,
    double SizeGb,
    string Serial,
    string Status,
    DriveHealth Health,
    string HealthDetail);

/// <summary>One volume with its usage and a read-only accessibility probe.</summary>
public sealed record VolumeInfo(
    string Letter,
    string Label,
    string FileSystem,
    double SizeGb,
    double FreeGb,
    double UsedPercent,
    bool Ready,
    bool Readable,
    string ReadDetail);

/// <summary>Battery readings. Wear is only supplied when both capacities exist.</summary>
public sealed record BatteryInfo(
    int ChargePercent,
    bool OnAc,
    bool Charging,
    double? DesignMwH,
    double? FullChargeMwH,
    double? WearPercent,
    string DesignDetail);

/// <summary>
/// Read-only hardware inventory and health. Nothing here writes to a device,
/// formats a volume, or issues a destructive command; the accessibility probe
/// only opens existing data for reading.
/// </summary>
public static class HardwareService
{
    // ------------------------------------------------------------------ //
    // Storage
    // ------------------------------------------------------------------ //

    public static List<DiskInfo> Disks()
    {
        var result = new List<DiskInfo>();
        foreach (var row in WindowsApi.PhysicalDisks())
        {
            string model = row.GetValueOrDefault("Model")?.ToString()?.Trim() ?? "(unknown model)";
            if (model.Length == 0) model = "(unknown model)";
            string iface = row.GetValueOrDefault("InterfaceType")?.ToString() ?? "?";
            string serial = row.GetValueOrDefault("SerialNumber")?.ToString()?.Trim() ?? "";
            string status = row.GetValueOrDefault("Status")?.ToString() ?? "Unknown";

            double sizeGb = 0;
            if (double.TryParse(row.GetValueOrDefault("Size")?.ToString(), out double bytes))
                sizeGb = Math.Round(bytes / (1024.0 * 1024.0 * 1024.0), 1);

            DriveHealth health = status.ToLowerInvariant() switch
            {
                "ok" => DriveHealth.Ok,
                "error" or "degraded" or "pred fail" or "non-recover" => DriveHealth.Failing,
                _ => DriveHealth.Unknown,
            };

            string detail = health switch
            {
                DriveHealth.Ok => "Windows reports the device status as OK.",
                DriveHealth.Failing => $"Windows reports device status '{status}' — investigate immediately.",
                _ => $"Windows reports device status '{status}', which is not a health verdict.",
            };

            result.Add(new DiskInfo(model, iface, sizeGb, serial, status, health, detail));
        }
        return result;
    }

    /// <summary>SMART verdict. Windows exposes only a summary, not the raw attributes.</summary>
    public static (bool Available, string Value, string Detail) SmartSummary()
    {
        string? raw = WindowsApi.SmartStatus();
        if (string.IsNullOrWhiteSpace(raw))
            return (false, "Unavailable",
                "Windows did not return a SMART status for any disk. Some NVMe drives and RAID/USB bridges never report it.");

        string v = raw.Trim();
        string detail = v.Equals("OK", StringComparison.OrdinalIgnoreCase)
            ? "Windows reports the SMART status as OK. This is the OS-level summary only — " +
              "raw attribute values (reallocated sectors, wear, temperature) are not exposed through WMI."
            : $"Windows reports SMART status '{v}'.";
        return (true, v, detail);
    }

    public static List<VolumeInfo> Volumes()
    {
        var result = new List<VolumeInfo>();
        foreach (DriveInfo drive in DriveInfo.GetDrives())
        {
            string letter = drive.Name.TrimEnd('\\');
            bool ready = drive.IsReady;

            if (!ready)
            {
                result.Add(new VolumeInfo(letter, "", "", 0, 0, 0, false, false,
                    "Drive is not ready (no media or ejected)."));
                continue;
            }

            double sizeGb = 0, freeGb = 0;
            string fs = "", label = "";
            try { sizeGb = Math.Round(drive.TotalSize / (1024.0 * 1024.0 * 1024.0), 1); } catch { /* not exposed */ }
            try { freeGb = Math.Round(drive.AvailableFreeSpace / (1024.0 * 1024.0 * 1024.0), 1); } catch { /* not exposed */ }
            try { fs = drive.DriveFormat; } catch { /* not exposed */ }
            try { label = drive.VolumeLabel; } catch { /* not exposed */ }

            double used = sizeGb > 0 ? Math.Round((sizeGb - freeGb) * 100.0 / sizeGb, 1) : 0;

            // Read-only accessibility probe: enumerate, then open one existing
            // entry for reading. No file is created, altered or deleted.
            (bool readable, string readDetail) = ProbeReadable(drive.RootDirectory);

            result.Add(new VolumeInfo(letter, label, fs, sizeGb, freeGb, used, true, readable, readDetail));
        }
        return result;
    }

    private static (bool, string) ProbeReadable(DirectoryInfo root)
    {
        try
        {
            string? first = null;
            foreach (string entry in Directory.EnumerateFileSystemEntries(root.FullName))
            {
                first = entry;
                break;
            }

            if (first is null)
                return (true, "Directory listing readable (volume is empty).");

            if (File.Exists(first))
            {
                using var fs = new FileStream(first, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                _ = fs.ReadByte();
                return (true, $"Read {Path.GetFileName(first)} — open/read succeeded, nothing written.");
            }
            return (true, "Directory listing readable.");
        }
        catch (UnauthorizedAccessException ex)
        {
            return (false, $"Read denied by permissions: {ex.Message}");
        }
        catch (IOException ex)
        {
            return (false, $"Read failed: {ex.Message}");
        }
        catch (Exception ex)
        {
            Logger.Warn("Volume read probe failed", ex);
            return (false, $"Read probe failed: {ex.Message}");
        }
    }

    // ------------------------------------------------------------------ //
    // Battery
    // ------------------------------------------------------------------ //

    public static BatteryInfo Battery()
    {
        int charge = 0;
        bool onAc = false, charging = false;
        double? design = null, full = null;
        string designDetail;

        var power = WindowsApi.PowerStatus();
        if (power is { } p)
        {
            charge = p.ChargePercent;
            onAc = p.OnAc;
            charging = p.Charging;
        }

        // Full-charge capacity is normally exposed through root\wmi.
        full = ReadWmiBatteryValue("BatteryFullChargedCapacity", "FullChargedCapacity");

        // Design capacity is the one that is frequently missing. Failure here is
        // expected on many machines and must surface as Unavailable, never as 0.
        design = ReadWmiBatteryValue("BatteryStaticData", "DesignedCapacity");

        if (design is null)
            designDetail = "Design capacity is not exposed by this battery/firmware, so wear cannot be " +
                           "calculated. Wear is reported Unavailable rather than estimated from charge level.";
        else if (full is null)
            designDetail = "Full-charge capacity is not exposed, so wear cannot be calculated.";
        else
            designDetail = $"Design {design:0} mWh, full charge {full:0} mWh.";

        double? wear = (design is { } d && full is { } f && d > 0)
            ? Math.Round(Math.Max(0, (d - f) * 100.0 / d), 1)
            : null;

        return new BatteryInfo(charge, onAc, charging, design, full, wear, designDetail);
    }

    private static double? ReadWmiBatteryValue(string className, string property)
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(
                @"\\.\root\wmi", $"SELECT {property} FROM {className}");
            using var results = searcher.Get();
            foreach (ManagementObject obj in results)
            {
                if (double.TryParse(obj[property]?.ToString(), out double v) && v > 0)
                    return v;
            }
            return null;
        }
        catch (UnauthorizedAccessException)
        {
            Logger.Info($"Battery class {className} refused (access denied)");
            return null;
        }
        catch (Exception ex)
        {
            // "Generic failure" is the common answer when firmware omits the class.
            Logger.Info($"Battery class {className} unavailable: {ex.Message}");
            return null;
        }
    }

    // ------------------------------------------------------------------ //
    // USB
    // ------------------------------------------------------------------ //

    public static List<(string Name, string Id, string Status, int ErrorCode)> UsbInventory()
    {
        var list = new List<(string, string, string, int)>();
        try
        {
            using var searcher = new ManagementObjectSearcher(
                "SELECT Name, PNPDeviceID, Status, ConfigManagerErrorCode FROM Win32_PnPEntity");
            foreach (ManagementObject obj in searcher.Get())
            {
                string id = obj["PNPDeviceID"]?.ToString() ?? "";
                if (!id.StartsWith("USB", StringComparison.OrdinalIgnoreCase)) continue;

                int code = int.TryParse(obj["ConfigManagerErrorCode"]?.ToString(), out int c) ? c : 0;
                list.Add((
                    obj["Name"]?.ToString() ?? "(unnamed USB device)",
                    id,
                    obj["Status"]?.ToString() ?? "Unknown",
                    code));
            }
        }
        catch (Exception ex) { Logger.Warn("USB enumeration failed", ex); }
        return list;
    }

    // ------------------------------------------------------------------ //
    // Driver problems
    // ------------------------------------------------------------------ //

    public static List<(string Name, string ClassName, int Code, string Meaning)> DriverProblems()
    {
        var list = new List<(string, string, int, string)>();
        foreach (var row in WindowsApi.DeviceManagerProblems())
        {
            string name = row.GetValueOrDefault("Name")?.ToString() ?? "(unknown device)";
            string cls = row.GetValueOrDefault("PNPClass")?.ToString() ?? "";
            int code = int.TryParse(row.GetValueOrDefault("ConfigManagerErrorCode")?.ToString(), out int c) ? c : 0;
            list.Add((name, cls, code, DescribePnpError(code)));
        }
        return list;
    }

    /// <summary>Common ConfigManager error codes with plain-language meaning.</summary>
    public static string DescribePnpError(int code) => code switch
    {
        0 => "No problem reported.",
        1 => "Device is not configured correctly (driver missing or wrong).",
        2 => "Driver for this device is not installed.",
        3 => "Driver for this device is corrupted or cannot be loaded.",
        10 => "Device cannot start — the driver failed to initialise the device.",
        12 => "Application/driver conflict — a service or resource problem.",
        14 => "Device is not working (hardware failure or resource exhaustion).",
        18 => "Reinstall the drivers for this device.",
        21 => "Windows is disabling the device (reinstall the driver).",
        22 => "Device is disabled by the user in Device Manager.",
        28 => "Driver is not installed; install the manufacturer's driver.",
        31 => "Device cannot work properly until the driver is reinstalled.",
        37 => "Windows cannot start this hardware device (driver failure).",
        39 => "Driver cannot be initialised — corrupted or conflicting registry entry.",
        43 => "Device reported a problem and Windows stopped it (often firmware/driver).",
        52 => "Windows cannot verify the digital signature of the driver.",
        56 => "Firmware is missing or the device needs configuration (BIOS/UEFI).",
        _ => $"Windows error code {code} — see Device Manager for details.",
    };

    /// <summary>True when a code means Windows stopped/disabled the device.</summary>
    public static bool IsDeviceStopped(int code) => code is 10 or 14 or 22 or 43;

    // ------------------------------------------------------------------ //
    // Read-only servicing state
    // ------------------------------------------------------------------ //

    /// <summary>
    /// Windows build, install date and installed update list — all read-only
    /// queries. Repair operations are offered only as an explicit, admin-labelled
    /// next step and are never executed automatically.
    /// </summary>
    public static (string Build, string InstallDate, int HotfixCount, List<string> Hotfixes, string Detail)
        ServicingState()
    {
        string build = WindowsApi.OsBuild() ?? "unknown";
        string install = "";
        int hotfixCount = 0;
        var hotfixes = new List<string>();

        try
        {
            using var os = new ManagementObjectSearcher(
                "SELECT InstallDate, Version FROM Win32_OperatingSystem");
            foreach (ManagementObject obj in os.Get())
            {
                // WMI returns InstallDate as a DMTF timestamp
                // ("20250523162303.000000+330"), not as Unix seconds. Parsing it
                // as a number always failed and wrongly reported Unavailable.
                if (obj["InstallDate"] is { } raw && raw is string dmtf)
                {
                    try
                    {
                        install = ManagementDateTimeConverter.ToDateTime(dmtf)
                            .ToString("yyyy-MM-dd");
                    }
                    catch
                    {
                        install = "";
                    }
                }
            }
        }
        catch (Exception ex) { Logger.Warn("OS install date read failed", ex); }

        try
        {
            using var qfe = new ManagementObjectSearcher(
                "SELECT HotFixID, Description, InstalledOn FROM Win32_QuickFixEngineering");
            foreach (ManagementObject obj in qfe.Get())
            {
                hotfixCount++;
                string id = obj["HotFixID"]?.ToString() ?? "";
                string on = obj["InstalledOn"]?.ToString() ?? "";
                if (hotfixes.Count < 40) hotfixes.Add($"{id}  {on}".Trim());
            }
        }
        catch (Exception ex) { Logger.Warn("Hotfix enumeration failed", ex); }

        string detail = hotfixCount > 0
            ? $"Build {build}; {hotfixCount} update(s) reported by Windows. Read-only — nothing is installed or repaired here."
            : $"Build {build}. Windows returned no update list through WMI (this does not by itself mean the machine is unpatched).";

        return (build, install, hotfixCount, hotfixes, detail);
    }

    // ------------------------------------------------------------------ //
    // System inventory
    // ------------------------------------------------------------------ //

    public static List<(string Key, string Value)> SystemInventory()
    {
        var rows = new List<(string, string)>();
        void Add(string k, string? v) =>
            rows.Add((k, string.IsNullOrWhiteSpace(v) ? "Unavailable" : v.Trim()));

        Add("Manufacturer", WindowsApi.Manufacturer());
        Add("Model", WindowsApi.Model());
        Add("Serial number", WindowsApi.SerialNumber());
        Add("BIOS", WindowsApi.BiosVersion());
        Add("Baseboard", WindowsApi.BaseboardProduct());

        var cpu = WindowsApi.CpuTopology();
        Add("Processor", WindowsApi.CpuName());
        Add("Cores / threads", cpu is { } c ? $"{c.Cores} cores / {c.Threads} threads" : null);

        var mem = WindowsApi.MemoryStatus();
        Add("Memory", mem is { } m ? $"{m.TotalGb:0.0} GB installed, {m.AvailableGb:0.0} GB available" : null);

        var os = WindowsApi.OsCaption();
        Add("Operating system", os);
        Add("Windows build", WindowsApi.OsBuild());

        Add("Uptime", WindowsApi.UptimeSeconds() is { } s
            ? $"{(int)(s / 86400)}d {(int)((s % 86400) / 3600)}h {((int)(s % 3600) / 60)}m"
            : null);

        int diskCount = WindowsApi.PhysicalDisks().Count;
        Add("Physical disks", $"{diskCount} reported by Windows");

        int deviceCount = 0;
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT DeviceID FROM Win32_PnPEntity");
            foreach (ManagementObject _ in searcher.Get()) deviceCount++;
        }
        catch (Exception ex) { Logger.Warn("Device count failed", ex); }
        Add("Devices enumerated", $"{deviceCount}");

        return rows;
    }
}
