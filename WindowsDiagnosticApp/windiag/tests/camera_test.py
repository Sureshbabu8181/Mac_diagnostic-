"""Camera Test (Phase 7).

Live camera preview via OpenCV with camera selection, real captured-frame count
and measured FPS over a rolling window. Shows capture resolution, Start/Stop/
Restart controls and access errors. The camera is released on stop/close.

If OpenCV is unavailable or no camera is present, the test reports Unsupported
with guidance instead of fabricating a preview. Nothing is recorded to disk.
"""

from __future__ import annotations

import threading
import tkinter as tk
from tkinter import ttk
from typing import Callable, Optional

from PIL import Image, ImageTk

from ..testkit import Reading, TestID, TestOutcome, TestStatus

try:
    import cv2

    _HAS_CV = True
except Exception:  # pragma: no cover - optional dependency
    cv2 = None
    _HAS_CV = False


FPS_WINDOW = 30  # frames over which to average measured FPS


class CameraTestWindow(tk.Toplevel):
    def __init__(self, master: tk.Misc, on_result: Optional[Callable[[TestOutcome], None]] = None) -> None:
        super().__init__(master)
        self.on_result = on_result
        self.title("Camera Test")
        self.geometry("860x620")
        self.configure(bg="#0f172a")

        self._cap = None
        self._running = False
        self._frame_count = 0
        self._fps_times: list[float] = []
        self._measured_fps = 0.0
        self._resolution = ""
        self._photo = None  # keep a reference to avoid GC
        self._errors: list[str] = []
        self._detected = False

        self._build()
        self.protocol("WM_DELETE_WINDOW", self.close)
        if _HAS_CV:
            self._enumerate_cameras()

    # ------------------------------------------------------------------ #
    def _build(self) -> None:
        tk.Label(self, text="Camera Test", bg="#0f172a", fg="white",
                 font=("Segoe UI", 16, "bold")).pack(pady=(14, 4))

        if not _HAS_CV:
            tk.Label(
                self, text="OpenCV not installed — camera test Unsupported. Install with: pip install opencv-python",
                bg="#0f172a", fg="#f59e0b", font=("Segoe UI", 10), wraplength=760,
            ).pack(padx=20, pady=8)
            tk.Button(self, text="Close", command=self.close, bg="#334155", fg="white",
                      relief="flat", padx=14).pack(pady=10)
            return

        # Camera selection
        sel = tk.Frame(self, bg="#0f172a")
        sel.pack(fill="x", padx=20, pady=4)
        tk.Label(sel, text="Camera:", bg="#0f172a", fg="#e2e8f0").pack(side="left")
        self._cam_var = tk.StringVar()
        self._cam_combo = ttk.Combobox(sel, textvariable=self._cam_var, state="readonly", width=44)
        self._cam_combo.pack(side="left", padx=8)

        # Preview
        self._preview = tk.Label(self, bg="black", width=80, height=24)
        self._preview.pack(padx=20, pady=10, fill="both", expand=True)

        # Readout
        self._info_var = tk.StringVar(value="Frames: 0 · FPS: 0.0 · —")
        tk.Label(self, textvariable=self._info_var, bg="#0f172a", fg="#38bdf8",
                 font=("Consolas", 11)).pack(pady=4)

        # Controls
        ctl = tk.Frame(self, bg="#0f172a")
        ctl.pack(fill="x", padx=20, pady=8)
        tk.Button(ctl, text="Start", command=self._start, bg="#22c55e", fg="white",
                  relief="flat", padx=12).pack(side="left", padx=4)
        tk.Button(ctl, text="Stop", command=self._stop, bg="#ef4444", fg="white",
                  relief="flat", padx=12).pack(side="left", padx=4)
        tk.Button(ctl, text="Restart", command=self._restart, bg="#f59e0b", fg="black",
                  relief="flat", padx=12).pack(side="left", padx=4)
        tk.Button(ctl, text="Finish", command=self.close, bg="#38bdf8", fg="black",
                  relief="flat", padx=12).pack(side="right", padx=4)

    def _enumerate_cameras(self) -> None:
        names = []
        # Probe the first few indices for a working camera.
        for idx in range(4):
            cap = cv2.VideoCapture(idx)
            if cap.isOpened():
                names.append(f"Camera {idx}")
                cap.release()
        if not names:
            names = ["No camera found"]
        self._cam_combo["values"] = names
        self._cam_combo.current(0)

    def _selected_index(self) -> Optional[int]:
        val = self._cam_var.get()
        if val.startswith("Camera "):
            try:
                return int(val.split()[-1])
            except ValueError:
                return None
        return None

    # ------------------------------------------------------------------ #
    def _start(self) -> None:
        if not _HAS_CV or self._running:
            return
        idx = self._selected_index()
        if idx is None:
            self._info_var.set("No camera selected.")
            return
        try:
            self._cap = cv2.VideoCapture(idx)
            if not self._cap.isOpened():
                raise RuntimeError(f"Cannot open camera {idx} (in use or no permission).")
        except Exception as exc:
            self._errors.append(str(exc))
            self._info_var.set(f"Error: {exc}")
            return
        self._running = True
        self._frame_count = 0
        self._fps_times = []
        self._detected = True
        w = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self._resolution = f"{w}x{h}"
        self._read_loop()

    def _read_loop(self) -> None:
        if not self._running or self._cap is None:
            return
        ok, frame = self._cap.read()
        if ok:
            import time

            self._frame_count += 1
            now = time.time()
            self._fps_times.append(now)
            self._fps_times = self._fps_times[-FPS_WINDOW:]
            if len(self._fps_times) >= 2:
                span = self._fps_times[-1] - self._fps_times[0]
                if span > 0:
                    self._measured_fps = round((len(self._fps_times) - 1) / span, 1)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            img = Image.fromarray(rgb)
            # Fit preview to the label while keeping aspect.
            pw = self._preview.winfo_width() or 640
            ph = self._preview.winfo_height() or 480
            img.thumbnail((pw, ph))
            self._photo = ImageTk.PhotoImage(img)
            self._preview.configure(image=self._photo)
            self._info_var.set(
                f"Frames: {self._frame_count} · FPS: {self._measured_fps} · {self._resolution}"
            )
        else:
            self._errors.append("Frame capture failed.")
        self.after(15, self._read_loop)

    def _stop(self) -> None:
        self._running = False
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception:
                pass
            self._cap = None

    def _restart(self) -> None:
        self._stop()
        self._start()

    # ------------------------------------------------------------------ #
    def close(self) -> None:
        self._stop()
        if self.on_result:
            if not _HAS_CV:
                outcome = TestOutcome(
                    test_id=TestID.CAMERA,
                    status=TestStatus.UNSUPPORTED,
                    summary="OpenCV not installed (pip install opencv-python).",
                )
            elif not self._detected:
                outcome = TestOutcome(
                    test_id=TestID.CAMERA,
                    status=TestStatus.UNSUPPORTED,
                    summary="No camera could be opened (none present or in use).",
                    errors=self._errors,
                )
            else:
                good = self._frame_count > 0
                outcome = TestOutcome(
                    test_id=TestID.CAMERA,
                    status=TestStatus.PASSED if good else TestStatus.FAILED,
                    summary=f"Camera captured {self._frame_count} frames at ~{self._measured_fps} FPS ({self._resolution}).",
                    readings=[
                        Reading("Frames captured", str(self._frame_count)),
                        Reading("Measured FPS", str(self._measured_fps), "fps"),
                        Reading("Resolution", self._resolution),
                    ],
                    errors=self._errors,
                )
            self.on_result(outcome)
        self.destroy()
