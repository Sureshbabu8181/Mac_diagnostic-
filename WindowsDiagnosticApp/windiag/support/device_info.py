"""Builds a DeviceInfo summary from the Windows support layer.

Every field degrades to the shared UNAVAILABLE sentinel rather than fabricating
a value, matching the MacDiagnosticApp guarantee.
"""

from __future__ import annotations

from ..models import DeviceInfo
from . import windows as win


def detect_device() -> DeviceInfo:
    """Collect the hardware/system summary. Safe to call at startup."""
    u = DeviceInfo.UNAVAILABLE
    return DeviceInfo(
        manufacturer=win.manufacturer() or u,
        model=win.model() or u,
        serial_number=win.serial_number() or u,
        cpu_name=win.cpu_name() or u,
        cpu_cores=win.cpu_core_count() or u,
        gpu_name=win.gpu_name() or u,
        memory_gb=win.total_physical_memory_gb() or u,
        storage_gb=win.total_storage_gb() or u,
        os_version=win.windows_version(),
        os_build=win.windows_build(),
        architecture=win.architecture(),
        computer_name=win.computer_name() or u,
        hostname=win.hostname() or u,
    )
