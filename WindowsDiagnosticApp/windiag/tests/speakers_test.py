"""Speakers & Headphones Test (Phase 5).

Generates real test tones routed to specific channels (left / right / stereo /
mono) using sounddevice when available, else falls back to winsound beeps.
Because software cannot prove a speaker produced sound, the result is recorded
as user-confirmed after the technician says what they heard.

Warns before playing and never outputs unexpectedly loud audio.
"""

from __future__ import annotations

import threading
import tkinter as tk
from tkinter import ttk
from typing import Callable, Optional

from ..testkit import Reading, TestID, TestOutcome, TestStatus

try:
    import numpy as np
    import sounddevice as sd

    _HAS_AUDIO = True
except Exception:  # pragma: no cover - optional dependency
    np = None
    sd = None
    _HAS_AUDIO = False


SAMPLE_RATE = 44100
DEFAULT_FREQ = 440.0
DEFAULT_SECONDS = 1.5
DEFAULT_VOLUME = 0.2  # conservative; kept low to avoid loud output


class SpeakersTestWindow(tk.Toplevel):
    def __init__(self, master: tk.Misc, on_result: Optional[Callable[[TestOutcome], None]] = None) -> None:
        super().__init__(master)
        self.on_result = on_result
        self.title("Speakers & Headphones Test")
        self.geometry("720x520")
        self.configure(bg="#0f172a")

        self._confirmed: dict[str, str] = {}
        self._last_channel = None
        self._build()

    def _build(self) -> None:
        tk.Label(
            self, text="Speakers & Headphones", bg="#0f172a", fg="white",
            font=("Segoe UI", 16, "bold"),
        ).pack(pady=(16, 4))
        tk.Label(
            self,
            text="Play each tone, listen, then confirm what you heard. Volume is kept low.",
            bg="#0f172a", fg="#94a3b8", font=("Segoe UI", 10), wraplength=640,
        ).pack(padx=20, pady=(0, 10))

        if not _HAS_AUDIO:
            tk.Label(
                self,
                text="Audio library (sounddevice/numpy) not available — falling back to beeps. "
                "Channel routing unavailable.",
                bg="#0f172a", fg="#f59e0b", font=("Segoe UI", 9), wraplength=640,
            ).pack(padx=20, pady=4)

        # Device selection
        dev_frame = tk.Frame(self, bg="#0f172a")
        dev_frame.pack(fill="x", padx=20, pady=4)
        tk.Label(dev_frame, text="Output device:", bg="#0f172a", fg="#e2e8f0").pack(side="left")
        self._device_var = tk.StringVar()
        self._devices = self._list_devices()
        names = [d["name"] for d in self._devices] or ["System default"]
        self._device_combo = ttk.Combobox(
            dev_frame, textvariable=self._device_var, values=names, state="readonly", width=40
        )
        self._device_combo.pack(side="left", padx=8)
        self._device_combo.current(0)

        # Volume
        vol_frame = tk.Frame(self, bg="#0f172a")
        vol_frame.pack(fill="x", padx=20, pady=8)
        tk.Label(vol_frame, text="Volume", bg="#0f172a", fg="#e2e8f0").pack(side="left")
        self._volume = tk.DoubleVar(value=DEFAULT_VOLUME)
        tk.Scale(
            vol_frame, from_=0.05, to=0.5, resolution=0.05, orient="horizontal",
            variable=self._volume, bg="#0f172a", fg="white", troughcolor="#334155",
            highlightthickness=0,
        ).pack(side="left", fill="x", expand=True, padx=8)

        # Channel buttons + confirmation
        self._status_vars: dict[str, tk.StringVar] = {}
        for label, channel in (
            ("Left Speaker", "left"),
            ("Right Speaker", "right"),
            ("Stereo", "stereo"),
            ("Mono", "mono"),
        ):
            row = tk.Frame(self, bg="#1e293b")
            row.pack(fill="x", padx=20, pady=4)
            tk.Label(row, text=label, bg="#1e293b", fg="white", width=16, anchor="w",
                     font=("Segoe UI", 10, "bold")).pack(side="left", padx=8, pady=6)
            tk.Button(
                row, text="Play", command=lambda c=channel: self._play(c),
                bg="#38bdf8", fg="black", relief="flat", padx=12,
            ).pack(side="left", padx=4)
            heard = tk.StringVar(value="not tested")
            self._status_vars[channel] = heard
            for verdict in ("Heard left", "Heard right", "Heard both", "Nothing"):
                tk.Button(
                    row, text=verdict, command=lambda c=channel, v=verdict: self._confirm(c, v),
                    bg="#334155", fg="white", relief="flat", padx=6, font=("Segoe UI", 8),
                ).pack(side="left", padx=2)
            tk.Label(row, textvariable=heard, bg="#1e293b", fg="#94a3b8", width=14,
                     anchor="w").pack(side="right", padx=8)

        # Stop + finish
        ctl = tk.Frame(self, bg="#0f172a")
        ctl.pack(fill="x", padx=20, pady=10)
        tk.Button(ctl, text="Stop tone", command=self._stop, bg="#ef4444", fg="white",
                  relief="flat", padx=12).pack(side="left", padx=4)
        tk.Button(ctl, text="Finish", command=self.close, bg="#22c55e", fg="white",
                  relief="flat", padx=12).pack(side="left", padx=4)
        self._play_var = tk.StringVar(value="")
        tk.Label(ctl, textvariable=self._play_var, bg="#0f172a", fg="#38bdf8").pack(side="right")

    def _list_devices(self) -> list[dict]:
        if not _HAS_AUDIO:
            return []
        try:
            devices = sd.query_devices()
            out = []
            for i, d in enumerate(devices):
                if d.get("max_output_channels", 0) > 0:
                    out.append({"index": i, "name": d["name"], "channels": d["max_output_channels"]})
            return out
        except Exception:
            return []

    # ------------------------------------------------------------------ #
    def _play(self, channel: str) -> None:
        self._last_channel = channel
        self._play_var.set(f"Playing {channel} tone…")
        threading.Thread(target=self._play_worker, args=(channel,), daemon=True).start()

    def _play_worker(self, channel: str) -> None:
        volume = float(self._volume.get())
        if not _HAS_AUDIO:
            try:
                import winsound

                winsound.Beep(DEFAULT_FREQ, int(DEFAULT_SECONDS * 1000))
            except Exception:
                pass
            self.after(0, lambda: self._play_var.set(""))
            return

        try:
            t = np.arange(int(SAMPLE_RATE * DEFAULT_SECONDS)) / SAMPLE_RATE
            tone = (volume * np.sin(2 * np.pi * DEFAULT_FREQ * t)).astype(np.float32)
            device_index = self._selected_device_index()
            stereo = self._route_channels(tone, channel)
            sd.play(stereo, samplerate=SAMPLE_RATE, device=device_index)
            sd.wait()
        except Exception as exc:
            self.after(0, lambda: self._play_var.set(f"Error: {exc}"))
            return
        self.after(0, lambda: self._play_var.set(""))

    def _selected_device_index(self) -> Optional[int]:
        name = self._device_var.get()
        for d in self._devices:
            if d["name"] == name:
                return d["index"]
        return None

    def _route_channels(self, tone, channel: str):
        """Build a stereo buffer routing the tone to the requested channel(s)."""
        if channel == "left":
            return np.column_stack([tone, np.zeros_like(tone)])
        if channel == "right":
            return np.column_stack([np.zeros_like(tone), tone])
        if channel == "mono":
            return np.column_stack([tone, tone])  # same signal both channels
        return np.column_stack([tone, tone])  # stereo = both

    def _stop(self) -> None:
        if _HAS_AUDIO:
            try:
                sd.stop()
            except Exception:
                pass
        self._play_var.set("Stopped")

    def _confirm(self, channel: str, verdict: str) -> None:
        self._confirmed[channel] = verdict
        self._status_vars[channel].set(verdict)

    # ------------------------------------------------------------------ #
    def close(self) -> None:
        if self.on_result:
            tested = list(self._confirmed.keys())
            if not tested:
                status = TestStatus.NOT_RUN
                summary = "No channel tests confirmed."
            else:
                bad = [c for c, v in self._confirmed.items() if v == "Nothing"]
                status = TestStatus.WARNING if bad else TestStatus.PASSED
                summary = f"{len(tested)} channel test(s) user-confirmed." + (
                    f" No audio on: {', '.join(bad)}." if bad else ""
                )
            self.on_result(
                TestOutcome(
                    test_id=TestID.SPEAKERS,
                    status=status,
                    summary=summary,
                    readings=[
                        Reading("Channels tested", str(len(tested))),
                        Reading("Result", "User-confirmed (software cannot prove speaker output)"),
                    ] + [Reading(c, v) for c, v in self._confirmed.items()],
                    user_confirmed=True,
                )
            )
        self._stop()
        self.destroy()
