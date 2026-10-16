"""Microphone Test (Phase 6).

Live waveform and input-level meter using sounddevice + numpy. Provides Start
Recording / Stop / Play / Delete / Reset controls, device selection, sample-rate
display, clipping warnings and elapsed time. Recordings are temporary local
files deleted on demand. The stream is released when the window closes.

If the audio library or a microphone is unavailable, the test reports Unsupported
with clear guidance rather than fabricating a reading.
"""

from __future__ import annotations

import os
import tempfile
import threading
import time
import tkinter as tk
from tkinter import ttk
from typing import Callable, Optional

import numpy as np

from ..testkit import Reading, TestID, TestOutcome, TestStatus

try:
    import sounddevice as sd

    _HAS_AUDIO = True
except Exception:  # pragma: no cover
    sd = None
    _HAS_AUDIO = False


SAMPLE_RATE = 44100
CHANNELS = 1
BLOCK = 1024
CLIP_THRESHOLD = 0.98
MAX_RECORD_SECONDS = 30


class MicrophoneTestWindow(tk.Toplevel):
    def __init__(self, master: tk.Misc, on_result: Optional[Callable[[TestOutcome], None]] = None) -> None:
        super().__init__(master)
        self.on_result = on_result
        self.title("Microphone Test")
        self.geometry("820x560")
        self.configure(bg="#0f172a")

        self._stream = None
        self._recording = False
        self._frames: list[np.ndarray] = []
        self._record_t0: Optional[float] = None
        self._peak = 0.0
        self._clip_count = 0
        self._rec_file: Optional[str] = None
        self._play_stream = None
        self._closed = False
        self._detected_input = False

        self._build()
        self.protocol("WM_DELETE_WINDOW", self.close)
        if _HAS_AUDIO:
            self._start_monitor()

    # ------------------------------------------------------------------ #
    def _build(self) -> None:
        tk.Label(self, text="Microphone Test", bg="#0f172a", fg="white",
                 font=("Segoe UI", 16, "bold")).pack(pady=(14, 4))

        if not _HAS_AUDIO:
            tk.Label(
                self, text="Audio library (sounddevice/numpy) not installed — microphone test Unsupported. "
                "Install with: pip install sounddevice numpy",
                bg="#0f172a", fg="#f59e0b", font=("Segoe UI", 10), wraplength=760,
            ).pack(padx=20, pady=8)
            tk.Button(self, text="Close", command=self.close, bg="#334155", fg="white",
                      relief="flat", padx=14).pack(pady=10)
            return

        # Device selection
        dev = tk.Frame(self, bg="#0f172a")
        dev.pack(fill="x", padx=20, pady=4)
        tk.Label(dev, text="Input device:", bg="#0f172a", fg="#e2e8f0").pack(side="left")
        self._devices = self._list_inputs()
        self._device_var = tk.StringVar()
        combo = ttk.Combobox(dev, textvariable=self._device_var,
                             values=[d["name"] for d in self._devices] or ["Default"],
                             state="readonly", width=44)
        combo.pack(side="left", padx=8)
        if self._devices:
            combo.current(0)
        self._info_var = tk.StringVar(value="Sample rate: 44100 Hz · mono")
        tk.Label(dev, textvariable=self._info_var, bg="#0f172a", fg="#94a3b8",
                 font=("Segoe UI", 9)).pack(side="right")

        # Waveform canvas + level meter
        self._canvas = tk.Canvas(self, bg="#0b1220", height=220, highlightthickness=0)
        self._canvas.pack(fill="x", padx=20, pady=10)
        self._meter = tk.Canvas(self, bg="#0b1220", height=20, highlightthickness=0)
        self._meter.pack(fill="x", padx=20)

        self._status_var = tk.StringVar(value="Monitoring input…")
        tk.Label(self, textvariable=self._status_var, bg="#0f172a", fg="#38bdf8",
                 font=("Segoe UI", 10)).pack(pady=6)

        # Controls
        ctl = tk.Frame(self, bg="#0f172a")
        ctl.pack(fill="x", padx=20, pady=8)
        self._rec_btn = tk.Button(ctl, text="● Start Recording", command=self._toggle_record,
                                  bg="#ef4444", fg="white", relief="flat", padx=12)
        self._rec_btn.pack(side="left", padx=4)
        tk.Button(ctl, text="▶ Play", command=self._play, bg="#22c55e", fg="white",
                  relief="flat", padx=12).pack(side="left", padx=4)
        tk.Button(ctl, text="Delete", command=self._delete, bg="#f59e0b", fg="black",
                  relief="flat", padx=12).pack(side="left", padx=4)
        tk.Button(ctl, text="Finish", command=self.close, bg="#38bdf8", fg="black",
                  relief="flat", padx=12).pack(side="right", padx=4)

    def _list_inputs(self) -> list[dict]:
        try:
            devices = sd.query_devices()
            return [
                {"index": i, "name": d["name"]}
                for i, d in enumerate(devices)
                if d.get("max_input_channels", 0) > 0
            ]
        except Exception:
            return []

    def _selected_index(self) -> Optional[int]:
        name = self._device_var.get()
        for d in self._devices:
            if d["name"] == name:
                return d["index"]
        return None

    # ------------------------------------------------------------------ #
    def _start_monitor(self) -> None:
        def callback(indata, frames, time_info, status):
            if status:
                pass
            level = float(np.max(np.abs(indata))) if len(indata) else 0.0
            self._peak = max(self._peak * 0.9, level)
            if level >= CLIP_THRESHOLD:
                self._clip_count += 1
            self._detected_input = self._detected_input or level > 0.01
            if self._recording:
                self._frames.append(indata.copy())

        try:
            self._stream = sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=CHANNELS,
                blocksize=BLOCK,
                dtype="float32",
                device=self._selected_index(),
                callback=callback,
            )
            self._stream.start()
        except Exception as exc:
            self._status_var.set(f"Microphone error: {exc}")
            return
        self._animate()

    def _animate(self) -> None:
        if self._closed:
            return
        self._draw_wave()
        self._draw_meter()
        elapsed = ""
        if self._recording and self._record_t0:
            elapsed = f" · recording {time.time() - self._record_t0:.1f}s / {MAX_RECORD_SECONDS}s"
        self._status_var.set(
            ("Recording" if self._recording else "Monitoring") + elapsed
            + (" · CLIPPING" if self._clip_count else "")
        )
        self.after(50, self._animate)

    def _draw_wave(self) -> None:
        c = self._canvas
        c.delete("all")
        w = c.winfo_width() or 800
        h = 220
        c.create_line(0, h // 2, w, h // 2, fill="#1e293b")
        # Recent level as a simple bar (full waveform history is in the frames).
        bar_w = int(self._peak * (w - 20))
        c.create_rectangle(10, h // 2 - 30, 10 + bar_w, h // 2 + 30, fill="#22c55e", outline="")

    def _draw_meter(self) -> None:
        c = self._meter
        c.delete("all")
        w = c.winfo_width() or 800
        frac = min(1.0, self._peak)
        colour = "#ef4444" if self._peak >= CLIP_THRESHOLD else "#22c55e"
        c.create_rectangle(0, 0, int(frac * w), 20, fill=colour, outline="")

    # ------------------------------------------------------------------ #
    def _toggle_record(self) -> None:
        if not _HAS_AUDIO:
            return
        if self._recording:
            self._stop_record()
        else:
            self._start_record()

    def _start_record(self) -> None:
        self._frames = []
        self._clip_count = 0
        self._record_t0 = time.time()
        self._recording = True
        self._rec_btn.configure(text="■ Stop Recording")

    def _stop_record(self) -> None:
        self._recording = False
        self._rec_btn.configure(text="● Start Recording")
        if not self._frames:
            self._status_var.set("No audio captured — is the mic muted?")
            return
        audio = np.concatenate(self._frames, axis=0)
        path = os.path.join(tempfile.gettempdir(), "windiag_mic_test.wav")
        try:
            import wave

            pcm = (np.clip(audio.flatten(), -1, 1) * 32767).astype(np.int16)
            with wave.open(path, "wb") as wf:
                wf.setnchannels(CHANNELS)
                wf.setsampwidth(2)
                wf.setframerate(SAMPLE_RATE)
                wf.writeframes(pcm.tobytes())
            self._rec_file = path
            dur = len(pcm) / SAMPLE_RATE
            self._status_var.set(f"Recorded {dur:.1f}s to temp file. Press Play to review.")
        except Exception as exc:
            self._status_var.set(f"Save failed: {exc}")

    def _play(self) -> None:
        if not self._rec_file or not os.path.exists(self._rec_file):
            self._status_var.set("Nothing to play — record first.")
            return

        def worker():
            try:
                import wave

                with wave.open(self._rec_file, "rb") as wf:
                    rate = wf.getframerate()
                    frames = wf.readframes(wf.getnframes())
                    audio = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32767.0
                sd.play(audio, samplerate=rate)
                sd.wait()
            except Exception as exc:
                self.after(0, lambda: self._status_var.set(f"Play error: {exc}"))

        threading.Thread(target=worker, daemon=True).start()

    def _delete(self) -> None:
        if self._rec_file and os.path.exists(self._rec_file):
            try:
                os.remove(self._rec_file)
            except OSError:
                pass
        self._rec_file = None
        self._frames = []
        self._status_var.set("Recording deleted.")

    # ------------------------------------------------------------------ #
    def close(self) -> None:
        self._closed = True
        # Release the input stream.
        if self._stream is not None:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception:
                pass
        if _HAS_AUDIO:
            try:
                sd.stop()
            except Exception:
                pass

        if self.on_result:
            if not _HAS_AUDIO:
                outcome = TestOutcome(
                    test_id=TestID.MICROPHONE,
                    status=TestStatus.UNSUPPORTED,
                    summary="Audio library not installed (pip install sounddevice numpy).",
                )
            elif not self._detected_input:
                outcome = TestOutcome(
                    test_id=TestID.MICROPHONE,
                    status=TestStatus.WARNING,
                    summary="Microphone stream opened but no input detected. Check mute/permission.",
                    readings=[Reading("Input detected", "No")],
                )
            else:
                outcome = TestOutcome(
                    test_id=TestID.MICROPHONE,
                    status=TestStatus.PASSED,
                    summary=f"Microphone captures audio (peak {self._peak:.2f}"
                    + (f", {self._clip_count} clip events" if self._clip_count else "") + ").",
                    readings=[
                        Reading("Input detected", "Yes"),
                        Reading("Peak level", f"{self._peak:.2f}"),
                        Reading("Clip events", str(self._clip_count)),
                        Reading("Sample rate", str(SAMPLE_RATE), "Hz"),
                    ],
                    warnings=["Clipping detected — input level too high."] if self._clip_count else [],
                )
            self.on_result(outcome)
        self._delete()
        self.destroy()
