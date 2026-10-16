"""Offline self-test runner.

Runs every automated diagnostic and prints a live readout — no GUI or Xcode
required (mirrors MacDiagnosticApp's `macdiagnostic-selftest`). Useful to
validate the engine and hardware access layer on a target machine.

Usage:
    python -m windiag.selftest
"""

from __future__ import annotations

import sys
import time

from . import APP_NAME, APP_VERSION
from .diagnostics import build_default_registry
from .engine import DiagnosticEngine
from .models import DiagnosticKind, DiagnosticStatus
from .support.device_info import detect_device


_STATUS_ORDER = [
    DiagnosticStatus.PASS,
    DiagnosticStatus.WARNING,
    DiagnosticStatus.FAIL,
    DiagnosticStatus.NOT_AVAILABLE,
    DiagnosticStatus.SKIPPED,
    DiagnosticStatus.MANUAL_REQUIRED,
    DiagnosticStatus.NOT_STARTED,
    DiagnosticStatus.RUNNING,
]


def _configure_console() -> None:
    """Emit UTF-8 so box-drawing/arrows render instead of raising on cp1252."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
        except (AttributeError, OSError):
            pass


def main(argv: list[str] | None = None) -> int:
    _configure_console()
    print(f"{APP_NAME} self-test v{APP_VERSION}")
    print("=" * 56)

    t0 = time.time()
    print("Detecting device…")
    device = detect_device()
    print(f"  Device   : {device.manufacturer} {device.model}")
    print(f"  CPU      : {device.cpu_name} ({device.cpu_cores})")
    print(f"  Memory   : {device.memory_gb}")
    print(f"  Storage  : {device.storage_gb}")
    print(f"  OS       : {device.os_version} [{device.architecture}]")
    print("-" * 56)

    registry = build_default_registry()
    engine = DiagnosticEngine(
        registry=registry,
        device=device,
        technician="selftest",
        app_version=APP_VERSION,
        on_kind_start=lambda kind: print(f"  ▸ {kind.display_name}…", flush=True),
    )

    engine.run_automated()
    engine.finish_session()
    elapsed = time.time() - t0

    print("-" * 56)
    print("Automated results:")
    width = max(len(k.display_name) for k in DiagnosticKind)
    automated = [
        r for r in engine.session.results if not r.kind.is_manual
    ]
    automated.sort(key=lambda r: _STATUS_ORDER.index(r.status))
    for r in automated:
        print(f"  {r.kind.display_name:<{width}}  {r.status.value:<16}  {r.summary}")

    manual = [r for r in engine.session.results if r.kind.is_manual]
    if manual:
        print("-" * 56)
        print("Manual tests (require technician):")
        for r in manual:
            print(f"  {r.kind.display_name:<{width}}  {r.status.value}")

    print("-" * 56)
    print(f"Overall verdict : {engine.session.overall.verdict.value}")
    print(f"Elapsed         : {elapsed:.1f}s")

    # Exit non-zero on a hard failure so CI/scripts can gate on it.
    if engine.session.overall.verdict.value == "FAIL":
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
