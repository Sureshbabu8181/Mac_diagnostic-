"""Shared test framework: statuses, metadata, context and outcome types.

This is the single source of truth every test module and the dashboard share.
Statuses are exactly the ones the specification requires; a test NEVER reports
Passed unless it genuinely executed and met its success criteria, or the user
explicitly confirmed an observation.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Optional


class TestStatus(str, Enum):
    """Consistent status vocabulary for every test."""

    NOT_RUN = "Not Run"
    READY = "Ready"
    RUNNING = "Running"
    PASSED = "Passed"
    WARNING = "Warning"
    FAILED = "Failed"
    UNSUPPORTED = "Unsupported"
    CANCELLED = "Cancelled"
    ERROR = "Error"

    @property
    def is_terminal(self) -> bool:
        return self in (
            TestStatus.PASSED,
            TestStatus.WARNING,
            TestStatus.FAILED,
            TestStatus.UNSUPPORTED,
            TestStatus.CANCELLED,
            TestStatus.ERROR,
        )

    @property
    def is_failure(self) -> bool:
        return self == TestStatus.FAILED

    @property
    def is_success(self) -> bool:
        return self == TestStatus.PASSED


# Colour mapping used by the dashboard and screens.
STATUS_COLORS: dict[TestStatus, str] = {
    TestStatus.NOT_RUN: "#64748b",
    TestStatus.READY: "#38bdf8",
    TestStatus.RUNNING: "#38bdf8",
    TestStatus.PASSED: "#22c55e",
    TestStatus.WARNING: "#f59e0b",
    TestStatus.FAILED: "#ef4444",
    TestStatus.UNSUPPORTED: "#a855f7",
    TestStatus.CANCELLED: "#94a3b8",
    TestStatus.ERROR: "#ef4444",
}


class TestCategory(str, Enum):
    """Dashboard groupings so tests are easy to identify."""

    INTERACTIVE = "Interactive Tests"
    PERFORMANCE = "Performance & Stress"
    HEALTH = "Hardware Health"
    SYSTEM = "System & Connectivity"
    WORKFLOW = "Workflow & Reports"


class TestID(str, Enum):
    """Stable identifiers for every test module."""

    DISPLAY = "display"
    KEYBOARD = "keyboard"
    TOUCHPAD = "touchpad"
    SPEAKERS = "speakers"
    MICROPHONE = "microphone"
    CAMERA = "camera"
    FAN = "fan"
    CPU_STRESS = "cpu_stress"
    GPU_STRESS = "gpu_stress"
    RAM_STRESS = "ram_stress"
    BATTERY = "battery"
    STORAGE_HEALTH = "storage_health"
    NETWORK = "network"
    BLUETOOTH = "bluetooth"
    USB = "usb"
    SYSTEM_INFO = "system_info"
    THERMAL = "thermal"
    WINDOWS_HEALTH = "windows_health"
    AUTO = "auto"
    HISTORY = "history"


@dataclass(frozen=True)
class TestMeta:
    """Static metadata the dashboard uses to render a labelled card."""

    id: TestID
    name: str
    category: TestCategory
    purpose: str
    instructions: str
    automated: bool = True
    needs_permission: Optional[str] = None  # "camera" | "microphone"
    # Optional dependency name required for this test (e.g. "cv2").
    requires: Optional[str] = None

    @property
    def short_name(self) -> str:
        return self.name


@dataclass
class Reading:
    """A single measured value with its unit and source."""

    name: str
    value: str
    unit: str = ""
    source: str = ""

    def display(self) -> str:
        if self.unit:
            return f"{self.value} {self.unit}"
        return self.value


@dataclass
class TestOutcome:
    """Result of running (or attempting) a test."""

    test_id: TestID
    status: TestStatus
    summary: str = ""
    readings: list[Reading] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    user_confirmed: bool = False
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_s: Optional[float] = None

    def to_dict(self) -> dict:
        return {
            "test_id": self.test_id.value,
            "status": self.status.value,
            "summary": self.summary,
            "readings": [
                {"name": r.name, "value": r.value, "unit": r.unit, "source": r.source}
                for r in self.readings
            ],
            "errors": self.errors,
            "warnings": self.warnings,
            "user_confirmed": self.user_confirmed,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "duration_s": self.duration_s,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "TestOutcome":
        def _ts(v):
            try:
                return datetime.fromisoformat(v) if v else None
            except (ValueError, TypeError):
                return None

        return cls(
            test_id=TestID(d["test_id"]),
            status=TestStatus(d["status"]),
            summary=d.get("summary", ""),
            readings=[
                Reading(r.get("name", ""), r.get("value", ""), r.get("unit", ""), r.get("source", ""))
                for r in d.get("readings", [])
            ],
            errors=d.get("errors", []),
            warnings=d.get("warnings", []),
            user_confirmed=d.get("user_confirmed", False),
            started_at=_ts(d.get("started_at")),
            ended_at=_ts(d.get("ended_at")),
            duration_s=d.get("duration_s"),
        )


class Timer:
    """Context manager that times a block and stamps a TestOutcome."""

    def __init__(self) -> None:
        self.start: Optional[datetime] = None
        self._t0: float = 0.0

    def __enter__(self) -> "Timer":
        self.start = datetime.now(timezone.utc)
        self._t0 = time.time()
        return self

    def __exit__(self, *exc: Any) -> None:
        pass

    @property
    def elapsed(self) -> float:
        return time.time() - self._t0


def now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())
