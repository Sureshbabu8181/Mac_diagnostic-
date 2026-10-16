using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Management;

namespace WindowsLaptopDiagnostics.Services;

/// <summary>
/// Windows hardware/system access layer.
///
/// Uses WMI (System.Management) and direct P/Invoke to Win32 APIs. Every read
/// is defensive: returns null/empty when a value is not exposed. Nothing is ever
/// fabricated — callers report Unsupported rather than guessing.
/// </summary>
public static class WindowsApi
{
    // ------------------------------------------------------------------ //
    // WMI helpers
    // ------------------------------------------------------------------ //

    /// <summary>Read a single property from the first instance of a WMI class.</summary>
    public static string? WmiProperty(string className, string property)
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(
                $"SELECT {property} FROM {className}");
            foreach (ManagementObject obj in searcher.Get())
            {
                var value = obj[property];
                if (value is null) return null;
                var s = value.ToString();
                return string.IsNullOrWhiteSpace(s) ? null : s.Trim();
            }
        }
        catch (ManagementException) { }
        catch (UnauthorizedAccessException) { }
        catch (COMException) { }
        return null;
    }

    /// <summary>Read several rows of selected properties from a WMI class.</summary>
    public static List<Dictionary<string, object?>> WmiRows(string className, params string[] properties)
    {
        var rows = new List<Dictionary<string, object?>>();
        try
        {
            using var searcher = new ManagementObjectSearcher(
                $"SELECT {string.Join(", ", properties)} FROM {className}");
            foreach (ManagementObject obj in searcher.Get())
            {
                var row = new Dictionary<string, object?>();
                foreach (var p in properties)
                {
                    try { row[p] = obj[p]; }
                    catch { row[p] = null; }
                }
                rows.Add(row);
            }
        }
        catch (ManagementException) { }
        catch (UnauthorizedAccessException) { }
        catch (COMException) { }
        return rows;
    }

    // ------------------------------------------------------------------ //
    // P/Invoke to Win32 APIs (things WMI does not expose cleanly)
    // ------------------------------------------------------------------ //

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct SYSTEM_POWER_STATUS
    {
        public byte ACLineStatus;
        public byte BatteryFlag;
        public byte BatteryLifePercent;
        public byte SystemStatusFlag;
        public int BatteryLifeTime;
        public int BatteryFullLifeTime;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Auto)]
    private static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS sps);

    [DllImport("kernel32.dll")]
    private static extern ulong GetTickCount64();

    [StructLayout(LayoutKind.Sequential)]
    private struct MEMORYSTATUSEX
    {
        public uint dwLength;
        public uint dwMemoryLoad;
        public ulong ullTotalPhys;
        public ulong ullAvailPhys;
        public ulong ullTotalPageFile;
        public ulong ullAvailPageFile;
        public ulong ullTotalVirtual;
        public ulong ullAvailVirtual;
        public ulong ullAvailExtendedVirtual;
    }

    [DllImport("kernel32.dll")]
    private static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);

    /// <summary>Uptime in seconds since boot (GetTickCount64).</summary>
    public static double? UptimeSeconds()
    {
        try { return GetTickCount64() / 1000.0; }
        catch { return null; }
    }

    /// <summary>
    /// Live memory snapshot via GlobalMemoryStatusEx (authoritative, no WMI lag).
    /// Returns total/available in GB and used percent.
    /// </summary>
    public static (double TotalGb, double AvailableGb, double UsedPercent)? MemoryStatus()
    {
        var ms = new MEMORYSTATUSEX { dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>() };
        if (!GlobalMemoryStatusEx(ref ms)) return null;
        double total = ms.ullTotalPhys / (1024.0 * 1024 * 1024);
        double avail = ms.ullAvailPhys / (1024.0 * 1024 * 1024);
        double usedPct = total > 0 ? (1 - avail / total) * 100 : 0;
        return (total, avail, usedPct);
    }

    /// <summary>Power/battery state via GetSystemPowerStatus (authoritative).</summary>
    public static (bool Present, bool OnAc, bool Charging, int ChargePercent)? PowerStatus()
    {
        if (!GetSystemPowerStatus(out var sps)) return null;
        // BatteryFlag 128 = no system battery.
        bool present = (sps.BatteryFlag & 128) == 0;
        bool onAc = sps.ACLineStatus == 1;
        // BatteryFlag 8 = charging.
        bool charging = (sps.BatteryFlag & 8) != 0;
        int charge = sps.BatteryLifePercent == 255 ? -1 : sps.BatteryLifePercent;
        return (present, onAc, charging, charge);
    }

    // ------------------------------------------------------------------ //
    // CPU load via P/Invoke (GetSystemTimes) — real-time, no WMI polling lag
    // ------------------------------------------------------------------ //

    [StructLayout(LayoutKind.Sequential)]
    private struct FILETIME { public uint LowDateTime; public uint HighDateTime; }

    [DllImport("kernel32.dll")]
    private static extern bool GetSystemTimes(out FILETIME idle, out FILETIME kernel, out FILETIME user);

    private static ulong _prevIdle, _prevKernel, _prevUser;
    private static bool _hasPrev;

    /// <summary>
    /// Compute CPU utilization from the delta between two GetSystemTimes samples.
    /// Call once to prime, wait ~500ms, call again for a reading.
    /// </summary>
    public static double? CpuLoadPercent()
    {
        if (!GetSystemTimes(out var idle, out var kernel, out var user)) return null;
        ulong i = ToUInt64(idle), k = ToUInt64(kernel), u = ToUInt64(user);
        if (!_hasPrev)
        {
            _prevIdle = i; _prevKernel = k; _prevUser = u; _hasPrev = true;
            return null;
        }
        ulong idleDelta = i - _prevIdle;
        ulong kernelDelta = k - _prevKernel;
        ulong userDelta = u - _prevUser;
        // Kernel time includes idle time.
        ulong total = kernelDelta + userDelta;
        ulong busy = kernelDelta - idleDelta + userDelta;
        _prevIdle = i; _prevKernel = k; _prevUser = u;
        if (total == 0) return 0;
        double load = (double)busy / total * 100;
        return Math.Clamp(load, 0, 100);
    }

    private static ulong ToUInt64(FILETIME ft) =>
        ((ulong)ft.HighDateTime << 32) | ft.LowDateTime;

    // ------------------------------------------------------------------ //
    // CPU info / clock
    // ------------------------------------------------------------------ //

    public static string? CpuName() => WmiProperty("Win32_Processor", "Name");

    public static (int Cores, int Threads)? CpuTopology()
    {
        var rows = WmiRows("Win32_Processor", "NumberOfCores", "NumberOfLogicalProcessors");
        if (rows.Count == 0) return null;
        int cores = ToInt(rows[0].GetValueOrDefault("NumberOfCores"));
        int threads = ToInt(rows[0].GetValueOrDefault("NumberOfLogicalProcessors"));
        return cores > 0 || threads > 0 ? (cores, threads) : null;
    }

    /// <summary>Current clock speed in MHz (best-effort; often static on modern CPUs).</summary>
    public static double? CpuClockMHz()
    {
        var v = WmiProperty("Win32_Processor", "CurrentClockSpeed");
        return double.TryParse(v, out var mhz) ? mhz : null;
    }

    public static double? CpuMaxClockMHz()
    {
        var v = WmiProperty("Win32_Processor", "MaxClockSpeed");
        return double.TryParse(v, out var mhz) ? mhz : null;
    }

    /// <summary>
    /// CPU temperature via ACPI thermal zone (tenths of Kelvin). Often not
    /// exposed without vendor support — returns null so callers report
    /// Unsupported rather than fabricating a reading.
    /// </summary>
    public static double? CpuTemperatureC()
    {
        var rows = WmiRows("MSAcpi_ThermalZoneTemperature", "CurrentTemperature");
        if (rows.Count == 0) return null;
        if (rows[0].GetValueOrDefault("CurrentTemperature") is not { } raw) return null;
        if (!double.TryParse(raw.ToString(), out var tenthsK)) return null;
        return Math.Round(tenthsK / 10.0 - 273.15, 1);
    }

    // ------------------------------------------------------------------ //
    // GPU
    // ------------------------------------------------------------------ //

    public static List<Dictionary<string, object?>> GpuInfo() =>
        WmiRows("Win32_VideoController",
            "Name", "AdapterRAM", "DriverVersion",
            "CurrentHorizontalResolution", "CurrentVerticalResolution", "CurrentRefreshRate", "Status");

    // ------------------------------------------------------------------ //
    // Storage (read-only)
    // ------------------------------------------------------------------ //

    public static List<Dictionary<string, object?>> PhysicalDisks() =>
        WmiRows("Win32_DiskDrive", "Model", "Size", "InterfaceType", "MediaType", "SerialNumber", "Status");

    public static List<Dictionary<string, object?>> LogicalDisks() =>
        WmiRows("Win32_LogicalDisk", "DeviceID", "DriveType", "Size", "FreeSpace", "FileSystem");

    /// <summary>
    /// SMART verdict from the OS-level summary.
    ///
    /// <c>PredictFailure</c> is not queryable on every system, and a combined
    /// SELECT fails outright ("Invalid query") — which used to hide the
    /// <c>Status</c> that *is* readable. The two are read separately so an
    /// unavailable property cannot mask an available one.
    /// </summary>
    public static string? SmartStatus()
    {
        var rows = WmiRows("Win32_DiskDrive", "Status");
        if (rows.Count == 0) return null;

        string? status = rows[0].GetValueOrDefault("Status")?.ToString();
        if (string.IsNullOrWhiteSpace(status)) return null;

        var pfRows = WmiRows("Win32_DiskDrive", "PredictFailure");
        if (pfRows.Count > 0)
        {
            string? pf = pfRows[0].GetValueOrDefault("PredictFailure")?.ToString();
            bool isFalse = string.IsNullOrWhiteSpace(pf) ||
                           pf.Equals("False", StringComparison.OrdinalIgnoreCase) ||
                           pf.Equals("0", StringComparison.OrdinalIgnoreCase);
            if (!isFalse) return pf!;
        }

        return status;
    }

    // ------------------------------------------------------------------ //
    // Network / Bluetooth / USB
    // ------------------------------------------------------------------ //

    public static List<Dictionary<string, object?>> NetworkAdapters() =>
        WmiRows("Win32_NetworkAdapter", "Name", "NetConnectionStatus", "Speed", "PhysicalAdapter");

    public static List<Dictionary<string, object?>> IpConfigurations() =>
        WmiRows("Win32_NetworkAdapterConfiguration", "Description", "IPAddress", "DefaultIPGateway", "DHCPEnabled");

    public static Dictionary<string, object?>? BluetoothRadio()
    {
        var rows = WmiRows("Win32_PnPEntity", "Name", "PNPClass", "Status");
        foreach (var r in rows)
        {
            if (string.Equals(r.GetValueOrDefault("PNPClass")?.ToString(), "bluetooth",
                    StringComparison.OrdinalIgnoreCase))
                return r;
        }
        return null;
    }

    public static List<Dictionary<string, object?>> UsbDevices()
    {
        var rows = WmiRows("Win32_PnPEntity", "Name", "PNPDeviceID", "Status");
        var result = new List<Dictionary<string, object?>>();
        foreach (var r in rows)
        {
            var id = r.GetValueOrDefault("PNPDeviceID")?.ToString() ?? "";
            if (id.StartsWith("USB", StringComparison.OrdinalIgnoreCase))
                result.Add(r);
        }
        return result;
    }

    // ------------------------------------------------------------------ //
    // System identity
    // ------------------------------------------------------------------ //

    public static string? Manufacturer() => WmiProperty("Win32_ComputerSystem", "Manufacturer");
    public static string? Model() => WmiProperty("Win32_ComputerSystem", "Model");
    public static string? SerialNumber()
    {
        var s = WmiProperty("Win32_BIOS", "SerialNumber")?.Trim();
        // Filter out common placeholder strings.
        if (string.IsNullOrEmpty(s)) return null;
        var bad = new[] { "to be filled by o.e.m.", "system serial number", "default string", "none" };
        return bad.Contains(s.ToLowerInvariant()) ? null : s;
    }
    public static string? BiosVersion() => WmiProperty("Win32_BIOS", "SMBIOSBIOSVersion");
    public static string? OsCaption() => WmiProperty("Win32_OperatingSystem", "Caption");
    public static string? OsBuild() => WmiProperty("Win32_OperatingSystem", "BuildNumber");
    public static string? ComputerName() => Environment.MachineName;
    public static string? BaseboardProduct()
    {
        var rows = WmiRows("Win32_BaseBoard", "Product");
        return rows.Count > 0 ? rows[0].GetValueOrDefault("Product")?.ToString() : null;
    }

    public static List<Dictionary<string, object?>> DeviceManagerProblems()
    {
        var rows = WmiRows("Win32_PnPEntity", "Name", "ConfigManagerErrorCode", "PNPClass");
        var problems = new List<Dictionary<string, object?>>();
        foreach (var r in rows)
        {
            if (int.TryParse(r.GetValueOrDefault("ConfigManagerErrorCode")?.ToString(), out int code) && code != 0)
                problems.Add(r);
        }
        return problems;
    }

    // ------------------------------------------------------------------ //
    // Fan (rarely exposed via public WMI)
    // ------------------------------------------------------------------ //

    public static double? FanRpm()
    {
        var rows = WmiRows("Win32_Fan", "DesiredSpeed", "ActiveCooling");
        foreach (var r in rows)
        {
            if (double.TryParse(r.GetValueOrDefault("DesiredSpeed")?.ToString(), out var rpm))
                return rpm;
        }
        return null;
    }

    /// <summary>
    /// Fan speed control is never safe/available via public Windows APIs.
    /// Documented as Unsupported rather than attempting EC writes.
    /// </summary>
    public static bool FanControlSupported() => false;

    // ------------------------------------------------------------------ //
    // Display
    // ------------------------------------------------------------------ //

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct DEVMODE
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string dmDeviceName;
        public short dmSpecVersion;
        public short dmDriverVersion;
        public short dmSize;
        public short dmDriverExtra;
        public int dmFields;
        public int dmPositionX;
        public int dmPositionY;
        public int dmDisplayOrientation;
        public int dmDisplayFixedOutput;
        public short dmColor;
        public short dmDuplex;
        public short dmYResolution;
        public short dmTTOption;
        public short dmCollate;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string dmFormName;
        public short dmLogPixels;
        public int dmBitsPerPel;
        public int dmPelsWidth;
        public int dmPelsHeight;
        public int dmDisplayFlags;
        public int dmDisplayFrequency;
    }

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern bool EnumDisplaySettings(string? deviceName, int modeNum, ref DEVMODE devMode);

    private const int ENUM_CURRENT_SETTINGS = -1;

    /// <summary>Current primary display resolution and refresh rate.</summary>
    public static (int Width, int Height, int RefreshHz)? CurrentDisplaySettings()
    {
        var dm = new DEVMODE { dmSize = (short)Marshal.SizeOf<DEVMODE>() };
        if (!EnumDisplaySettings(null, ENUM_CURRENT_SETTINGS, ref dm)) return null;
        return (dm.dmPelsWidth, dm.dmPelsHeight, dm.dmDisplayFrequency);
    }

    // ------------------------------------------------------------------ //
    // Display devices (multi-monitor awareness)
    // ------------------------------------------------------------------ //

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct DISPLAY_DEVICE
    {
        public int cb;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string DeviceName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string DeviceString;
        public int StateFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string DeviceId;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string DeviceKey;
    }

    private const int DISPLAY_DEVICE_ACTIVE = 0x1;
    private const int DISPLAY_DEVICE_PRIMARY_DEVICE = 0x4;

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern bool EnumDisplayDevices(
        string? lpDevice, uint iDevNum, ref DISPLAY_DEVICE lpDisplayDevice, uint dwFlags);

    /// <summary>An attached display head (monitor) with its current mode and position.</summary>
    public sealed record DisplayHead(
        int Index,
        string DeviceName,     // e.g. \\.\DISPLAY1
        string FriendlyName,   // monitor name when exposed
        bool IsPrimary,
        int Width,
        int Height,
        int RefreshHz,
        int X,
        int Y);

    /// <summary>
    /// Enumerate active display heads. FriendlyName falls back to the adapter
    /// name when the monitor itself is not exposed (never fabricated).
    /// </summary>
    public static List<DisplayHead> EnumerateDisplays()
    {
        var heads = new List<DisplayHead>();
        for (uint i = 0; ; i++)
        {
            var dd = new DISPLAY_DEVICE { cb = Marshal.SizeOf<DISPLAY_DEVICE>() };
            if (!EnumDisplayDevices(null, i, ref dd, 0)) break;
            if ((dd.StateFlags & DISPLAY_DEVICE_ACTIVE) == 0) continue;

            // Second call resolves the monitor attached to this output.
            var monitor = new DISPLAY_DEVICE { cb = Marshal.SizeOf<DISPLAY_DEVICE>() };
            string friendly = dd.DeviceString;
            if (EnumDisplayDevices(dd.DeviceName, 0, ref monitor, 0) &&
                !string.IsNullOrWhiteSpace(monitor.DeviceString))
            {
                friendly = monitor.DeviceString;
            }
            // Never show a blank label: fall back to the adapter/output name
            // (a real identifier, not an invented name).
            if (string.IsNullOrWhiteSpace(friendly)) friendly = dd.DeviceName;

            var dm = new DEVMODE { dmSize = (short)Marshal.SizeOf<DEVMODE>() };
            int w = 0, h = 0, hz = 0, x = 0, y = 0;
            if (EnumDisplaySettings(dd.DeviceName, ENUM_CURRENT_SETTINGS, ref dm))
            {
                w = dm.dmPelsWidth; h = dm.dmPelsHeight; hz = dm.dmDisplayFrequency;
                x = dm.dmPositionX; y = dm.dmPositionY;
            }

            heads.Add(new DisplayHead(
                Index: heads.Count,
                DeviceName: dd.DeviceName,
                FriendlyName: friendly.Trim(),
                IsPrimary: (dd.StateFlags & DISPLAY_DEVICE_PRIMARY_DEVICE) != 0,
                Width: w, Height: h, RefreshHz: hz,
                X: x, Y: y));
        }
        return heads;
    }

    /// <summary>All supported video modes for a display head (width, height, refresh).</summary>
    public static List<(int Width, int Height, int RefreshHz)> SupportedDisplayModes(string deviceName)
    {
        var modes = new List<(int Width, int Height, int RefreshHz)>();
        var dm = new DEVMODE { dmSize = (short)Marshal.SizeOf<DEVMODE>() };
        for (int i = 0; EnumDisplaySettings(deviceName, i, ref dm); i++)
        {
            var t = (dm.dmPelsWidth, dm.dmPelsHeight, dm.dmDisplayFrequency);
            if (!modes.Contains(t)) modes.Add(t);
            dm = new DEVMODE { dmSize = (short)Marshal.SizeOf<DEVMODE>() };
        }
        return modes;
    }

    // ------------------------------------------------------------------ //
    // Pointing devices (touchpad vs external mouse discrimination)
    // ------------------------------------------------------------------ //

    public static List<Dictionary<string, object?>> PointingDevices() =>
        WmiRows("Win32_PointingDevice", "Name", "Manufacturer", "PNPDeviceID", "DeviceID", "Status");

    // ------------------------------------------------------------------ //
    // Small parsing helpers
    // ------------------------------------------------------------------ //

    private static int ToInt(object? o) => int.TryParse(o?.ToString(), out var i) ? i : 0;

    public static string FormatBytes(ulong bytes)
    {
        string[] units = { "B", "KB", "MB", "GB", "TB" };
        double size = bytes;
        int unit = 0;
        while (size >= 1024 && unit < units.Length - 1) { size /= 1024; unit++; }
        return $"{size:0.#} {units[unit]}";
    }
}
