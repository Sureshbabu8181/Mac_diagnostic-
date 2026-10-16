"""Reports, history and the automatic-diagnostics workflow (Phases 13–14).

Local-only: generates CSV and HTML reports plus a JSON history store. Privacy
first — no typed text, recordings, footage or sensitive identifiers unless the
user explicitly includes them.
"""

from __future__ import annotations

import csv
import html
import io
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from . import APP_VERSION
from .support import hardware as hw
from .testkit import TestID, TestOutcome, TestStatus


# --------------------------------------------------------------------------- #
# History store (JSON file)
# --------------------------------------------------------------------------- #
class HistoryStore:
    """Stores completed test outcomes grouped by run/session."""

    def __init__(self, directory: Optional[Path] = None) -> None:
        base = directory or self._default_dir()
        self.directory = base
        self.directory.mkdir(parents=True, exist_ok=True)
        self.file = self.directory / "history.json"

    @staticmethod
    def _default_dir() -> Path:
        appdata = os.environ.get("APPDATA")
        root = Path(appdata) if appdata else Path.home()
        return root / "WindowsDiagnosticApp"

    def load(self) -> list[dict]:
        if not self.file.exists():
            return []
        try:
            data = json.loads(self.file.read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
        except (ValueError, OSError):
            return []

    def save(self, runs: list[dict]) -> None:
        tmp = self.file.with_suffix(".tmp")
        tmp.write_text(json.dumps(runs, indent=2), encoding="utf-8")
        tmp.replace(self.file)

    def add_run(self, device: dict, outcomes: list[TestOutcome]) -> dict:
        runs = self.load()
        run = {
            "id": _new_id(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "app_version": APP_VERSION,
            "device": device,
            "outcomes": [o.to_dict() for o in outcomes],
            "summary": _summarise(outcomes),
        }
        runs.append(run)
        self.save(runs)
        return run

    def delete_run(self, run_id: str) -> None:
        runs = [r for r in self.load() if r.get("id") != run_id]
        self.save(runs)


def _new_id() -> str:
    import uuid

    return str(uuid.uuid4())


def _summarise(outcomes: list[TestOutcome]) -> dict:
    counts: dict[str, int] = {}
    for o in outcomes:
        counts[o.status.value] = counts.get(o.status.value, 0) + 1
    return counts


# --------------------------------------------------------------------------- #
# Report generation (CSV + HTML)
# --------------------------------------------------------------------------- #
def build_csv(run: dict) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Test", "Status", "Summary", "Readings", "Warnings", "Errors", "Duration(s)"])
    for o in run.get("outcomes", []):
        readings = "; ".join(
            f"{r['name']}={r['value']}{(' ' + r['unit']) if r.get('unit') else ''}"
            for r in o.get("readings", [])
        )
        writer.writerow(
            [
                o.get("test_id", ""),
                o.get("status", ""),
                o.get("summary", ""),
                readings,
                " | ".join(o.get("warnings", [])),
                " | ".join(o.get("errors", [])),
                o.get("duration_s", ""),
            ]
        )
    return buf.getvalue()


def build_html(run: dict) -> str:
    device = run.get("device", {})
    rows = []
    for o in run.get("outcomes", []):
        status = o.get("status", "")
        colour = _status_colour(status)
        readings = "<br>".join(
            html.escape(
                f"{r['name']}: {r['value']}" + (f" {r['unit']}" if r.get("unit") else "")
            )
            for r in o.get("readings", [])
        )
        warn = " ".join(f"<div class='warn'>{html.escape(w)}</div>" for w in o.get("warnings", []))
        err = " ".join(f"<div class='err'>{html.escape(e)}</div>" for e in o.get("errors", []))
        rows.append(
            f"<tr><td>{html.escape(o.get('test_id',''))}</td>"
            f"<td><span class='badge' style='background:{colour}'>{html.escape(status)}</span></td>"
            f"<td>{html.escape(o.get('summary',''))}<div class='readings'>{readings}</div>{warn}{err}</td>"
            f"<td>{o.get('duration_s') or ''}</td></tr>"
        )
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Diagnostic Report</title><style>
body{{font-family:Segoe UI,Arial;background:#0f172a;color:#e2e8f0;margin:24px}}
h1{{color:#38bdf8}} table{{width:100%;border-collapse:collapse}}
td,th{{border:1px solid #334155;padding:8px;vertical-align:top;text-align:left}}
.badge{{color:#fff;padding:2px 8px;border-radius:4px;font-weight:bold}}
.readings{{color:#94a3b8;font-size:12px;margin-top:4px}}
.warn{{color:#f59e0b;font-size:12px}} .err{{color:#ef4444;font-size:12px}}
.meta{{color:#94a3b8}} th{{background:#1e293b}}
</style></head><body>
<h1>Diagnostic Report</h1>
<div class="meta">
Generated: {html.escape(run.get('timestamp',''))} · App v{html.escape(run.get('app_version',''))}<br>
Device: {html.escape(str(device.get('manufacturer','')))} {html.escape(str(device.get('model','')))}
 · Serial: {html.escape(str(device.get('serial','')))}<br>
CPU: {html.escape(str(device.get('cpu','')))} · Memory: {html.escape(str(device.get('memory','')))}
</div>
<table><tr><th>Test</th><th>Status</th><th>Summary &amp; Readings</th><th>Duration</th></tr>
{''.join(rows)}</table>
<p class="meta">Privacy: contains no typed text, recordings or camera footage.</p>
</body></html>"""


def _status_colour(status: str) -> str:
    from .testkit import STATUS_COLORS, TestStatus as _TS

    try:
        return STATUS_COLORS[_TS(status)]
    except (KeyError, ValueError):
        return "#64748b"


def export_run(run: dict, directory: Optional[Path] = None, fmt: str = "html") -> Path:
    out_dir = directory or (HistoryStore().directory / "Reports")
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = run.get("timestamp", "").replace(":", "-")[:19] or "run"
    if fmt == "csv":
        path = out_dir / f"report-{stamp}.csv"
        path.write_text(build_csv(run), encoding="utf-8")
    else:
        path = out_dir / f"report-{stamp}.html"
        path.write_text(build_html(run), encoding="utf-8")
    return path


def default_report_dir() -> Path:
    return HistoryStore().directory / "Reports"


# --------------------------------------------------------------------------- #
# Automatic diagnostics workflow
# --------------------------------------------------------------------------- #
def run_automatic(
    test_ids: list[TestID],
    on_progress=None,
) -> list[TestOutcome]:
    """Run the selected headless automated tests in a sensible order.

    Interactive tests (display/keyboard/camera/etc.) are not run here — they
    need technician participation and are launched from the dashboard. This
    returns outcomes for the headless set only.
    """
    from .tests.automated import AUTOMATED_TESTS

    # Preserve a sensible order: system first, then health, then connectivity.
    order = [
        TestID.SYSTEM_INFO,
        TestID.BATTERY,
        TestID.STORAGE_HEALTH,
        TestID.THERMAL,
        TestID.NETWORK,
        TestID.BLUETOOTH,
        TestID.USB,
        TestID.WINDOWS_HEALTH,
    ]
    ordered = [t for t in order if t in test_ids and t in AUTOMATED_TESTS]
    # Append any requested tests not in the canonical order.
    ordered += [t for t in test_ids if t not in ordered and t in AUTOMATED_TESTS]

    outcomes: list[TestOutcome] = []
    for i, tid in enumerate(ordered):
        if on_progress:
            on_progress(i, len(ordered), tid)
        try:
            outcome = AUTOMATED_TESTS[tid]()
        except Exception as exc:  # a single failing module never aborts the run
            outcome = TestOutcome(
                test_id=tid,
                status=TestStatus.ERROR,
                summary=f"Test error: {exc}",
                errors=[str(exc)],
            )
        outcomes.append(outcome)
    if on_progress:
        on_progress(len(ordered), len(ordered), None)
    return outcomes
