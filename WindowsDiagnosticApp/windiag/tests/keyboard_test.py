"""Visual Keyboard Test (Phase 3).

Shows a full keyboard layout. Pressing a physical key highlights the matching
on-screen key and records the key identity (never typed text). Keys move through
states: untested -> pressed (live) -> tested. A counter and percentage track
progress. Reset and completion controls are provided.

Only key *identities and press counts* are recorded — no characters, passwords
or unrelated text are stored.
"""

from __future__ import annotations

import tkinter as tk
from tkinter import ttk
from typing import Callable, Optional

from ..testkit import Reading, TestID, TestOutcome, TestStatus

# Colour states
C_UNTESTED = "#334155"
C_PRESSED = "#f59e0b"
C_TESTED = "#22c55e"
C_MODIFIER = "#7c3aed"

# Layout rows as (keysym, label, is_modifier). Rows modelled on a standard
# US Windows keyboard (function row, number row, QWERTY, ASDF, ZXCV, space).
_MODS = {
    "Shift_L", "Shift_R", "Control_L", "Control_R", "Alt_L", "Alt_R",
    "Caps_Lock", "Super_L", "Super_R", "Menu",
}

_ROWS: list[list[tuple[str, str]]] = [
    [("Escape", "Esc")]
    + [(f"F{i}", f"F{i}") for i in range(1, 13)],
    [
        ("grave", "`"), ("1", "1"), ("2", "2"), ("3", "3"), ("4", "4"),
        ("5", "5"), ("6", "6"), ("7", "7"), ("8", "8"), ("9", "9"),
        ("0", "0"), ("minus", "-"), ("equal", "="), ("BackSpace", "Bksp"),
    ],
    [
        ("Tab", "Tab"), ("q", "Q"), ("w", "W"), ("e", "E"), ("r", "R"),
        ("t", "T"), ("y", "Y"), ("u", "U"), ("i", "I"), ("o", "O"),
        ("p", "P"), ("bracketleft", "["), ("bracketright", "]"), ("backslash", "\\"),
    ],
    [
        ("Caps_Lock", "Caps"), ("a", "A"), ("s", "S"), ("d", "D"), ("f", "F"),
        ("g", "G"), ("h", "H"), ("j", "J"), ("k", "K"), ("l", "L"),
        ("semicolon", ";"), ("apostrophe", "'"), ("Return", "Enter"),
    ],
    [
        ("Shift_L", "Shift"), ("z", "Z"), ("x", "X"), ("c", "C"), ("v", "V"),
        ("b", "B"), ("n", "N"), ("m", "M"), ("comma", ","), ("period", "."),
        ("slash", "/"), ("Shift_R", "Shift"),
    ],
    [
        ("Control_L", "Ctrl"), ("Super_L", "Win"), ("Alt_L", "Alt"),
        ("space", "Space"), ("Alt_R", "Alt"), ("Control_R", "Ctrl"),
        ("Left", "←"), ("Up", "↑"), ("Down", "↓"), ("Right", "→"),
    ],
]


class KeyboardTestWindow(tk.Toplevel):
    def __init__(self, master: tk.Misc, on_result: Optional[Callable[[TestOutcome], None]] = None) -> None:
        super().__init__(master)
        self.on_result = on_result
        self.title("Keyboard Test")
        self.geometry("1000x460")
        self.configure(bg="#0f172a")

        self._key_widgets: dict[str, tk.Widget] = {}
        self._tested: set[str] = set()
        self._press_counts: dict[str, int] = {}
        self._total_keys = 0
        self._recording = True

        self._build_header()
        self._build_layout()
        self._build_footer()

        self.bind("<KeyPress>", self._on_press)
        self.bind("<KeyRelease>", self._on_release)
        self.protocol("WM_DELETE_WINDOW", self.close)
        self.focus_set()

    # ------------------------------------------------------------------ #
    def _build_header(self) -> None:
        head = tk.Frame(self, bg="#1e293b")
        head.pack(fill="x", padx=10, pady=(10, 4))
        tk.Label(
            head,
            text="Keyboard Test — press each key; it turns green when tested.",
            bg="#1e293b",
            fg="white",
            font=("Segoe UI", 12, "bold"),
        ).pack(side="left", padx=10, pady=8)
        self._counter_var = tk.StringVar(value="0 / 0 keys (0%)")
        tk.Label(
            head, textvariable=self._counter_var, bg="#1e293b", fg="#38bdf8",
            font=("Segoe UI", 11, "bold"),
        ).pack(side="right", padx=10)

    def _build_layout(self) -> None:
        body = tk.Frame(self, bg="#0f172a")
        body.pack(fill="both", expand=True, padx=10, pady=6)
        for r, row in enumerate(_ROWS):
            row_frame = tk.Frame(body, bg="#0f172a")
            row_frame.pack(pady=2)
            for keysym, label in row:
                is_mod = keysym in _MODS
                bg = C_MODIFIER if is_mod else C_UNTESTED
                width = 6 if len(label) <= 4 else 8
                btn = tk.Label(
                    row_frame,
                    text=label,
                    width=width,
                    height=2,
                    bg=bg,
                    fg="white",
                    relief="raised",
                    bd=1,
                    font=("Segoe UI", 9),
                )
                btn.pack(side="left", padx=1)
                self._key_widgets[keysym.lower()] = btn
                self._total_keys += 1
        self._update_counter()

    def _build_footer(self) -> None:
        foot = tk.Frame(self, bg="#0f172a")
        foot.pack(fill="x", padx=10, pady=8)
        tk.Button(
            foot, text="Reset", command=self._reset, bg="#334155", fg="white", relief="flat", padx=12
        ).pack(side="left", padx=4)
        tk.Button(
            foot, text="Finish", command=self.close, bg="#22c55e", fg="white", relief="flat", padx=12
        ).pack(side="left", padx=4)
        tk.Label(
            foot,
            text="Key identities only are recorded — no typed text or passwords are stored.",
            bg="#0f172a",
            fg="#64748b",
            font=("Segoe UI", 9),
        ).pack(side="right", padx=6)

    # ------------------------------------------------------------------ #
    def _on_press(self, event) -> None:
        if not self._recording:
            return
        keysym = (event.keysym or "").lower()
        widget = self._key_widgets.get(keysym)
        if widget is None:
            # Some keys report different keysyms; try common aliases.
            aliases = {
                "shift": "shift_l", "control": "control_l", "alt": "alt_l",
                "return": "return", "space": "space", "caps_lock": "caps_lock",
            }
            widget = self._key_widgets.get(aliases.get(keysym, keysym))
        if widget is None:
            return
        widget.configure(bg=C_PRESSED)
        self._press_counts[keysym] = self._press_counts.get(keysym, 0) + 1

    def _on_release(self, event) -> None:
        keysym = (event.keysym or "").lower()
        widget = self._key_widgets.get(keysym)
        if widget is None:
            return
        self._tested.add(keysym)
        is_mod = keysym in {m.lower() for m in _MODS}
        widget.configure(bg=C_MODIFIER if is_mod else C_TESTED)
        self._update_counter()

    def _update_counter(self) -> None:
        tested = len(self._tested)
        pct = int(tested / self._total_keys * 100) if self._total_keys else 0
        self._counter_var.set(f"{tested} / {self._total_keys} keys ({pct}%)")

    def _reset(self) -> None:
        self._tested.clear()
        self._press_counts.clear()
        for keysym, widget in self._key_widgets.items():
            is_mod = keysym in {m.lower() for m in _MODS}
            widget.configure(bg=C_MODIFIER if is_mod else C_UNTESTED)
        self._update_counter()

    # ------------------------------------------------------------------ #
    def close(self) -> None:
        self._recording = False  # stop capturing on close
        tested = len(self._tested)
        total = self._total_keys
        pct = int(tested / total * 100) if total else 0
        if self.on_result:
            status = TestStatus.PASSED if pct >= 90 else (
                TestStatus.WARNING if pct >= 40 else TestStatus.NOT_RUN
            )
            self.on_result(
                TestOutcome(
                    test_id=TestID.KEYBOARD,
                    status=status,
                    summary=f"{tested}/{total} keys tested ({pct}%).",
                    readings=[
                        Reading("Keys tested", f"{tested}/{total}"),
                        Reading("Coverage", f"{pct}%"),
                        Reading("Method", "On-screen highlight of physical key presses"),
                    ],
                    user_confirmed=True,
                )
            )
        self.destroy()
