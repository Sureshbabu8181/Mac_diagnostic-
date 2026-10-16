"""Orchestrates a diagnostic run.

Runs automated modules sequentially, inserts manual-required placeholders for
the technician phases, and recomputes the overall verdict. Fully local; the
only state is the session and the supplied registry.
"""

from __future__ import annotations

import time
from typing import Callable, Optional

from .models import (
    DiagnosticKind,
    DiagnosticResult,
    DiagnosticSession,
    DiagnosticStatus,
    DeviceInfo,
    OverallResult,
    OverallVerdict,
)
from .providers import DiagnosticProviding


class DiagnosticEngine:
    """Runs diagnostics against a registry. Thread-safe enough for GUI use
    (the GUI runs it on a worker thread and polls progress)."""

    def __init__(
        self,
        registry: DiagnosticProviding,
        device: DeviceInfo,
        technician: str,
        app_version: str,
        on_result: Optional[Callable[[DiagnosticResult], None]] = None,
        on_kind_start: Optional[Callable[[DiagnosticKind], None]] = None,
    ) -> None:
        self.registry = registry
        self.session = DiagnosticSession(
            device=device, technician_name=technician, app_version=app_version
        )
        self.manual_queue: list[DiagnosticKind] = []
        self.current_manual_kind: Optional[DiagnosticKind] = None
        # Optional hooks so a GUI can show live progress.
        self.on_result = on_result
        self.on_kind_start = on_kind_start

    # ------------------------------------------------------------------ #
    # Automated run
    # ------------------------------------------------------------------ #
    def run_automated(self) -> None:
        """Run every automated module; manual kinds become placeholders."""
        for kind in DiagnosticKind:
            if kind.is_manual:
                provider = self.registry.manual_for(kind)
                if provider is not None:
                    self._insert_manual_placeholder(kind)
                continue
            self.run_kind(kind)
        self.recompute_overall()

    def run_kind(self, kind: DiagnosticKind) -> None:
        provider = self.registry.automated_for(kind)
        if provider is None:
            return
        running = DiagnosticResult(
            kind=kind, status=DiagnosticStatus.RUNNING, summary="Running…"
        )
        self._upsert(running)
        if self.on_kind_start:
            self.on_kind_start(kind)
        if self.on_result:
            self.on_result(running)

        start = time.time()
        try:
            result = provider.run()
        except Exception as exc:  # defensive: a single module never aborts the run
            result = DiagnosticResult(
                kind=kind,
                status=DiagnosticStatus.NOT_AVAILABLE,
                summary=f"Module error: {exc}",
                metrics=[],
            )
        _ = start  # timing hook available for future use
        self._upsert(result)
        if self.on_result:
            self.on_result(result)
        self.recompute_overall()

    def _insert_manual_placeholder(self, kind: DiagnosticKind) -> None:
        if kind in self.manual_queue:
            return
        self.manual_queue.append(kind)
        result = DiagnosticResult(
            kind=kind,
            status=DiagnosticStatus.MANUAL_REQUIRED,
            summary="Manual technician test required.",
        )
        self._upsert(result)
        if self.on_result:
            self.on_result(result)
        self.recompute_overall()

    def insert_manual_placeholder(self, kind: DiagnosticKind) -> None:
        """Record a manual test as pending so it shows before being run."""
        if kind in self.manual_queue:
            return
        self.manual_queue.append(kind)
        result = DiagnosticResult(
            kind=kind,
            status=DiagnosticStatus.MANUAL_REQUIRED,
            summary="Manual technician test required.",
        )
        self._upsert(result)
        if self.on_result:
            self.on_result(result)
        self.recompute_overall()

    # ------------------------------------------------------------------ #
    # Manual verdicts
    # ------------------------------------------------------------------ #
    @property
    def remaining_manual_kinds(self) -> list[DiagnosticKind]:
        return list(self.manual_queue)

    def next_manual_kind(self) -> Optional[DiagnosticKind]:
        if not self.manual_queue:
            return None
        self.current_manual_kind = self.manual_queue.pop(0)
        return self.current_manual_kind

    def finish_manual(
        self,
        kind: DiagnosticKind,
        status: DiagnosticStatus,
        summary: str,
        notes: str = "",
    ) -> None:
        existing = self.session.result_for(kind)
        metrics = existing.metrics if existing else []
        result_id = existing.id if existing else None
        result = DiagnosticResult(
            kind=kind,
            status=status,
            summary=summary,
            metrics=metrics,
            technician_notes=notes,
        )
        if result_id:
            result.id = result_id
        self._upsert(result)
        if self.on_result:
            self.on_result(result)
        self.recompute_overall()

    def adopt_manual(self, result: DiagnosticResult) -> None:
        if not result.kind.is_manual:
            return
        self._upsert(result)
        if self.on_result:
            self.on_result(result)
        self.recompute_overall()

    def adopt_automated(self, result: DiagnosticResult) -> None:
        self._upsert(result)
        if self.on_result:
            self.on_result(result)
        self.recompute_overall()

    def add_notes(self, notes: str, kind: DiagnosticKind) -> None:
        existing = self.session.result_for(kind)
        if not existing:
            return
        existing.technician_notes = notes
        self._upsert(existing)

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #
    def finish_session(self) -> None:
        from datetime import datetime, timezone

        self.session.ended_at = datetime.now(timezone.utc)
        self.recompute_overall()

    def recompute_overall(self) -> None:
        self.session.overall = DiagnosticSession.compute_overall(self.session.results)

    def _upsert(self, result: DiagnosticResult) -> None:
        for i, r in enumerate(self.session.results):
            if r.kind == result.kind:
                self.session.results[i] = result
                return
        self.session.results.append(result)
