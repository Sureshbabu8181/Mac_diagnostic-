"""Local, offline, dependency-free history store.

Backed by JSON files in a per-application directory (roaming AppData on
Windows). The API is intentionally small so a SQLite implementation could
replace it later without touching the UI.
"""

from __future__ import annotations

import json
import os
import tempfile
import threading
from pathlib import Path
from typing import Optional

from .models import DiagnosticSession, TechnicianProfile


class DiagnosticStoreError(Exception):
    """Raised when history cannot be read or is corrupt."""


class DiagnosticStore:
    def __init__(self, directory: Optional[Path] = None, in_memory: bool = False) -> None:
        self._lock = threading.Lock()
        if in_memory:
            base = Path(tempfile.mkdtemp(prefix="windiag-test-"))
        elif directory is not None:
            base = Path(directory)
        else:
            base = self._default_directory()
        self.directory = base
        self.sessions_file = base / "sessions.json"
        self.technicians_file = base / "technicians.json"
        self.directory.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _default_directory() -> Path:
        # Roaming AppData, falling back to home if unset.
        appdata = os.environ.get("APPDATA")
        if appdata:
            root = Path(appdata)
        else:
            root = Path.home()
        return root / "WindowsDiagnosticApp"

    # ------------------------------------------------------------------ #
    # Technicians
    # ------------------------------------------------------------------ #
    def add_technician(self, name: str) -> TechnicianProfile:
        trimmed = name.strip()
        if not trimmed:
            raise DiagnosticStoreError("Technician name cannot be empty.")
        with self._lock:
            techs = self._load_technicians()
            for t in techs:
                if t.name.lower() == trimmed.lower():
                    return t
            profile = TechnicianProfile(name=trimmed)
            techs.append(profile)
            self._write(techs, self.technicians_file)
            return profile

    def technicians(self) -> list[TechnicianProfile]:
        with self._lock:
            return self._load_technicians()

    def delete_technician(self, name: str) -> None:
        with self._lock:
            techs = self._load_technicians()
            techs = [t for t in techs if t.name != name]
            self._write(techs, self.technicians_file)

    # ------------------------------------------------------------------ #
    # Sessions
    # ------------------------------------------------------------------ #
    def save(self, session: DiagnosticSession) -> DiagnosticSession:
        with self._lock:
            sessions = self._load_sessions()
            sessions = [s for s in sessions if s.id != session.id]
            sessions.append(session)
            self._write(sessions, self.sessions_file)
            return session

    def sessions(self) -> list[DiagnosticSession]:
        with self._lock:
            return self._load_sessions()

    def session(self, session_id: str) -> Optional[DiagnosticSession]:
        with self._lock:
            for s in self._load_sessions():
                if s.id == session_id:
                    return s
        return None

    def delete_session(self, session_id: str) -> None:
        with self._lock:
            sessions = self._load_sessions()
            sessions = [s for s in sessions if s.id != session_id]
            self._write(sessions, self.sessions_file)

    def clear_all(self) -> None:
        with self._lock:
            self._write([], self.sessions_file)
            self._write([], self.technicians_file)

    # ------------------------------------------------------------------ #
    # Persistence helpers
    # ------------------------------------------------------------------ #
    def _load_sessions(self) -> list[DiagnosticSession]:
        data = self._read_json(self.sessions_file)
        out: list[DiagnosticSession] = []
        for item in data:
            try:
                out.append(DiagnosticSession.from_dict(item))
            except (KeyError, ValueError, TypeError):
                continue  # skip corrupt rows rather than fail the whole load
        return out

    def _load_technicians(self) -> list[TechnicianProfile]:
        data = self._read_json(self.technicians_file)
        out: list[TechnicianProfile] = []
        for item in data:
            try:
                out.append(TechnicianProfile.from_dict(item))
            except (KeyError, ValueError, TypeError):
                continue
        return out

    def _read_json(self, path: Path) -> list:
        if not path.exists():
            return []
        try:
            text = path.read_text(encoding="utf-8").strip()
        except OSError as exc:
            raise DiagnosticStoreError(f"Could not read {path.name}: {exc}") from exc
        if not text:
            return []
        try:
            data = json.loads(text)
        except ValueError as exc:
            raise DiagnosticStoreError(f"{path.name} is corrupt and could not be decoded.") from exc
        if isinstance(data, list):
            return data
        return []

    def _write(self, value: list, path: Path) -> None:
        payload = [v.to_dict() for v in value]
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        tmp.replace(path)
