"""Windows Diagnostic Center.

A lightweight, offline-first hardware diagnostic tool for IT technicians,
mirroring the architecture of MacDiagnosticApp but implemented in pure
Python stdlib (tkinter GUI, no third-party dependencies).
"""

from .models import (  # noqa: F401
    DiagnosticKind,
    DiagnosticMetric,
    DiagnosticResult,
    DiagnosticSession,
    DiagnosticStatus,
    DeviceInfo,
    OverallResult,
    OverallVerdict,
    TechnicianProfile,
)

APP_NAME = "Windows Diagnostic Center"
APP_VERSION = "1.0.0"
