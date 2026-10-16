"""Extended Windows hardware queries for health, thermal and connectivity tests.

All reads are defensive: return None / [] when a value is not exposed. Nothing
is fabricated. Uses PowerShell CIM/WMI via the base support module.
"""

from __future__ import annotations

import re
from typing import Optional

from . import windows as win


# --------------------------------------------------------------------------- #
# Battery health
# --------------------------------------------------------------------------- #
def battery_health() -> dict:
    """Charge, charging state and design/full-charge capacity when exposed."""
    out: dict = {"present": False}
    rows = win.cim_rows(
        "Win32_Battery",
        [
            "EstimatedChargeRemaining",
            "BatteryStatus",
            "DesignCapacity",
            "FullChargeCapacity",
            "DesignVoltage",
            "Status",
        ],
    )
    if not rows:
        return out
    out["present"] = True
    row = rows[0]
    charge = row.get("EstimatedChargeRemaining")
    if charge is not None:
        out["charge_pct"] = int(charge)
    bat_status = row.get("BatteryStatus")
    # Win32_Battery.BatteryStatus: 1=discharging, 2=AC (charging), etc.
    if bat_status is not None:
        out["status_code"] = int(bat_status)
        out["charging"] = int(bat_status) == 2
        out["on_ac"] = int(bat_status) in (2,)
    design = row.get("DesignCapacity")
    full = row.get("FullChargeCapacity")
    if design and full and int(design) > 0:
        out["design_capacity"] = int(design)
        out["full_charge_capacity"] = int(full)
        out["health_pct"] = round(int(full) / int(design) * 100, 1)
    status = row.get("Status")
    if status:
        out["status"] = str(status)
    return out


# --------------------------------------------------------------------------- #
# Storage health (read-only)
# --------------------------------------------------------------------------- #
def physical_disks() -> list[dict]:
    """Physical disk model/capacity/interface (read-only)."""
    rows = win.cim_rows(
        "Win32_DiskDrive",
        ["Model", "Size", "InterfaceType", "MediaType", "SerialNumber", "Status", "Index"],
    )
    out: list[dict] = []
    for row in rows:
        size = row.get("Size")
        out.append(
            {
                "model": row.get("Model", "Unknown"),
                "interface": row.get("InterfaceType", ""),
                "media": row.get("MediaType", ""),
                "serial": row.get("SerialNumber", ""),
                "status": row.get("Status", ""),
                "size_gb": round(int(size) / (1024 ** 3), 1) if size else None,
                "index": row.get("Index"),
            }
        )
    return out


def storage_smart_status() -> Optional[str]:
    """Best-effort SMART predictive-failure status from the physical disk."""
    rows = win.cim_rows("Win32_DiskDrive", ["Status", "PredictFailure"])
    if not rows:
        return None
    row = rows[0]
    pf = row.get("PredictFailure")
    if pf is not None:
        return str(pf)
    return row.get("Status")


def drive_file_systems() -> list[dict]:
    return win.disk_info()


# --------------------------------------------------------------------------- #
# Network details
# --------------------------------------------------------------------------- #
def ip_configuration() -> list[dict]:
    rows = win.cim_rows(
        "Win32_NetworkAdapterConfiguration",
        ["Description", "IPAddress", "DefaultIPGateway", "IPSubnet", "DNSDomain", "DHCPEnabled"],
    )
    out: list[dict] = []
    for row in rows:
        ips = row.get("IPAddress")
        if not ips or (isinstance(ips, list) and not ips):
            continue  # skip adapters with no IP
        if isinstance(ips, str):
            ips = [ips]
        gateway = row.get("DefaultIPGateway") or []
        if isinstance(gateway, str):
            gateway = [gateway]
        out.append(
            {
                "description": row.get("Description", ""),
                "ip_addresses": ips,
                "gateways": gateway,
                "dhcp": row.get("DHCPEnabled"),
                "dns_domain": row.get("DNSDomain", ""),
            }
        )
    return out


def ping_latency(host: str = "8.8.8.8", count: int = 3, timeout_ms: int = 2000) -> Optional[float]:
    """Return average round-trip latency in ms, or None on failure."""
    import subprocess
    import os

    ping = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32", "PING.EXE")
    total = 0.0
    ok = 0
    for _ in range(count):
        try:
            proc = subprocess.run(
                [ping, "-n", "1", "-w", str(timeout_ms), host],
                capture_output=True,
                text=True,
                timeout=timeout_ms / 1000 + 2,
            )
        except (subprocess.TimeoutExpired, OSError):
            continue
        m = re.search(r"time[=<](\d+)ms", proc.stdout or "")
        if m:
            total += float(m.group(1))
            ok += 1
    if ok == 0:
        return None
    return round(total / ok, 1)


# --------------------------------------------------------------------------- #
# Bluetooth
# --------------------------------------------------------------------------- #
def bluetooth_radio() -> Optional[dict]:
    """Bluetooth adapter presence via Win32_PnPEntity PNPClass 'Bluetooth'."""
    rows = win.cim_rows("Win32_PnPEntity", ["Name", "PNPClass", "Status", "PNPDeviceID"])
    for row in rows:
        if str(row.get("PNPClass", "")).lower() == "bluetooth":
            return {
                "name": row.get("Name", "Bluetooth Radio"),
                "status": row.get("Status", ""),
                "present": True,
            }
    return None


# --------------------------------------------------------------------------- #
# Thermal / clock / utilization
# --------------------------------------------------------------------------- #
def cpu_temperature_c() -> Optional[float]:
    """CPU temperature from MSAcpi_ThermalZoneTemperature (tenths of Kelvin).

    Often not exposed without vendor support; returns None when unavailable.
    """
    rows = win.cim_rows("MSAcpi_ThermalZoneTemperature", ["CurrentTemperature"])
    if not rows:
        return None
    val = rows[0].get("CurrentTemperature")
    if val is None:
        return None
    try:
        # Value is tenths of Kelvin.
        kelvin = float(val) / 10.0
        return round(kelvin - 273.15, 1)
    except (ValueError, TypeError):
        return None


def cpu_load_percent() -> Optional[float]:
    """Per-core CPU load from Win32_Processor.LoadPercentage."""
    rows = win.cim_rows("Win32_Processor", ["LoadPercentage", "CurrentClockSpeed", "MaxClockSpeed"])
    if not rows:
        return None
    try:
        load = rows[0].get("LoadPercentage")
        return float(load) if load is not None else None
    except (ValueError, TypeError):
        return None


def cpu_clock_mhz() -> Optional[float]:
    rows = win.cim_rows("Win32_Processor", ["CurrentClockSpeed", "MaxClockSpeed"])
    if not rows:
        return None
    try:
        cur = rows[0].get("CurrentClockSpeed")
        return float(cur) if cur is not None else None
    except (ValueError, TypeError):
        return None


def cpu_max_clock_mhz() -> Optional[float]:
    rows = win.cim_rows("Win32_Processor", ["MaxClockSpeed"])
    if not rows:
        return None
    try:
        mx = rows[0].get("MaxClockSpeed")
        return float(mx) if mx is not None else None
    except (ValueError, TypeError):
        return None


def memory_status() -> dict:
    """Installed / total / available / used memory."""
    out: dict = {}
    total_raw = win.cim_property("Win32_ComputerSystem", "TotalPhysicalMemory")
    free_raw = win.cim_property("Win32_OperatingSystem", "FreePhysicalMemory")  # KB
    try:
        if total_raw:
            total_bytes = int(total_raw)
            out["total_gb"] = round(total_bytes / (1024 ** 3), 2)
        if free_raw:
            free_gb = float(free_raw) / (1024 ** 2)
            out["free_gb"] = round(free_gb, 2)
            if "total_gb" in out:
                out["used_gb"] = round(out["total_gb"] - free_gb, 2)
                out["used_pct"] = round(out["used_gb"] / out["total_gb"] * 100, 1)
    except (ValueError, TypeError):
        pass
    return out


def gpu_info() -> list[dict]:
    rows = win.cim_rows(
        "Win32_VideoController",
        [
            "Name",
            "AdapterRAM",
            "DriverVersion",
            "DriverDate",
            "CurrentHorizontalResolution",
            "CurrentVerticalResolution",
            "CurrentRefreshRate",
            "Status",
        ],
    )
    out: list[dict] = []
    for row in rows:
        adapter_ram = row.get("AdapterRAM")
        out.append(
            {
                "name": row.get("Name", "Unknown"),
                "vram_gb": round(int(adapter_ram) / (1024 ** 3), 2) if adapter_ram else None,
                "driver_version": row.get("DriverVersion", ""),
                "driver_date": str(row.get("DriverDate", "")),
                "resolution": (
                    f"{row.get('CurrentHorizontalResolution')}x{row.get('CurrentVerticalResolution')}"
                    if row.get("CurrentHorizontalResolution")
                    else ""
                ),
                "refresh_hz": row.get("CurrentRefreshRate"),
                "status": row.get("Status", ""),
            }
        )
    return out


def display_settings() -> list[dict]:
    """Current resolution/refresh for attached displays."""
    rows = win.cim_rows(
        "Win32_DesktopMonitor",
        ["Name", "ScreenHeight", "ScreenWidth", "RefreshRate"],
    )
    out: list[dict] = []
    for row in rows:
        h = row.get("ScreenHeight")
        w = row.get("ScreenWidth")
        if not h or not w:
            continue
        out.append(
            {
                "name": row.get("Name", "Display"),
                "resolution": f"{w}x{h}",
                "refresh_hz": row.get("RefreshRate"),
            }
        )
    return out


# --------------------------------------------------------------------------- #
# Windows / driver health (read-only)
# --------------------------------------------------------------------------- #
def device_manager_problems() -> list[dict]:
    """Devices with a problem code (ConfigManagerErrorCode != 0)."""
    rows = win.cim_rows(
        "Win32_PnPEntity",
        ["Name", "ConfigManagerErrorCode", "PNPClass", "Status"],
    )
    out: list[dict] = []
    for row in rows:
        code = row.get("ConfigManagerErrorCode")
        try:
            if code is not None and int(code) != 0:
                out.append(
                    {
                        "name": row.get("Name", "Unknown device"),
                        "error_code": int(code),
                        "class": row.get("PNPClass", ""),
                        "status": row.get("Status", ""),
                    }
                )
        except (ValueError, TypeError):
            continue
    return out


def os_info() -> dict:
    rows = win.cim_rows(
        "Win32_OperatingSystem",
        ["Caption", "Version", "BuildNumber", "OSArchitecture", "InstallDate", "LastBootUpTime"],
    )
    return rows[0] if rows else {}


def bios_info() -> dict:
    rows = win.cim_rows(
        "Win32_BIOS",
        ["Manufacturer", "SMBIOSBIOSVersion", "ReleaseDate", "SerialNumber"],
    )
    return rows[0] if rows else {}


def baseboard_info() -> dict:
    rows = win.cim_rows(
        "Win32_BaseBoard",
        ["Manufacturer", "Product", "SerialNumber", "Version"],
    )
    return rows[0] if rows else {}


def computer_system_info() -> dict:
    rows = win.cim_rows(
        "Win32_ComputerSystem",
        ["Manufacturer", "Model", "TotalPhysicalMemory", "Domain", "PCSystemType", "NumberOfProcessors"],
    )
    return rows[0] if rows else {}


# --------------------------------------------------------------------------- #
# Fan (best-effort; rarely exposed)
# --------------------------------------------------------------------------- #
def fan_rpm() -> Optional[float]:
    """Best-effort fan RPM. Windows rarely exposes this without vendor tools."""
    rows = win.cim_rows("Win32_Fan", ["DesiredSpeed", "ActiveCooling"])
    for row in rows:
        val = row.get("DesiredSpeed")
        if val is not None:
            try:
                return float(val)
            except (ValueError, TypeError):
                continue
    return None


def fan_control_supported() -> bool:
    """Fan speed control is essentially never safe/available via public WMI.

    Documented as Unsupported rather than attempting embedded-controller writes.
    """
    return False
