"""Diagnostic provider contracts and the registry.

Mirrors MacDiagnosticApp's provider layer:
  - AutomatedDiagnosticProvider: runs in software, returns a DiagnosticResult
  - ManualDiagnosticProvider:    needs technician action; the UI owns the screen
  - DiagnosticRegistry:          holds both, exposes lookup by kind
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from .models import DiagnosticKind, DiagnosticResult


class PermissionKind(str, Enum):
    """OS permission a module may require (Windows camera/mic privacy)."""

    CAMERA = "camera"
    MICROPHONE = "microphone"


@dataclass(frozen=True)
class DiagnosticMeta:
    """Metadata every diagnostic module exposes for the UI and registry."""

    kind: DiagnosticKind
    title: str
    why_it_matters: str
    is_manual: bool
    needs_permission: Optional[PermissionKind] = None


class AutomatedDiagnosticProvider(ABC):
    """A diagnostic that runs entirely in software and returns a result."""

    @property
    @abstractmethod
    def meta(self) -> DiagnosticMeta:
        ...

    @abstractmethod
    def run(self) -> DiagnosticResult:
        ...


class ManualDiagnosticProvider(ABC):
    """A diagnostic that needs technician action.

    The UI owns the screen and reports back a verdict; there is no run().
    """

    @property
    @abstractmethod
    def meta(self) -> DiagnosticMeta:
        ...


class DiagnosticProviding(ABC):
    """Lookup surface the engine depends on."""

    @property
    @abstractmethod
    def automated(self) -> list[AutomatedDiagnosticProvider]:
        ...

    @property
    @abstractmethod
    def manual(self) -> list[ManualDiagnosticProvider]:
        ...

    @abstractmethod
    def automated_for(self, kind: DiagnosticKind) -> Optional[AutomatedDiagnosticProvider]:
        ...

    @abstractmethod
    def manual_for(self, kind: DiagnosticKind) -> Optional[ManualDiagnosticProvider]:
        ...


@dataclass
class DiagnosticRegistry(DiagnosticProviding):
    _automated: list[AutomatedDiagnosticProvider] = field(default_factory=list)
    _manual: list[ManualDiagnosticProvider] = field(default_factory=list)

    @property
    def automated(self) -> list[AutomatedDiagnosticProvider]:
        return list(self._automated)

    @property
    def manual(self) -> list[ManualDiagnosticProvider]:
        return list(self._manual)

    def automated_for(self, kind: DiagnosticKind) -> Optional[AutomatedDiagnosticProvider]:
        for p in self._automated:
            if p.meta.kind == kind:
                return p
        return None

    def manual_for(self, kind: DiagnosticKind) -> Optional[ManualDiagnosticProvider]:
        for p in self._manual:
            if p.meta.kind == kind:
                return p
        return None
