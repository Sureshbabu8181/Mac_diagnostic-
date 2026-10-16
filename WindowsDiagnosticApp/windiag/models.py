"""Core domain models for the Windows Diagnostic Center.

These mirror the proven architecture of MacDiagnosticApp:
  - DiagnosticKind:   catalogue of test modules
  - DiagnosticStatus: single source of truth for a test outcome
  - DiagnosticResult: outcome of one module (status + summary + metrics)
  - DiagnosticSession: a full run on one device, as saved for history/reports
  - DeviceInfo:        detected hardware summary (never fabricated)

All values are plain stdlib dataclasses/enums so the GUI, engine and store can
share them without any third-party dependency.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional


# --------------------------------------------------------------------------- #
# Status
# --------------------------------------------------------------------------- #
class DiagnosticStatus(str, Enum):
    """Single source of truth for the outcome of any test.

    Statuses are never fabricated: when Windows does not expose a value we
    report NOT_AVAILABLE rather than guessing.
    """

    NOT_STARTED = "NOT TESTED"
    RUNNING = "RUNNING"
    PASS = "PASS"
    WARNING = "WARNING"
    FAIL = "FAIL"
    SKIPPED = "SKIPPED"
    NOT_AVAILABLE = "NOT AVAILABLE"
    MANUAL_REQUIRED = "MANUAL REQUIRED"

    @property
    def is_pending(self) -> bool:
        """True for statuses that still require technician action."""
        return self in (
            DiagnosticStatus.NOT_STARTED,
            DiagnosticStatus.RUNNING,
            DiagnosticStatus.MANUAL_REQUIRED,
        )

    @property
    def is_complete(self) -> bool:
        return not self.is_pending


# --------------------------------------------------------------------------- #
# Kind
# --------------------------------------------------------------------------- #
class DiagnosticKind(str, Enum):
    """Catalogue of diagnostic modules."""

    SYSTEM = "system"
    CPU = "cpu"
    MEMORY = "memory"
    STORAGE = "storage"
    BATTERY = "battery"
    NETWORK = "network"
    PORTS = "ports"
    SENSORS = "sensors"
    DISPLAY = "display"
    KEYBOARD = "keyboard"
    TRACKPAD = "trackpad"
    SPEAKERS = "speakers"
    MICROPHONE = "microphone"
    CAMERA = "camera"
    STRESS_TEST = "stress_test"
    RAM_STRESS = "ram_stress"

    @property
    def display_name(self) -> str:
        return _KIND_DISPLAY_NAMES[self]

    @property
    def is_manual(self) -> bool:
        """Manual modules pause the run for a technician PASS/FAIL/SKIP."""
        return self in _MANUAL_KINDS


_KIND_DISPLAY_NAMES: dict[DiagnosticKind, str] = {
    DiagnosticKind.SYSTEM: "System",
    DiagnosticKind.CPU: "CPU",
    DiagnosticKind.MEMORY: "Memory",
    DiagnosticKind.STORAGE: "Storage",
    DiagnosticKind.BATTERY: "Battery",
    DiagnosticKind.NETWORK: "Network",
    DiagnosticKind.PORTS: "Ports",
    DiagnosticKind.SENSORS: "Sensors",
    DiagnosticKind.DISPLAY: "Display",
    DiagnosticKind.KEYBOARD: "Keyboard",
    DiagnosticKind.TRACKPAD: "Trackpad",
    DiagnosticKind.SPEAKERS: "Speakers",
    DiagnosticKind.MICROPHONE: "Microphone",
    DiagnosticKind.CAMERA: "Camera",
    DiagnosticKind.STRESS_TEST: "Stress Test",
    DiagnosticKind.RAM_STRESS: "RAM Stress Test",
}

_MANUAL_KINDS = frozenset(
    {
        DiagnosticKind.DISPLAY,
        DiagnosticKind.KEYBOARD,
        DiagnosticKind.TRACKPAD,
        DiagnosticKind.SPEAKERS,
        DiagnosticKind.MICROPHONE,
        DiagnosticKind.CAMERA,
    }
)


# --------------------------------------------------------------------------- #
# Metric
# --------------------------------------------------------------------------- #
@dataclass
class DiagnosticMetric:
    """A single measured field (e.g. "Cycles" -> "412")."""

    name: str
    value: str

    def to_dict(self) -> dict:
        return {"name": self.name, "value": self.value}

    @classmethod
    def from_dict(cls, d: dict) -> "DiagnosticMetric":
        return cls(name=d.get("name", ""), value=d.get("value", ""))


# --------------------------------------------------------------------------- #
# Result
# --------------------------------------------------------------------------- #
@dataclass
class DiagnosticResult:
    """Outcome of one diagnostic module."""

    kind: DiagnosticKind
    status: DiagnosticStatus = DiagnosticStatus.NOT_STARTED
    summary: str = ""
    metrics: list[DiagnosticMetric] = field(default_factory=list)
    technician_notes: str = ""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    def metric(self, name: str) -> Optional[str]:
        for m in self.metrics:
            if m.name == name:
                return m.value
        return None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind.value,
            "status": self.status.value,
            "summary": self.summary,
            "metrics": [m.to_dict() for m in self.metrics],
            "technician_notes": self.technician_notes,
            "timestamp": self.timestamp.isoformat(),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "DiagnosticResult":
        return cls(
            kind=DiagnosticKind(d["kind"]),
            status=DiagnosticStatus(d["status"]),
            summary=d.get("summary", ""),
            metrics=[DiagnosticMetric.from_dict(m) for m in d.get("metrics", [])],
            technician_notes=d.get("technician_notes", ""),
            id=d.get("id", str(uuid.uuid4())),
            timestamp=_parse_ts(d.get("timestamp")),
        )


# --------------------------------------------------------------------------- #
# Overall result
# --------------------------------------------------------------------------- #
class OverallVerdict(str, Enum):
    PASS = "PASS"
    PASS_WITH_WARNING = "PASS WITH WARNING"
    FAIL = "FAIL"
    MANUAL_REQUIRED = "MANUAL REQUIRED"
    IN_PROGRESS = "IN PROGRESS"


@dataclass
class OverallResult:
    verdict: OverallVerdict
    failed_tests: list[DiagnosticKind] = field(default_factory=list)
    warning_tests: list[DiagnosticKind] = field(default_factory=list)
    manual_tests: list[DiagnosticKind] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "verdict": self.verdict.value,
            "failed_tests": [k.value for k in self.failed_tests],
            "warning_tests": [k.value for k in self.warning_tests],
            "manual_tests": [k.value for k in self.manual_tests],
        }

    @classmethod
    def from_dict(cls, d: dict) -> "OverallResult":
        return cls(
            verdict=OverallVerdict(d.get("verdict", OverallVerdict.IN_PROGRESS.value)),
            failed_tests=[DiagnosticKind(k) for k in d.get("failed_tests", [])],
            warning_tests=[DiagnosticKind(k) for k in d.get("warning_tests", [])],
            manual_tests=[DiagnosticKind(k) for k in d.get("manual_tests", [])],
        )


# --------------------------------------------------------------------------- #
# Device info
# --------------------------------------------------------------------------- #
@dataclass
class DeviceInfo:
    """Detected hardware/system summary.

    Values are "NOT AVAILABLE" when Windows does not expose them; nothing is
    ever fabricated.
    """

    UNAVAILABLE = "NOT AVAILABLE"

    manufacturer: str = UNAVAILABLE
    model: str = UNAVAILABLE
    serial_number: str = UNAVAILABLE
    cpu_name: str = UNAVAILABLE
    cpu_cores: str = UNAVAILABLE
    gpu_name: str = UNAVAILABLE
    memory_gb: str = UNAVAILABLE
    storage_gb: str = UNAVAILABLE
    os_version: str = UNAVAILABLE
    os_build: str = UNAVAILABLE
    architecture: str = UNAVAILABLE
    computer_name: str = UNAVAILABLE
    hostname: str = UNAVAILABLE

    def to_dict(self) -> dict:
        return {
            "manufacturer": self.manufacturer,
            "model": self.model,
            "serial_number": self.serial_number,
            "cpu_name": self.cpu_name,
            "cpu_cores": self.cpu_cores,
            "gpu_name": self.gpu_name,
            "memory_gb": self.memory_gb,
            "storage_gb": self.storage_gb,
            "os_version": self.os_version,
            "os_build": self.os_build,
            "architecture": self.architecture,
            "computer_name": self.computer_name,
            "hostname": self.hostname,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "DeviceInfo":
        # Tolerant decode: missing fields fall back to UNAVAILABLE.
        inst = cls()
        for key in inst.to_dict():
            setattr(inst, key, d.get(key, cls.UNAVAILABLE))
        return inst


# --------------------------------------------------------------------------- #
# Session
# --------------------------------------------------------------------------- #
@dataclass
class DiagnosticSession:
    """A full diagnostic run on one device, as recorded for history/reports."""

    device: DeviceInfo
    technician_name: str
    app_version: str
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    started_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    ended_at: Optional[datetime] = None
    results: list[DiagnosticResult] = field(default_factory=list)
    overall: OverallResult = field(
        default_factory=lambda: OverallResult(verdict=OverallVerdict.IN_PROGRESS)
    )

    def result_for(self, kind: DiagnosticKind) -> Optional[DiagnosticResult]:
        for r in self.results:
            if r.kind == kind:
                return r
        return None

    @staticmethod
    def compute_overall(results: list[DiagnosticResult]) -> OverallResult:
        """Documented overall rule:
          - any FAIL            -> FAIL
          - any MANUAL_REQUIRED -> MANUAL REQUIRED (unless already FAIL)
          - any WARNING         -> PASS WITH WARNING
          - otherwise           -> PASS
        """
        failures = [r.kind for r in results if r.status == DiagnosticStatus.FAIL]
        warnings = [r.kind for r in results if r.status == DiagnosticStatus.WARNING]
        manuals = [
            r.kind for r in results if r.status == DiagnosticStatus.MANUAL_REQUIRED
        ]

        if failures:
            return OverallResult(
                verdict=OverallVerdict.FAIL,
                failed_tests=failures,
                warning_tests=warnings,
                manual_tests=manuals,
            )
        if manuals:
            return OverallResult(
                verdict=OverallVerdict.MANUAL_REQUIRED,
                warning_tests=warnings,
                manual_tests=manuals,
            )
        if warnings:
            return OverallResult(
                verdict=OverallVerdict.PASS_WITH_WARNING,
                warning_tests=warnings,
                manual_tests=manuals,
            )
        return OverallResult(
            verdict=OverallVerdict.PASS, manual_tests=manuals
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "device": self.device.to_dict(),
            "technician_name": self.technician_name,
            "app_version": self.app_version,
            "started_at": self.started_at.isoformat(),
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "results": [r.to_dict() for r in self.results],
            "overall": self.overall.to_dict(),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "DiagnosticSession":
        return cls(
            device=DeviceInfo.from_dict(d.get("device", {})),
            technician_name=d.get("technician_name", ""),
            app_version=d.get("app_version", ""),
            id=d.get("id", str(uuid.uuid4())),
            started_at=_parse_ts(d.get("started_at")),
            ended_at=(
                _parse_ts(d["ended_at"]) if d.get("ended_at") else None
            ),
            results=[DiagnosticResult.from_dict(r) for r in d.get("results", [])],
            overall=OverallResult.from_dict(
                d.get("overall", {"verdict": OverallVerdict.IN_PROGRESS.value})
            ),
        )


# --------------------------------------------------------------------------- #
# Technician
# --------------------------------------------------------------------------- #
@dataclass
class TechnicianProfile:
    name: str
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "TechnicianProfile":
        return cls(
            name=d.get("name", ""),
            id=d.get("id", str(uuid.uuid4())),
            created_at=_parse_ts(d.get("created_at")),
        )


def _parse_ts(value) -> datetime:
    """Parse an ISO-8601 string (or return now) so decode never hard-fails."""
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            pass
    return datetime.now(timezone.utc)
