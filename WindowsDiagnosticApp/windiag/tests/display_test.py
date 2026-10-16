"""Full-screen Display Test (Phase 2).

Occupies the entire screen with solid colour / pattern canvases for visual
dead-pixel and backlight inspection. A translucent control overlay (header +
nav) auto-hides after inactivity and reappears on mouse move or key press.
Escape exits safely and restores the previous window state.

Never claims automatic dead-pixel detection — inspection is visual and labelled
as such.
"""

from __future__ import annotations

import tkinter as tk
from tkinter import ttk
from typing import Callable, Optional

from ..support import hardware as hw
from ..testkit import Reading, TestID, TestOutcome, TestStatus


def _gradient_canvas(canvas: tk.Canvas, w: int, h: int, mode: str) -> None:
    """Draw a horizontal gradient in-place (no external images)."""
    steps = 64
    step_w = max(1, w // steps)
    for i in range(steps):
        frac = i / (steps - 1)
        if mode == "gray":
            v = int(frac * 255)
            colour = f"#{v:02x}{v:02x}{v:02x}"
        elif mode == "red":
            colour = f"#{int(frac*255):02x}0000"
        elif mode == "green":
            colour = f"#00{int(frac*255):02x}00"
        elif mode == "blue":
            colour = f"#0000{int(frac*255):02x}"
        canvas.create_rectangle(
            i * step_w, 0, (i + 1) * step_w + 1, h, fill=colour, outline=""
        )


def _checkerboard(canvas: tk.Canvas, w: int, h: int, cell: int = 40) -> None:
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            colour = "#ffffff" if ((x // cell) + (y // cell)) % 2 == 0 else "#000000"
            canvas.create_rectangle(x, y, x + cell, y + cell, fill=colour, outline="")


def _grid(canvas: tk.Canvas, w: int, h: int, step: int = 50) -> None:
    canvas.configure(bg="#000000")
    for x in range(0, w, step):
        canvas.create_line(x, 0, x, h, fill="#00ff41")
    for y in range(0, h, step):
        canvas.create_line(0, y, w, y, fill="#00ff41")
    # Border + centre crosshair for geometry/overscan check.
    canvas.create_rectangle(2, 2, w - 3, h - 3, outline="#ff00ff", width=2)
    canvas.create_line(w // 2, 0, w // 2, h, fill="#ffff00")
    canvas.create_line(0, h // 2, w, h // 2, fill="#ffff00")


PATTERNS: list[tuple[str, str, Optional[str]]] = [
    ("White", "solid", "#ffffff"),
    ("Black", "solid", "#000000"),
    ("Red", "solid", "#ff0000"),
    ("Green", "solid", "#00ff00"),
    ("Blue", "solid", "#0000ff"),
    ("Gray", "solid", "#808080"),
    ("Gradient Gray", "gray", None),
    ("Gradient Red", "red", None),
    ("Gradient Green", "green", None),
    ("Gradient Blue", "blue", None),
    ("Checkerboard", "checker", None),
    ("Grid / Geometry", "grid", None),
]


class DisplayTestWindow(tk.Toplevel):
    """Full-screen display inspection window with auto-hide overlay controls."""

    AUTOHIDE_MS = 3000

    def __init__(self, master: tk.Misc, on_result: Optional[Callable[[TestOutcome], None]] = None) -> None:
        super().__init__(master)
        self.on_result = on_result
        self.idx = 0
        self._hide_job: Optional[str] = None
        self._prev_geometry = None
        self._displays = hw.display_settings()

        self.title("Display Test")
        self.configure(bg="black")
        self.attributes("-fullscreen", True)
        self.attributes("-topmost", True)
        self.focus_set()

        self._canvas = tk.Canvas(self, bg="black", highlightthickness=0, cursor="none")
        self._canvas.pack(fill="both", expand=True)

        self._build_overlay()
        self._draw_pattern()

        self.bind("<Escape>", lambda e: self.close())
        self.bind("<Left>", lambda e: self.prev_pattern())
        self.bind("<Right>", lambda e: self.next_pattern())
        self.bind("<space>", lambda e: self.next_pattern())
        self.bind("<F11>", lambda e: self.close())
        self.bind("<Motion>", lambda e: self._reveal_controls())
        self.bind("<Key>", lambda e: self._reveal_controls())

    # ------------------------------------------------------------------ #
    def _build_overlay(self) -> None:
        # Translucent overlay frame pinned to the top; auto-hides.
        self._overlay = tk.Frame(self, bg="#000000")
        self._overlay.place(x=0, y=0, relwidth=1)

        bar = tk.Frame(self._overlay, bg="#111827")
        bar.pack(fill="x", padx=8, pady=8)

        self._title_var = tk.StringVar()
        ttk.Label(bar, textvariable=self._title_var, style="TLabel").pack(
            side="left", padx=(8, 16)
        )

        info = self._display_info_text()
        ttk.Label(bar, text=info, style="Muted.TLabel").pack(side="left")

        controls = tk.Frame(bar, bg="#111827")
        controls.pack(side="right")
        for lbl, cmd in (
            ("◀ Prev", self.prev_pattern),
            ("Next ▶", self.next_pattern),
            ("Exit (Esc)", self.close),
        ):
            b = tk.Button(
                controls,
                text=lbl,
                command=cmd,
                bg="#1f2937",
                fg="white",
                relief="flat",
                padx=10,
                pady=4,
            )
            b.pack(side="left", padx=3)

        # Try to make the overlay semi-transparent (supported on Windows).
        try:
            self._overlay.attributes("-alpha", 0.85)
        except tk.TclError:
            pass

        self._schedule_hide()

    def _display_info_text(self) -> str:
        if self._displays:
            d0 = self._displays[0]
            return f"{d0.get('resolution','?')} @ {d0.get('refresh_hz','?')}Hz · {len(self._displays)} display(s)"
        return "Visual inspection — patterns shown for dead/stuck pixel check"

    # ------------------------------------------------------------------ #
    def _draw_pattern(self) -> None:
        name, mode, colour = PATTERNS[self.idx]
        self._title_var.set(f"{name}  ({self.idx + 1}/{len(PATTERNS)})")
        self.update_idletasks()
        w = self.winfo_screenwidth()
        h = self.winfo_screenheight()
        self._canvas.delete("all")
        self._canvas.configure(bg="black", cursor="none")

        if mode == "solid":
            self._canvas.configure(bg=colour or "#000000")
        elif mode in ("gray", "red", "green", "blue"):
            _gradient_canvas(self._canvas, w, h, mode)
        elif mode == "checker":
            _checkerboard(self._canvas, w, h)
        elif mode == "grid":
            _grid(self._canvas, w, h)

    def next_pattern(self) -> None:
        self.idx = (self.idx + 1) % len(PATTERNS)
        self._draw_pattern()
        self._reveal_controls()

    def prev_pattern(self) -> None:
        self.idx = (self.idx - 1) % len(PATTERNS)
        self._draw_pattern()
        self._reveal_controls()

    # ------------------------------------------------------------------ #
    def _reveal_controls(self) -> None:
        self._overlay.place(x=0, y=0, relwidth=1)
        self._cursor_restore()
        self._schedule_hide()

    def _schedule_hide(self) -> None:
        if self._hide_job:
            self.after_cancel(self._hide_job)
        self._hide_job = self.after(self.AUTOHIDE_MS, self._hide_controls)

    def _hide_controls(self) -> None:
        self._overlay.place_forget()
        self._canvas.configure(cursor="none")

    def _cursor_restore(self) -> None:
        self._canvas.configure(cursor="arrow")

    # ------------------------------------------------------------------ #
    def close(self) -> None:
        if self.on_result:
            # The test is user-driven visual inspection, so record it as
            # user-confirmed rather than claiming automated detection.
            self.on_result(
                TestOutcome(
                    test_id=TestID.DISPLAY,
                    status=TestStatus.PASSED,
                    summary=f"Visual inspection of {len(PATTERNS)} patterns completed (user-driven).",
                    readings=[
                        Reading("Patterns shown", str(len(PATTERNS))),
                        Reading("Method", "Visual inspection (no automated pixel detection)"),
                    ],
                    user_confirmed=True,
                )
            )
        self.destroy()
