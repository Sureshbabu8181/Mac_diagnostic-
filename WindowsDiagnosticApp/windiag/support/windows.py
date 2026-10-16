"""Windows hardware/system access helpers.

Stdlib-only. Queries are done through PowerShell CIM/WMI with short timeouts
and are fully defensive: when a value cannot be read we return None and the
calling diagnostic reports NOT AVAILABLE. Nothing is ever fabricated.

No third-party dependency (no psutil) keeps the app lightweight and portable.
"""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
from typing import Any, Optional

_POWERSHELL = os.path.join(
    os.environ.get("SystemRoot", r"C:\Windows"),
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
)

# Small cache so we only pay for a CIM round-trip once per property family.
_cache: dict[str, Any] = {}


def _run_powershell(script: str, timeout: float = 12.0) -> Optional[str]:
    """Run a PowerShell snippet and return stripped stdout, or None on failure."""
    try:
        proc = subprocess.run(
            [
                _POWERSHELL,
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script,
            ],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except (subprocess.TimeoutExpired, OSError, FileNotFoundError):
        return None
    if proc.returncode != 0:
        return None
    out = (proc.stdout or "").strip()
    return out or None


def cim_property(class_name: str, property_name: str, timeout: float = 12.0) -> Optional[str]:
    """Read a single CIM/WMI property from the first instance of a class.

    Returns the value as a trimmed string, or None when unavailable.
    """
    key = f"cim:{class_name}:{property_name}"
    if key in _cache:
        return _cache[key]

    # Quote-escape then emit just the raw property value.
    script = (
        f"$ErrorActionPreference='SilentlyContinue';"
        f"$v = (Get-CimInstance -ClassName '{class_name}' "
        f"-ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty '{property_name}' "
        f"-ErrorAction SilentlyContinue);"
        f"if ($null -ne $v) {{ Write-Output $v }}"
    )
    value = _run_powershell(script, timeout=timeout)
    if value is not None:
        value = value.strip()
        if value == "":
            value = None
    _cache[key] = value
    return value


def cim_rows(class_name: str, properties: list[str], timeout: float = 15.0) -> list[dict]:
    """Return rows of selected properties from a CIM/WMI class as dicts."""
    key = f"rows:{class_name}:{','.join(properties)}"
    if key in _cache:
        return _cache[key]

    props_csv = ",".join(f"'{p}'" for p in properties)
    script = (
        f"$ErrorActionPreference='SilentlyContinue';"
        f"Get-CimInstance -ClassName '{class_name}' -ErrorAction SilentlyContinue | "
        f"Select-Object -Property {props_csv} | "
        f"ConvertTo-Json -Compress -ErrorAction SilentlyContinue"
    )
    raw = _run_powershell(script, timeout=timeout)
    rows: list[dict] = []
    if raw:
        import json

        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                rows = [data]
            elif isinstance(data, list):
                rows = data
        except (ValueError, TypeError):
            rows = []
    _cache[key] = rows
    return rows


def system_root() -> Optional[str]:
    """Windows system drive root, e.g. 'C:\\'."""
    return os.environ.get("SystemDrive", "C:") + "\\"


def windows_version() -> str:
    try:
        return platform.platform()
    except Exception:
        return "NOT AVAILABLE"


def windows_build() -> str:
    build = platform.version()
    return build if build else "NOT AVAILABLE"


def architecture() -> str:
    machine = platform.machine()
    return machine if machine else "NOT AVAILABLE"


def cpu_name() -> Optional[str]:
    name = cim_property("Win32_Processor", "Name")
    return name


def cpu_core_count() -> Optional[str]:
    logical = cim_property("Win32_Processor", "NumberOfLogicalProcessors")
    physical = cim_property("Win32_Processor", "NumberOfCores")
    if logical and physical:
        return f"{physical} cores / {logical} threads"
    return logical or physical


def total_physical_memory_gb() -> Optional[str]:
    raw = cim_property("Win32_ComputerSystem", "TotalPhysicalMemory")
    if not raw:
        return None
    try:
        gb = int(raw) / (1024 ** 3)
        return f"{gb:.1f} GB"
    except (ValueError, TypeError):
        return None


def disk_info() -> list[dict]:
    """Logical disks with size/free space in GB."""
    rows = cim_rows(
        "Win32_LogicalDisk",
        ["DeviceID", "DriveType", "Size", "FreeSpace", "FileSystem"],
    )
    out: list[dict] = []
    for row in rows:
        try:
            if int(row.get("DriveType", 0)) != 3:  # only local fixed disks
                continue
            size = float(row.get("Size", 0) or 0)
            free = float(row.get("FreeSpace", 0) or 0)
            out.append(
                {
                    "drive": row.get("DeviceID", "?"),
                    "fs": row.get("FileSystem", ""),
                    "size_gb": round(size / (1024 ** 3), 1),
                    "free_gb": round(free / (1024 ** 3), 1),
                    "used_pct": round((1 - free / size) * 100, 1) if size else 0.0,
                }
            )
        except (ValueError, TypeError):
            continue
    return out


def total_storage_gb() -> Optional[str]:
    disks = disk_info()
    if not disks:
        return None
    total = sum(d["size_gb"] for d in disks)
    return f"{total:.0f} GB"


def gpu_name() -> Optional[str]:
    name = cim_property("Win32_VideoController", "Name")
    return name


def battery_present() -> Optional[bool]:
    """True/False when detectable, None when unknown."""
    rows = cim_rows("Win32_Battery", ["BatteryStatus", "EstimatedChargeRemaining"])
    if rows:
        return True
    # A desktop with no battery class returns no rows -> likely not present.
    return False


def network_adapters() -> list[dict]:
    rows = cim_rows(
        "Win32_NetworkAdapter",
        ["Name", "NetConnectionStatus", "Speed", "PhysicalAdapter"],
    )
    out: list[dict] = []
    for row in rows:
        if not row.get("PhysicalAdapter"):
            continue
        status_code = row.get("NetConnectionStatus")
        out.append(
            {
                "name": row.get("Name", "Unknown"),
                "connected": status_code == 2,
                "speed_mbps": _mbps(row.get("Speed")),
            }
        )
    return out


def _mbps(speed_bps: Any) -> Optional[int]:
    try:
        return int(float(speed_bps) / 1_000_000)
    except (ValueError, TypeError):
        return None


def usb_devices() -> list[dict]:
    rows = cim_rows(
        "Win32_USBControllerDevice",
        [],
    )
    # Dependent is a reference string; fall back to PnP entity for friendly names.
    pnp = cim_rows(
        "Win32_PnPEntity",
        ["Name", "PNPDeviceID", "Status"],
    )
    out: list[dict] = []
    for row in pnp:
        pnp_id = str(row.get("PNPDeviceID", ""))
        if pnp_id.upper().startswith("USB"):
            out.append({"name": row.get("Name", "USB Device"), "status": row.get("Status")})
    return out


def serial_number() -> Optional[str]:
    serial = cim_property("Win32_BIOS", "SerialNumber")
    if serial and serial.strip().lower() not in ("", "to be filled by o.e.m.", "system serial number", "default string"):
        return serial.strip()
    return None


def manufacturer() -> Optional[str]:
    return cim_property("Win32_ComputerSystem", "Manufacturer")


def model() -> Optional[str]:
    return cim_property("Win32_ComputerSystem", "Model")


def computer_name() -> Optional[str]:
    return os.environ.get("COMPUTERNAME") or platform.node()


def hostname() -> Optional[str]:
    try:
        import socket

        return socket.gethostname()
    except Exception:
        return None


def bios_version() -> Optional[str]:
    return cim_property("Win32_BIOS", "SMBIOSBIOSVersion")


def uptime_seconds() -> Optional[float]:
    try:
        import ctypes

        # GetTickCount64 returns milliseconds since boot.
        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        ms = kernel32.GetTickCount64()
        return float(ms) / 1000.0
    except Exception:
        return None


def format_uptime(seconds: float) -> str:
    secs = int(seconds)
    days, rem = divmod(secs, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, _ = divmod(rem, 60)
    parts = []
    if days:
        parts.append(f"{days}d")
    if hours:
        parts.append(f"{hours}h")
    parts.append(f"{minutes}m")
    return " ".join(parts)


def free_disk_percent(path: str = "C:\\") -> Optional[float]:
    try:
        usage = shutil.disk_usage(path)
        return round((usage.free / usage.total) * 100, 1)
    except OSError:
        return None
