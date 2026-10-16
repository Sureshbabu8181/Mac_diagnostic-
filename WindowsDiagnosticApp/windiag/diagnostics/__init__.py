"""Windows diagnostic modules.

Automated providers run in software and return a DiagnosticResult. Manual
providers only carry metadata; the GUI owns those screens and reports verdicts
back to the engine. Nothing is fabricated — unavailable values report NOT
AVAILABLE.
"""

from __future__ import annotations

from ..models import (
    DiagnosticKind,
    DiagnosticMetric,
    DiagnosticResult,
    DiagnosticStatus,
)
from ..providers import (
    AutomatedDiagnosticProvider,
    DiagnosticMeta,
    DiagnosticRegistry,
    ManualDiagnosticProvider,
)
from . import manual
from .manual import CameraManual, DisplayManual, KeyboardManual, MicrophoneManual, SpeakersManual, TrackpadManual


class SystemDiagnostic(AutomatedDiagnosticProvider):
    """System-level info: uptime, build, machine identity."""

    @property
    def meta(self) -> DiagnosticMeta:
        return DiagnosticMeta(
            kind=DiagnosticKind.SYSTEM,
            title="System",
            why_it_matters="Captures OS build, uptime and machine identity to spot instability and record what was tested.",
            is_manual=False,
        )

    def run(self) -> DiagnosticResult:
        from ..support import windows as win

        metrics: list[DiagnosticMetric] = []

        metrics.append(DiagnosticMetric("OS Version", win.windows_version()))
        metrics.append(DiagnosticMetric("OS Build", win.windows_build()))
        metrics.append(DiagnosticMetric("Architecture", win.architecture()))
        metrics.append(DiagnosticMetric("Computer Name", win.computer_name() or "NOT AVAILABLE"))
        metrics.append(DiagnosticMetric("BIOS Version", win.bios_version() or "NOT AVAILABLE"))

        uptime = win.uptime_seconds()
        metrics.append(
            DiagnosticMetric("Uptime", win.format_uptime(uptime) if uptime else "NOT AVAILABLE")
        )

        status = DiagnosticStatus.PASS
        summary = "System identity captured."
        if uptime is not None and uptime < 300:
            status = DiagnosticStatus.WARNING
            summary = "System just booted (<5 min). Some tests may be less reliable."

        return DiagnosticResult(
            kind=DiagnosticKind.SYSTEM,
            status=status,
            summary=summary,
            metrics=metrics,
        )


class CpuDiagnostic(AutomatedDiagnosticProvider):
    """CPU identity and core/thread counts."""

    @property
    def meta(self) -> DiagnosticMeta:
        return DiagnosticMeta(
            kind=DiagnosticKind.CPU,
            title="CPU",
            why_it_matters="Records processor model and topology as the baseline for stress-test interpretation.",
            is_manual=False,
        )

    def run(self) -> DiagnosticResult:
        from ..support import windows as win

        metrics: list[DiagnosticMetric] = []
        name = win.cpu_name()
        cores = win.cpu_core_count()
        metrics.append(DiagnosticMetric("Processor", name or "NOT AVAILABLE"))
        metrics.append(DiagnosticMetric("Cores / Threads", cores or "NOT AVAILABLE"))

        status = DiagnosticStatus.PASS if name else DiagnosticStatus.NOT_AVAILABLE
        summary = "CPU identified." if name else "CPU details not exposed on this system."

        return DiagnosticResult(
            kind=DiagnosticKind.CPU,
            status=status,
            summary=summary,
            metrics=metrics,
        )


class BatteryDiagnostic(AutomatedDiagnosticProvider):
    """Battery presence and charge via Win32_Battery."""

    @property
    def meta(self) -> DiagnosticMeta:
        return DiagnosticMeta(
            kind=DiagnosticKind.BATTERY,
            title="Battery",
            why_it_matters="Charge and health indicate whether a laptop can hold a portable workload.",
            is_manual=False,
        )

    def run(self) -> DiagnosticResult:
        from ..support import windows as win

        present = win.battery_present()
        if not present:
            return DiagnosticResult(
                kind=DiagnosticKind.BATTERY,
                status=DiagnosticStatus.NOT_AVAILABLE,
                summary="No battery detected (desktop or class not exposed).",
                metrics=[],
            )

        rows = win.cim_rows(
            "Win32_Battery",
            ["EstimatedChargeRemaining", "BatteryStatus", "DesignVoltage"],
        )
        metrics: list[DiagnosticMetric] = []
        status = DiagnosticStatus.PASS
        summary = "Battery detected."

        if rows:
            row = rows[0]
            charge = row.get("EstimatedChargeRemaining")
            if charge is not None:
                metrics.append(DiagnosticMetric("Charge", f"{charge}%"))
                if charge < 20:
                    status = DiagnosticStatus.WARNING
                    summary = f"Battery charge low ({charge}%)."
            bat_status = row.get("BatteryStatus")
            if bat_status is not None:
                metrics.append(DiagnosticMetric("Status Code", str(bat_status)))
        else:
            status = DiagnosticStatus.NOT_AVAILABLE
            summary = "Battery present but details not exposed."

        return DiagnosticResult(
            kind=DiagnosticKind.BATTERY,
            status=status,
            summary=summary,
            metrics=metrics,
        )


class StorageDiagnostic(AutomatedDiagnosticProvider):
    """Fixed-disk capacity and free space."""

    @property
    def meta(self) -> DiagnosticMeta:
        return DiagnosticMeta(
            kind=DiagnosticKind.STORAGE,
            title="Storage",
            why_it_matters="Low free space and failing drives cause data loss and slow performance.",
            is_manual=False,
        )

    def run(self) -> DiagnosticResult:
        from ..support import windows as win

        disks = win.disk_info()
        metrics: list[DiagnosticMetric] = []
        if not disks:
            return DiagnosticResult(
                kind=DiagnosticKind.STORAGE,
                status=DiagnosticStatus.NOT_AVAILABLE,
                summary="No fixed disks exposed.",
                metrics=metrics,
            )

        status = DiagnosticStatus.PASS
        worst_free = 100.0
        for d in disks:
            metrics.append(
                DiagnosticMetric(
                    f"Drive {d['drive']}",
                    f"{d['free_gb']} GB free of {d['size_gb']} GB ({d['used_pct']}% used, {d['fs']})",
                )
            )
            worst_free = min(worst_free, 100.0 - d["used_pct"])

        summary = f"{len(disks)} fixed disk(s) healthy."
        if worst_free < 10:
            status = DiagnosticStatus.FAIL
            summary = "Critically low free disk space (<10%)."
        elif worst_free < 20:
            status = DiagnosticStatus.WARNING
            summary = "Low free disk space (<20%)."

        return DiagnosticResult(
            kind=DiagnosticKind.STORAGE,
            status=status,
            summary=summary,
            metrics=metrics,
        )


class MemoryDiagnostic(AutomatedDiagnosticProvider):
    """Physical memory size and (best-effort) availability."""

    @property
    def meta(self) -> DiagnosticMeta:
        return DiagnosticMeta(
            kind=DiagnosticKind.MEMORY,
            title="Memory",
            why_it_matters="Installed and free RAM frame whether performance issues are memory-bound.",
            is_manual=False,
        )

    def run(self) -> DiagnosticResult:
        from ..support import windows as win

        metrics: list[DiagnosticMetric] = []
        total = win.total_physical_memory_gb()
        metrics.append(DiagnosticMetric("Installed", total or "NOT AVAILABLE"))

        free_raw = win.cim_property("Win32_OperatingSystem", "FreePhysicalMemory")
        if free_raw:
            try:
                free_kb = float(free_raw)
                free_gb = free_kb / (1024 ** 2)
                metrics.append(DiagnosticMetric("Free", f"{free_gb:.1f} GB"))
            except (ValueError, TypeError):
                pass

        status = DiagnosticStatus.PASS if total else DiagnosticStatus.NOT_AVAILABLE
        summary = "Memory size recorded." if total else "Memory details not exposed."

        return DiagnosticResult(
            kind=DiagnosticKind.MEMORY,
            status=status,
            summary=summary,
            metrics=metrics,
        )


class NetworkDiagnostic(AutomatedDiagnosticProvider):
    """Network adapters and link speed."""

    @property
    def meta(self) -> DiagnosticMeta:
        return DiagnosticMeta(
            kind=DiagnosticKind.NETWORK,
            title="Network",
            why_it_matters="Adapter presence and link speed confirm the device can reach the network.",
            is_manual=False,
        )

    def run(self) -> DiagnosticResult:
        from ..support import windows as win

        adapters = win.network_adapters()
        metrics: list[DiagnosticMetric] = []
        if not adapters:
            return DiagnosticResult(
                kind=DiagnosticKind.NETWORK,
                status=DiagnosticStatus.NOT_AVAILABLE,
                summary="No physical network adapters exposed.",
                metrics=metrics,
            )

        connected = [a for a in adapters if a["connected"]]
        for a in adapters[:8]:
            link = f"{a['speed_mbps']} Mbps" if a["speed_mbps"] else "unknown speed"
            state = "Connected" if a["connected"] else "Disconnected"
            metrics.append(DiagnosticMetric("Adapter", f"{a['name']} — {state} ({link})"))
        metrics.append(DiagnosticMetric("Connected", f"{len(connected)} of {len(adapters)}"))

        if connected:
            status = DiagnosticStatus.PASS
            summary = f"{len(connected)} network adapter(s) connected."
        else:
            status = DiagnosticStatus.WARNING
            summary = "No connected network adapters."

        return DiagnosticResult(
            kind=DiagnosticKind.NETWORK,
            status=status,
            summary=summary,
            metrics=metrics,
        )


class PortsDiagnostic(AutomatedDiagnosticProvider):
    """Enumerates USB/PnP devices to flag connected peripherals."""

    @property
    def meta(self) -> DiagnosticMeta:
        return DiagnosticMeta(
            kind=DiagnosticKind.PORTS,
            title="Ports",
            why_it_matters="Enumerates connected USB peripherals; unused physical ports still require a manual check.",
            is_manual=False,
        )

    def run(self) -> DiagnosticResult:
        from ..support import windows as win

        devices = win.usb_devices()
        metrics: list[DiagnosticMetric] = [
            DiagnosticMetric("USB Devices", str(len(devices)))
        ]
        for d in devices[:10]:
            metrics.append(DiagnosticMetric("USB", str(d["name"])))

        status = DiagnosticStatus.PASS if devices else DiagnosticStatus.MANUAL_REQUIRED
        summary = (
            f"{len(devices)} USB device(s) enumerated."
            if devices
            else "No USB devices detected — verify unused ports manually."
        )

        return DiagnosticResult(
            kind=DiagnosticKind.PORTS,
            status=status,
            summary=summary,
            metrics=metrics,
        )


class SensorsDiagnostic(AutomatedDiagnosticProvider):
    """Thermal/fan sensors via WMI ACPI thermal zone (best-effort)."""

    @property
    def meta(self) -> DiagnosticMeta:
        return DiagnosticMeta(
            kind=DiagnosticKind.SENSORS,
            title="Sensors",
            why_it_matters="Thermal zones and fans reveal cooling problems that throttle performance.",
            is_manual=False,
        )

    def run(self) -> DiagnosticResult:
        from ..support import windows as win

        zones = win.cim_rows("Win32_TemperatureZone", ["Name", "CurrentReading"])
        fans = win.cim_rows("Win32_Fan", ["ActiveCooling"])

        metrics: list[DiagnosticMetric] = []
        metrics.append(DiagnosticMetric("Thermal Zones", str(len(zones))))
        metrics.append(DiagnosticMetric("Fans", str(len(fans))))

        if not zones and not fans:
            return DiagnosticResult(
                kind=DiagnosticKind.SENSORS,
                status=DiagnosticStatus.NOT_AVAILABLE,
                summary="Thermal/fan sensors not exposed by Windows on this system.",
                metrics=metrics,
            )

        for z in zones[:4]:
            reading = z.get("CurrentReading")
            metrics.append(
                DiagnosticMetric("Thermal", f"{z.get('Name', 'Zone')}: {reading if reading else 'n/a'}")
            )

        return DiagnosticResult(
            kind=DiagnosticKind.SENSORS,
            status=DiagnosticStatus.PASS,
            summary="Thermal/fan data captured where exposed.",
            metrics=metrics,
        )


def build_default_registry() -> DiagnosticRegistry:
    """Assemble the standard Windows diagnostic registry."""
    automated: list[AutomatedDiagnosticProvider] = [
        SystemDiagnostic(),
        CpuDiagnostic(),
        MemoryDiagnostic(),
        StorageDiagnostic(),
        BatteryDiagnostic(),
        NetworkDiagnostic(),
        PortsDiagnostic(),
        SensorsDiagnostic(),
    ]

    manual_providers: list[ManualDiagnosticProvider] = [
        DisplayManual(),
        KeyboardManual(),
        TrackpadManual(),
        SpeakersManual(),
        MicrophoneManual(),
        CameraManual(),
    ]

    return DiagnosticRegistry(_automated=automated, _manual=manual_providers)
