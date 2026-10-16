"""Automated, headless diagnostic tests.

Each test returns a TestOutcome. These run without a GUI so they back the
Automatic Diagnostics workflow and the CLI. Interactive tests (display,
keyboard, camera, mic...) live in the GUI layer because they need technician
participation — those report their verdicts back through the dashboard.
"""

from __future__ import annotations

from typing import Callable, Optional

from ..support import hardware as hw
from ..support import windows as win
from ..testkit import Reading, TestID, TestOutcome, TestStatus, Timer


# --------------------------------------------------------------------------- #
# System Information
# --------------------------------------------------------------------------- #
def run_system_info() -> TestOutcome:
    with Timer() as t:
        device = _device_summary()
        os_info = hw.os_info()
        bios = hw.bios_info()
        baseboard = hw.baseboard_info()
        gpus = hw.gpu_info()

        readings = [
            Reading("Manufacturer", device.get("manufacturer", "NOT AVAILABLE")),
            Reading("Model", device.get("model", "NOT AVAILABLE")),
            Reading("Serial", device.get("serial", "NOT AVAILABLE")),
            Reading("CPU", device.get("cpu", "NOT AVAILABLE")),
            Reading("Cores / Threads", device.get("cores", "NOT AVAILABLE")),
            Reading("Memory", device.get("memory", "NOT AVAILABLE")),
            Reading("GPU", ", ".join(g["name"] for g in gpus) if gpus else "NOT AVAILABLE"),
            Reading("OS", os_info.get("Caption", "NOT AVAILABLE")),
            Reading("OS Build", os_info.get("BuildNumber", "NOT AVAILABLE")),
            Reading("BIOS", bios.get("SMBIOSBIOSVersion", "NOT AVAILABLE"), source="Win32_BIOS"),
            Reading("Baseboard", baseboard.get("Product", "NOT AVAILABLE"), source="Win32_BaseBoard"),
        ]

    return TestOutcome(
        test_id=TestID.SYSTEM_INFO,
        status=TestStatus.PASSED if readings else TestStatus.UNSUPPORTED,
        summary="System inventory captured.",
        readings=readings,
        started_at=t.start,
        duration_s=t.elapsed,
    )


def _device_summary() -> dict:
    cs = hw.computer_system_info()
    cpus = win.cim_rows("Win32_Processor", ["Name", "NumberOfCores", "NumberOfLogicalProcessors"])
    cpu_row = cpus[0] if cpus else {}
    mem = hw.memory_status()
    return {
        "manufacturer": cs.get("Manufacturer", "NOT AVAILABLE"),
        "model": cs.get("Model", "NOT AVAILABLE"),
        "serial": hw.bios_info().get("SerialNumber", "NOT AVAILABLE"),
        "cpu": cpu_row.get("Name", "NOT AVAILABLE"),
        "cores": (
            f"{cpu_row.get('NumberOfCores')} cores / {cpu_row.get('NumberOfLogicalProcessors')} threads"
            if cpu_row
            else "NOT AVAILABLE"
        ),
        "memory": f"{mem.get('total_gb', 'NOT AVAILABLE')} GB" if mem.get("total_gb") else "NOT AVAILABLE",
    }


# --------------------------------------------------------------------------- #
# Battery & Charging
# --------------------------------------------------------------------------- #
def run_battery() -> TestOutcome:
    with Timer() as t:
        health = hw.battery_health()

    if not health.get("present"):
        return TestOutcome(
            test_id=TestID.BATTERY,
            status=TestStatus.UNSUPPORTED,
            summary="No battery detected (desktop or not exposed by the system).",
            started_at=t.start,
            duration_s=t.elapsed,
        )

    readings: list[Reading] = []
    warnings: list[str] = []
    if "charge_pct" in health:
        readings.append(Reading("Charge", str(health["charge_pct"]), "%", "Win32_Battery"))
    readings.append(
        Reading("Charging", "Yes" if health.get("charging") else "No", source="Win32_Battery")
    )
    if "health_pct" in health:
        readings.append(Reading("Health (full/design)", str(health["health_pct"]), "%"))
        readings.append(Reading("Design capacity", str(health.get("design_capacity", "")), "mWh"))
        readings.append(Reading("Full charge capacity", str(health.get("full_charge_capacity", "")), "mWh"))
        if health["health_pct"] < 50:
            warnings.append(f"Battery health is low ({health['health_pct']}%).")
    else:
        warnings.append("Design/full-charge capacity not exposed by this system.")

    status = TestStatus.WARNING if warnings else TestStatus.PASSED
    return TestOutcome(
        test_id=TestID.BATTERY,
        status=status,
        summary="Battery status captured.",
        readings=readings,
        warnings=warnings,
        started_at=t.start,
        duration_s=t.elapsed,
    )


# --------------------------------------------------------------------------- #
# SSD / HDD Health (read-only)
# --------------------------------------------------------------------------- #
def run_storage_health() -> TestOutcome:
    with Timer() as t:
        disks = hw.physical_disks()
        smart = hw.storage_smart_status()

    if not disks:
        return TestOutcome(
            test_id=TestID.STORAGE_HEALTH,
            status=TestStatus.UNSUPPORTED,
            summary="No physical disks exposed.",
            started_at=t.start,
            duration_s=t.elapsed,
        )

    readings: list[Reading] = []
    warnings: list[str] = []
    for d in disks[:6]:
        label = f"{d['model']}"
        size = f"{d['size_gb']} GB" if d["size_gb"] else "unknown"
        iface = d["interface"] or "unknown interface"
        readings.append(Reading(label, f"{size} ({iface})", source="Win32_DiskDrive"))
    if smart:
        readings.append(Reading("SMART status", str(smart), source="Win32_DiskDrive"))
        if "failure" in str(smart).lower():
            warnings.append("SMART reports a predictive failure.")
    else:
        warnings.append("SMART health data not exposed; verify with vendor tool.")

    status = TestStatus.WARNING if warnings else TestStatus.PASSED
    return TestOutcome(
        test_id=TestID.STORAGE_HEALTH,
        status=status,
        summary="Storage inventory captured (read-only).",
        readings=readings,
        warnings=warnings,
        started_at=t.start,
        duration_s=t.elapsed,
    )


# --------------------------------------------------------------------------- #
# Wi-Fi & Network
# --------------------------------------------------------------------------- #
def run_network() -> TestOutcome:
    with Timer() as t:
        adapters = win.network_adapters()
        configs = hw.ip_configuration()
        latency = hw.ping_latency("8.8.8.8", count=2)
        gateway_latency = None
        gateways = []
        for c in configs:
            gateways.extend(c.get("gateways", []))

    readings: list[Reading] = []
    warnings: list[str] = []
    connected = [a for a in adapters if a["connected"]]
    readings.append(Reading("Adapters connected", f"{len(connected)} of {len(adapters)}"))
    for c in configs[:4]:
        readings.append(Reading("IP", ", ".join(c["ip_addresses"]), source=c["description"]))
        if c["gateways"]:
            readings.append(Reading("Gateway", ", ".join(c["gateways"])))
    if latency is not None:
        readings.append(Reading("Internet latency", str(latency), "ms", "ping 8.8.8.8"))
    else:
        warnings.append("No internet response (ping 8.8.8.8 failed). Local vs internet issue possible.")

    if not connected:
        status = TestStatus.WARNING
        summary = "No connected network adapters."
    elif latency is None:
        status = TestStatus.WARNING
        summary = "Adapter connected but no internet response."
    else:
        status = TestStatus.PASSED
        summary = f"Network OK, {latency} ms to internet."

    return TestOutcome(
        test_id=TestID.NETWORK,
        status=status,
        summary=summary,
        readings=readings,
        warnings=warnings,
        started_at=t.start,
        duration_s=t.elapsed,
    )


# --------------------------------------------------------------------------- #
# Bluetooth
# --------------------------------------------------------------------------- #
def run_bluetooth() -> TestOutcome:
    with Timer() as t:
        radio = hw.bluetooth_radio()

    if not radio or not radio.get("present"):
        return TestOutcome(
            test_id=TestID.BLUETOOTH,
            status=TestStatus.UNSUPPORTED,
            summary="No Bluetooth radio detected.",
            started_at=t.start,
            duration_s=t.elapsed,
        )

    status_text = str(radio.get("status", "")).lower()
    status = TestStatus.PASSED if status_text == "ok" else TestStatus.WARNING
    return TestOutcome(
        test_id=TestID.BLUETOOTH,
        status=status,
        summary=f"Bluetooth radio present: {radio['name']}.",
        readings=[Reading("Radio", radio["name"], source="Win32_PnPEntity"),
                  Reading("Status", radio.get("status", "unknown"))],
        warnings=[] if status_text == "ok" else ["Bluetooth device reports a non-OK status."],
        started_at=t.start,
        duration_s=t.elapsed,
    )


# --------------------------------------------------------------------------- #
# USB & External Ports
# --------------------------------------------------------------------------- #
def run_usb() -> TestOutcome:
    with Timer() as t:
        devices = win.usb_devices()

    readings = [Reading("USB devices detected", str(len(devices)))]
    for d in devices[:10]:
        readings.append(Reading("Device", str(d["name"]), source="Win32_PnPEntity"))

    # Detection alone does not prove a physical port passed — that needs a
    # guided plug-in check, so report observation only.
    return TestOutcome(
        test_id=TestID.USB,
        status=TestStatus.PASSED if devices else TestStatus.WARNING,
        summary=f"{len(devices)} USB device(s) enumerated. Physical port verification requires a guided plug-in test.",
        readings=readings,
        warnings=[] if devices else ["No USB devices detected."],
        started_at=t.start,
        duration_s=t.elapsed,
    )


# --------------------------------------------------------------------------- #
# Temperature & Sensors (observation)
# --------------------------------------------------------------------------- #
def run_thermal() -> TestOutcome:
    with Timer() as t:
        temp = hw.cpu_temperature_c()
        load = hw.cpu_load_percent()
        clock = hw.cpu_clock_mhz()
        max_clock = hw.cpu_max_clock_mhz()
        rpm = hw.fan_rpm()

    readings: list[Reading] = []
    warnings: list[str] = []
    if temp is not None:
        readings.append(Reading("CPU temperature", str(temp), "°C", "MSAcpi_ThermalZoneTemperature"))
        if temp > 90:
            warnings.append(f"CPU temperature is high ({temp} °C).")
    else:
        warnings.append("CPU temperature not exposed by Windows on this system.")
    if load is not None:
        readings.append(Reading("CPU load", str(load), "%", "Win32_Processor"))
    if clock is not None:
        clock_reading = f"{clock:.0f}"
        if max_clock:
            clock_reading += f" / {max_clock:.0f}"
        readings.append(Reading("CPU clock", clock_reading, "MHz", "Win32_Processor"))
    if rpm is not None:
        readings.append(Reading("Fan RPM", str(rpm), "RPM", "Win32_Fan"))
    else:
        warnings.append("Fan RPM not exposed by public Windows APIs.")

    has_any = bool(readings)
    status = TestStatus.WARNING if warnings else TestStatus.PASSED
    if not has_any:
        status = TestStatus.UNSUPPORTED

    return TestOutcome(
        test_id=TestID.THERMAL,
        status=status,
        summary="Thermal/sensor readings captured where available.",
        readings=readings,
        warnings=warnings,
        started_at=t.start,
        duration_s=t.elapsed,
    )


# --------------------------------------------------------------------------- #
# Windows & Driver Health (read-only)
# --------------------------------------------------------------------------- #
def run_windows_health() -> TestOutcome:
    with Timer() as t:
        problems = hw.device_manager_problems()
        os_info = hw.os_info()

    readings = [
        Reading("OS", os_info.get("Caption", "NOT AVAILABLE")),
        Reading("Build", os_info.get("BuildNumber", "NOT AVAILABLE")),
        Reading("Device problems", str(len(problems)), source="Win32_PnPEntity"),
    ]
    warnings: list[str] = []
    for p in problems[:8]:
        readings.append(Reading("Problem device", f"{p['name']} (code {p['error_code']})"))
        warnings.append(f"{p['name']}: problem code {p['error_code']}.")

    status = TestStatus.WARNING if problems else TestStatus.PASSED
    return TestOutcome(
        test_id=TestID.WINDOWS_HEALTH,
        status=status,
        summary=(
            f"{len(problems)} device(s) report problems."
            if problems
            else "No Device Manager problems detected."
        ),
        readings=readings,
        warnings=warnings,
        started_at=t.start,
        duration_s=t.elapsed,
    )


# Registry of headless automated tests keyed by id, in recommended run order.
AUTOMATED_TESTS: dict[TestID, Callable[[], TestOutcome]] = {
    TestID.SYSTEM_INFO: run_system_info,
    TestID.BATTERY: run_battery,
    TestID.STORAGE_HEALTH: run_storage_health,
    TestID.NETWORK: run_network,
    TestID.BLUETOOTH: run_bluetooth,
    TestID.USB: run_usb,
    TestID.THERMAL: run_thermal,
    TestID.WINDOWS_HEALTH: run_windows_health,
}
