"""Touchpad & Mouse Test (Phase 4).

Shows live pointer X/Y within a marked test surface, draws a movement trail,
counts left/right clicks and detects drag operations. Because Windows/tkinter
cannot reliably distinguish a touchpad from a USB mouse at this level, the
source is honestly labelled "pointer input" with an explanation.
"""

from __future__ import annotations

import tkinter as tk
from tkinter import ttk
from typing import Callable, Optional

from ..testkit import Reading, TestID, TestOutcome, TestStatus


class TouchpadTestWindow(tk.Toplevel):
    def __init__(self, master: tk.Misc, on_result: Optional[Callable[[TestOutcome], None]] = None) -> None:
        super().__init__(master)
        self.on_result = on_result
        self.title("Touchpad & Mouse Test")
        self.geometry("900x600")
        self.configure(bg="#0f172a")

        self._left = 0
        self._right = 0
        self._drag_events = 0
        self._moves = 0
        self._dragging = False
        self._path: list[int] = []
        self._min_x = None
        self._max_x = None
        self._min_y = None
        self._max_y = None

        self._build_header()
        self._build_surface()
        self._build_readout()
        self.protocol("WM_DELETE_WINDOW", self.close)

    def _build_header(self) -> None:
        head = tk.Frame(self, bg="#1e293b")
        head.pack(fill="x", padx=10, pady=(10, 4))
        tk.Label(
            head,
            text="Touchpad & Mouse — move, click and drag on the surface below.",
            bg="#1e293b", fg="white", font=("Segoe UI", 12, "bold"),
        ).pack(side="left", padx=10, pady=8)
        tk.Label(
            head,
            text="Source: pointer input (touchpad vs mouse not distinguishable here)",
            bg="#1e293b", fg="#94a3b8", font=("Segoe UI", 9),
        ).pack(side="right", padx=10)

    def _build_surface(self) -> None:
        self._surface = tk.Canvas(
            self, bg="#0b1220", highlightthickness=1, highlightbackground="#334155", cursor="crosshair"
        )
        self._surface.pack(fill="both", expand=True, padx=10, pady=6)

        self._surface.bind("<Motion>", self._on_move)
        self._surface.bind("<ButtonPress-1>", self._on_left_down)
        self._surface.bind("<ButtonRelease-1>", self._on_left_up)
        self._surface.bind("<ButtonPress-3>", self._on_right)
        self._surface.bind("<B1-Motion>", self._on_drag)

        # Marked boundary for the drag test.
        self._surface.after(50, self._draw_guides)

    def _draw_guides(self) -> None:
        w = self._surface.winfo_width()
        h = self._surface.winfo_height()
        self._surface.create_rectangle(1, 1, w - 2, h - 2, outline="#334155")
        self._surface.create_text(
            w // 2, 16, text="Move / click / drag here", fill="#475569", font=("Segoe UI", 10)
        )

    def _build_readout(self) -> None:
        bar = tk.Frame(self, bg="#0f172a")
        bar.pack(fill="x", padx=10, pady=6)
        self._xy_var = tk.StringVar(value="X: —   Y: —")
        self._stats_var = tk.StringVar(value="Moves: 0   Left: 0   Right: 0   Drags: 0")
        tk.Label(bar, textvariable=self._xy_var, bg="#0f172a", fg="#38bdf8",
                 font=("Consolas", 12, "bold")).pack(side="left", padx=10)
        tk.Label(bar, textvariable=self._stats_var, bg="#0f172a", fg="#e2e8f0",
                 font=("Consolas", 11)).pack(side="right", padx=10)

        btns = tk.Frame(self, bg="#0f172a")
        btns.pack(fill="x", padx=10, pady=6)
        tk.Button(btns, text="Reset", command=self._reset, bg="#334155", fg="white",
                  relief="flat", padx=12).pack(side="left", padx=4)
        tk.Button(btns, text="Finish", command=self.close, bg="#22c55e", fg="white",
                  relief="flat", padx=12).pack(side="left", padx=4)

    # ------------------------------------------------------------------ #
    def _update_stats(self) -> None:
        self._xy_var.set(f"X: {self._last_x}   Y: {self._last_y}")
        self._stats_var.set(
            f"Moves: {self._moves}   Left: {self._left}   Right: {self._right}   Drags: {self._drag_events}"
        )

    def _on_move(self, e) -> None:
        self._last_x, self._last_y = e.x, e.y
        self._moves += 1
        self._track_bounds(e.x, e.y)
        # Draw a faint trail segment between the last two positions.
        prev = getattr(self, "_tail", None)
        if prev:
            self._surface.create_line(prev[0], prev[1], e.x, e.y, fill="#1e3a5f")
        self._tail = (e.x, e.y)
        # Mark the current position.
        self._surface.create_oval(e.x - 1, e.y - 1, e.x + 1, e.y + 1, fill="#38bdf8", outline="")
        self._update_stats()

    def _track_bounds(self, x: int, y: int) -> None:
        self._min_x = x if self._min_x is None else min(self._min_x, x)
        self._max_x = x if self._max_x is None else max(self._max_x, x)
        self._min_y = y if self._min_y is None else min(self._min_y, y)
        self._max_y = y if self._max_y is None else max(self._max_y, y)

    def _on_left_down(self, e) -> None:
        self._left += 1
        self._dragging = True
        self._surface.create_oval(e.x - 6, e.y - 6, e.x + 6, e.y + 6, outline="#22c55e", width=2)
        self._update_stats()

    def _on_left_up(self, e) -> None:
        self._dragging = False

    def _on_right(self, e) -> None:
        self._right += 1
        self._surface.create_oval(e.x - 6, e.y - 6, e.x + 6, e.y + 6, outline="#f59e0b", width=2)
        self._update_stats()

    def _on_drag(self, e) -> None:
        if self._dragging:
            self._drag_events += 1
            self._surface.create_line(e.x - 3, e.y, e.x + 3, e.y, fill="#ef4444")
            self._update_stats()

    def _reset(self) -> None:
        self._left = self._right = self._drag_events = self._moves = 0
        self._min_x = self._max_x = self._min_y = self._max_y = None
        self._tail = []
        self._surface.delete("all")
        self._draw_guides()
        self._update_stats()

    # ------------------------------------------------------------------ #
    def close(self) -> None:
        moved = self._min_x is not None
        coverage = ""
        if moved:
            coverage = f"{self._max_x - self._min_x}x{self._max_y - self._min_y}px area"
        if self.on_result:
            ok = moved and (self._left + self._right) > 0
            self.on_result(
                TestOutcome(
                    test_id=TestID.TOUCHPAD,
                    status=TestStatus.PASSED if ok else TestStatus.WARNING,
                    summary=f"Pointer tested: {self._moves} moves, {self._left} left, {self._right} right, {self._drag_events} drag steps.",
                    readings=[
                        Reading("Moves", str(self._moves)),
                        Reading("Left clicks", str(self._left)),
                        Reading("Right clicks", str(self._right)),
                        Reading("Drag steps", str(self._drag_events)),
                        Reading("Coverage", coverage or "no movement"),
                        Reading("Source", "Pointer input (touchpad vs mouse not distinguishable)"),
                    ],
                    user_confirmed=True,
                )
            )
        self.destroy()
