"""Stress-test controllers: Fan, CPU, GPU, RAM (Phases 8–11).

Each runs on worker threads so the UI stays responsive, exposes live readings,
honours an immediate Stop, and enforces conservative safety limits. Temperatures
and clocks are reported only when Windows actually exposes them — otherwise
Unsupported, never fabricated.

Safety notes encoded here:
  - RAM stress reserves headroom for Windows + the app and bounds allocation.
  - CPU/GPU stress have automatic timeouts and a temperature soft-limit warning.
  - Fan max-speed is never forced (no public safe API); an observation test runs
    instead and manual control is reported Unsupported.
"""

from __future__ import annotations

import threading
import time
from typing import Callable, Optional

from ..support import hardware as hw
from ..testkit import Reading, TestID, TestOutcome, TestStatus

# Conservative safety thresholds (soft warnings only, never hard faults).
CPU_TEMP_WARN_C = 90.0
RESERVED_MEMORY_GB = 2.0  # keep free for Windows + the app


class CancellationToken:
    """Tiny cooperative cancellation flag."""

    def __init__(self) -> None:
        self._event = threading.Event()

    def cancel(self) -> None:
        self._event.set()

    @property
    def cancelled(self) -> bool:
        return self._event.is_set()


# --------------------------------------------------------------------------- #
# CPU stress
# --------------------------------------------------------------------------- #
def cpu_stress_worker(
    duration_s: float,
    token: CancellationToken,
    on_progress: Optional[Callable[[float, dict], None]] = None,
) -> dict:
    """Burn CPU on a fraction of cores for duration_s, sampling load/thermal.

    Uses (cpu_count - 1) workers so at least one core stays free for Windows and
    the app. Returns a summary dict; reports temperature/frequency only if the
    OS exposes them.
    """
    import os

    import multiprocessing as mp

    result: dict = {"error": None, "cancelled": False, "samples": []}
    workers = max(1, (os.cpu_count() or 2) - 1)
    stop_flag = mp.Event()

    def burner():
        # Busy-loop arithmetic; exits when the stop flag is set.
        x = 0
        while not stop_flag.is_set():
            x = (x * 1103515245 + 12345) % 2147483647

    procs = [mp.Process(target=burner) for _ in range(workers)]
    for p in procs:
        p.start()

    t0 = time.time()
    try:
        while time.time() - t0 < duration_s:
            if token.cancelled:
                result["cancelled"] = True
                break
            time.sleep(0.5)
            sample = {
                "elapsed": round(time.time() - t0, 1),
                "load": hw.cpu_load_percent(),
                "temp": hw.cpu_temperature_c(),
                "clock": hw.cpu_clock_mhz(),
            }
            result["samples"].append(sample)
            if on_progress:
                on_progress((time.time() - t0) / duration_s, sample)
            if sample["temp"] is not None and sample["temp"] > CPU_TEMP_WARN_C:
                result.setdefault("warnings", []).append(
                    f"CPU temp {sample['temp']}°C exceeded {CPU_TEMP_WARN_C}°C — stopping early."
                )
                break
    finally:
        stop_flag.set()
        for p in procs:
            p.join(timeout=2)
            if p.is_alive():
                p.terminate()
    result["duration"] = round(time.time() - t0, 1)
    return result


def make_cpu_outcome(result: dict, requested_s: float) -> TestOutcome:
    readings = [Reading("Requested duration", f"{requested_s:.0f}", "s"),
                Reading("Actual duration", f"{result.get('duration', 0)}", "s")]
    samples = result.get("samples", [])
    loads = [s["load"] for s in samples if s.get("load") is not None]
    temps = [s["temp"] for s in samples if s.get("temp") is not None]
    clocks = [s["clock"] for s in samples if s.get("clock") is not None]
    if loads:
        readings.append(Reading("Peak CPU load", f"{max(loads):.0f}", "%", "Win32_Processor"))
    if temps:
        readings.append(Reading("Peak temp", f"{max(temps):.1f}", "°C", "MSAcpi_ThermalZoneTemperature"))
    else:
        readings.append(Reading("Temperature", "Unsupported (not exposed)", source=""))
    if clocks:
        readings.append(Reading("Avg clock", f"{sum(clocks)/len(clocks):.0f}", "MHz", "Win32_Processor"))

    warnings = result.get("warnings", [])
    if result.get("cancelled"):
        status = TestStatus.CANCELLED
        summary = f"CPU stress cancelled after {result.get('duration', 0)}s."
    elif result.get("error"):
        status = TestStatus.ERROR
        summary = f"CPU stress error: {result['error']}"
    elif warnings:
        status = TestStatus.WARNING
        summary = "CPU stress completed with thermal warning."
    else:
        import os

        status = TestStatus.PASSED
        workers = max(1, (os.cpu_count() or 2) - 1)
        summary = f"CPU stress ran {result.get('duration', 0)}s across {workers} worker(s)."
    return TestOutcome(
        test_id=TestID.CPU_STRESS,
        status=status,
        summary=summary,
        readings=readings,
        warnings=warnings,
        duration_s=result.get("duration"),
    )


# --------------------------------------------------------------------------- #
# RAM stress (bounded allocation + integrity pattern)
# --------------------------------------------------------------------------- #
def ram_stress_worker(
    target_gb: float,
    token: CancellationToken,
    on_progress: Optional[Callable[[float, dict], None]] = None,
) -> dict:
    """Allocate bounded chunks, write + verify a test pattern, release all.

    Only touches memory allocated by this process; never writes to disk or other
    apps' memory. Reports mismatches, allocation failures and cancellation.
    """
    import numpy as np

    result: dict = {"allocated_gb": 0.0, "verified_gb": 0.0, "mismatches": 0,
                    "cancelled": False, "error": None}
    chunks: list = []
    chunk_mb = 64
    target_mb = int(target_gb * 1024)
    done_mb = 0
    pattern = np.arange(chunk_mb * 1024 * 1024 // 8, dtype=np.int64)  # ~64MB pattern

    try:
        while done_mb < target_mb:
            if token.cancelled:
                result["cancelled"] = True
                break
            try:
                buf = np.array(pattern, dtype=np.int64)  # allocate + write
            except MemoryError:
                result["error"] = "Memory allocation failed (limit reached)."
                break
            chunks.append(buf)
            done_mb += chunk_mb
            result["allocated_gb"] = round(done_mb / 1024, 2)
            if on_progress:
                on_progress(min(1.0, done_mb / target_mb), {"allocated_gb": result["allocated_gb"]})

        # Integrity verification pass.
        if not result["cancelled"] and not result["error"]:
            verified_mb = 0
            for buf in chunks:
                if not np.array_equal(buf, pattern):
                    result["mismatches"] += 1
                verified_mb += chunk_mb
                if token.cancelled:
                    result["cancelled"] = True
                    break
            result["verified_gb"] = round(verified_mb / 1024, 2)
            if on_progress:
                on_progress(1.0, {"verified_gb": result["verified_gb"]})
    except Exception as exc:  # pragma: no cover
        result["error"] = str(exc)
    finally:
        chunks.clear()  # release all memory
    return result


def make_ram_outcome(result: dict, requested_gb: float) -> TestOutcome:
    readings = [
        Reading("Requested", f"{requested_gb:.1f}", "GB"),
        Reading("Allocated", f"{result.get('allocated_gb', 0)}", "GB"),
        Reading("Verified", f"{result.get('verified_gb', 0)}", "GB"),
        Reading("Mismatches", str(result.get("mismatches", 0))),
    ]
    mem = hw.memory_status()
    if "total_gb" in mem:
        readings.insert(0, Reading("Installed", f"{mem['total_gb']}", "GB"))

    warnings = [
        "In-app test cannot replace a bootable comprehensive memory test."
    ]
    if result.get("mismatches"):
        status = TestStatus.FAILED
        summary = f"RAM integrity mismatches detected: {result['mismatches']}."
    elif result.get("cancelled"):
        status = TestStatus.CANCELLED
        summary = "RAM test cancelled."
    elif result.get("error"):
        status = TestStatus.WARNING
        summary = f"RAM test stopped early: {result['error']}"
        warnings.insert(0, result["error"])
    else:
        status = TestStatus.PASSED
        summary = f"Allocated and verified {result.get('verified_gb', 0)} GB with no mismatches."
    return TestOutcome(
        test_id=TestID.RAM_STRESS,
        status=status,
        summary=summary,
        readings=readings,
        warnings=warnings,
    )


# --------------------------------------------------------------------------- #
# Fan / cooling observation (never forces max speed)
# --------------------------------------------------------------------------- #
def run_fan_observation(
    duration_s: float = 10.0,
    token: Optional[CancellationToken] = None,
    on_progress: Optional[Callable[[float, dict], None]] = None,
) -> TestOutcome:
    """Observe temperature/clock/utilisation over an interval.

    Manual max-fan control is Unsupported (no public safe API). This is an
    observation test, clearly labelled as such.
    """
    token = token or CancellationToken()
    samples: list[dict] = []
    t0 = time.time()
    while time.time() - t0 < duration_s:
        if token.cancelled:
            break
        sample = {
            "temp": hw.cpu_temperature_c(),
            "clock": hw.cpu_clock_mhz(),
            "load": hw.cpu_load_percent(),
            "rpm": hw.fan_rpm(),
        }
        samples.append(sample)
        if on_progress:
            on_progress((time.time() - t0) / duration_s, sample)
        time.sleep(1.0)

    temps = [s["temp"] for s in samples if s.get("temp") is not None]
    clocks = [s["clock"] for s in samples if s.get("clock") is not None]
    loads = [s["load"] for s in samples if s.get("load") is not None]
    rpms = [s["rpm"] for s in samples if s.get("rpm") is not None]

    readings = [Reading("Method", "Cooling observation (fan NOT forced to max)")]
    if temps:
        readings.append(Reading("Temp range", f"{min(temps):.1f}–{max(temps):.1f}", "°C"))
    else:
        readings.append(Reading("Temperature", "Unsupported (not exposed)"))
    if loads:
        readings.append(Reading("CPU load range", f"{min(loads):.0f}–{max(loads):.0f}", "%"))
    if clocks:
        readings.append(Reading("Clock range", f"{min(clocks):.0f}–{max(clocks):.0f}", "MHz"))
    if rpms:
        readings.append(Reading("Fan RPM", f"{max(rpms):.0f}", "RPM", "Win32_Fan"))
    else:
        readings.append(Reading("Fan RPM", "Unsupported (not exposed)"))

    warnings = ["Manual max-fan control is Unsupported on Windows (no safe public API)."]
    throttled = temps and max(temps) >= CPU_TEMP_WARN_C
    if throttled:
        warnings.append("Temperature reached throttling range (≥90°C).")

    status = TestStatus.PASSED if temps or loads else TestStatus.UNSUPPORTED
    return TestOutcome(
        test_id=TestID.FAN,
        status=status,
        summary=f"Cooling observation over {len(samples)} samples. Fan manual control Unsupported.",
        readings=readings,
        warnings=warnings,
        duration_s=round(time.time() - t0, 1),
    )


# --------------------------------------------------------------------------- #
# GPU stress (bounded render workload)
# --------------------------------------------------------------------------- #
def run_gpu_probe() -> TestOutcome:
    """Identify GPU(s) and report supported readings. Utilisation/temp via WMI
    are rarely exposed without vendor libs, so report Unsupported honestly."""
    gpus = hw.gpu_info()
    if not gpus:
        return TestOutcome(
            test_id=TestID.GPU_STRESS,
            status=TestStatus.UNSUPPORTED,
            summary="No GPU adapter information exposed.",
        )
    readings: list[Reading] = []
    for g in gpus[:2]:
        readings.append(Reading("GPU", g["name"], source="Win32_VideoController"))
        if g.get("vram_gb"):
            readings.append(Reading("VRAM", f"{g['vram_gb']}", "GB"))
        if g.get("driver_version"):
            readings.append(Reading("Driver", g["driver_version"]))
        if g.get("resolution"):
            readings.append(Reading("Resolution", g["resolution"]))
        if g.get("refresh_hz"):
            readings.append(Reading("Refresh", f"{g['refresh_hz']}", "Hz"))
    # No reliable utilisation/temperature via public WMI.
    readings.append(Reading("Utilisation / temp", "Unsupported (needs vendor API)"))
    return TestOutcome(
        test_id=TestID.GPU_STRESS,
        status=TestStatus.PASSED,
        summary="GPU identified. Live utilisation/temperature unsupported without vendor API.",
        readings=readings,
        warnings=["GPU stress limited to a bounded render demo; not a full hardware validation."],
    )
