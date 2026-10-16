"""Professional diagnostic dashboard (Phase 1) for the Windows Diagnostic Center.

Clearly labelled, categorized test cards with live statuses. Launches the
interactive test windows (display, keyboard, touchpad, speakers, mic, camera,
stress) and runs the headless health/connectivity tests in a worker thread so
the UI never blocks. Ties into reports/history and automatic diagnostics.
"""

from __future__ import annotations

import queue
import threading
import tkinter as tk
from tkinter import messagebox, ttk
from typing import Callable, Optional

from . import APP_NAME, APP_VERSION
from .report import HistoryStore, export_run, run_automatic
from .support.device_info import detect_device
from .testkit import (
    STATUS_COLORS,
    Reading,
    TestCategory,
    TestID,
    TestMeta,
    TestOutcome,
    TestStatus,
)

# Interactive test windows (imported lazily to keep startup fast).
from .tests.display_test import DisplayTestWindow
from .tests.keyboard_test import KeyboardTestWindow
from .tests.touchpad_test import TouchpadTestWindow
from .tests.speakers_test import SpeakersTestWindow
from .tests.microphone_test import MicrophoneTestWindow
from .tests.camera_test import CameraTestWindow
from .tests.stress_windows import (
    CpuStressWindow,
    FanStressWindow,
    GpuStressWindow,
    RamStressWindow,
)


# --------------------------------------------------------------------------- #
# Test catalogue: every test with a clear name, purpose and instructions.
# --------------------------------------------------------------------------- #
TEST_CATALOGUE: list[TestMeta] = [
    TestMeta(TestID.DISPLAY, "Display Test", TestCategory.INTERACTIVE,
             "Full-screen patterns to inspect for dead/stuck pixels and backlight bleed.",
             "Cycle colour/pattern screens; inspect for stuck pixels. Esc exits.", automated=False),
    TestMeta(TestID.KEYBOARD, "Keyboard Test", TestCategory.INTERACTIVE,
             "Visual keyboard; keys highlight green as you press them.",
             "Press every key. Green = tested. No typed text is stored.", automated=False),
    TestMeta(TestID.TOUCHPAD, "Touchpad & Mouse", TestCategory.INTERACTIVE,
             "Live pointer X/Y, clicks and drag tracking on a test surface.",
             "Move, left/right-click and drag on the surface. Esc/Finish to exit.", automated=False),
    TestMeta(TestID.SPEAKERS, "Speakers & Headphones", TestCategory.INTERACTIVE,
             "Left/right/stereo/mono test tones routed per channel.",
             "Play each tone, listen, and confirm what you heard.", automated=False),
    TestMeta(TestID.MICROPHONE, "Microphone Test", TestCategory.INTERACTIVE,
             "Live input level; record, play back and delete a sample.",
             "Record your voice, play it back, then delete. Needs mic permission.", automated=False,
             needs_permission="microphone"),
    TestMeta(TestID.CAMERA, "Camera Test", TestCategory.INTERACTIVE,
             "Live camera preview with real frame count and measured FPS.",
             "Start the preview; confirm a clear image. Needs camera permission.", automated=False,
             needs_permission="camera"),

    TestMeta(TestID.CPU_STRESS, "CPU Stress Test", TestCategory.PERFORMANCE,
             "Controlled CPU load with live utilisation and thermal warnings.",
             "Pick a duration and Start. Stop anytime. Warns at 90°C.", automated=False),
    TestMeta(TestID.GPU_STRESS, "GPU Stress Test", TestCategory.PERFORMANCE,
             "Identifies GPU and runs a bounded render probe.",
             "Run the GPU probe. Live temp/usage need a vendor API.", automated=False),
    TestMeta(TestID.RAM_STRESS, "RAM Stress Test", TestCategory.PERFORMANCE,
             "Bounded memory allocation + integrity pattern verification.",
             "Choose a size within free memory; Start. Stop anytime.", automated=False),
    TestMeta(TestID.FAN, "Fan & Cooling Test", TestCategory.PERFORMANCE,
             "Cooling observation of temperature/clock/utilisation over 10s.",
             "Manual max-fan is Unsupported; this observes cooling instead.", automated=False),

    TestMeta(TestID.BATTERY, "Battery & Charging", TestCategory.HEALTH,
             "Charge level, charging state and design/full-charge capacity.",
             "Automated read-only check of Win32_Battery.", automated=True),
    TestMeta(TestID.STORAGE_HEALTH, "SSD / HDD Health", TestCategory.HEALTH,
             "Drive model, capacity, interface and SMART status (read-only).",
             "Automated read-only inventory. No writes to your drives.", automated=True),
    TestMeta(TestID.THERMAL, "Temperature & Sensors", TestCategory.HEALTH,
             "CPU temperature, load, clock and fan RPM where exposed.",
             "Automated sensor read. Unsupported values are labelled.", automated=True),

    TestMeta(TestID.NETWORK, "Wi-Fi & Network", TestCategory.SYSTEM,
             "Adapter status, IP config, gateway and internet latency.",
             "Automated check incl. ping to 8.8.8.8.", automated=True),
    TestMeta(TestID.BLUETOOTH, "Bluetooth Test", TestCategory.SYSTEM,
             "Bluetooth radio presence and status.",
             "Automated adapter detection.", automated=True),
    TestMeta(TestID.USB, "USB & External Ports", TestCategory.SYSTEM,
             "Enumerates connected USB devices.",
             "Automated enumeration. Physical port check needs a plug-in test.", automated=True),
    TestMeta(TestID.SYSTEM_INFO, "System Information", TestCategory.SYSTEM,
             "CPU, GPU, RAM, BIOS, motherboard, OS and serial.",
             "Automated inventory (read-only).", automated=True),
    TestMeta(TestID.WINDOWS_HEALTH, "Windows & Driver Health", TestCategory.SYSTEM,
             "Device Manager problem codes and OS build.",
             "Automated read-only health check.", automated=True),

    TestMeta(TestID.AUTO, "Automatic Diagnostics", TestCategory.WORKFLOW,
             "Run selected headless tests sequentially and build a report.",
             "Choose categories, run, then export a consolidated report.", automated=True),
    TestMeta(TestID.HISTORY, "Test History & Reports", TestCategory.WORKFLOW,
             "Review past runs and export CSV/HTML reports.",
             "Open history to view, export or delete past runs.", automated=True),
]


class Dashboard(tk.Tk):
    """Main categorized dashboard."""

    def __init__(self) -> None:
        super().__init__()
        self.title(f"{APP_NAME}")
        self.geometry("1080x720")
        self.minsize(940, 640)
        self.configure(bg="#0f172a")

        self.store = HistoryStore()
        self.device: dict = {}
        self.statuses: dict[TestID, TestOutcome] = {}
        self._queue: "queue.Queue" = queue.Queue()
        self._cards: dict[TestID, dict] = {}
        self._tech = "Technician"

        self._style()
        self._build_header()
        self._build_body()
        self._build_status_bar()

        threading.Thread(target=self._detect_device, daemon=True).start()
        self.after(100, self._poll)

    # ------------------------------------------------------------------ #
    def _style(self) -> None:
        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure("TFrame", background="#0f172a")
        style.configure("Card.TFrame", background="#1e293b")
        style.configure("TLabel", background="#0f172a", fg="#e2e8f0")
        style.configure("Card.TLabel", background="#1e293b", fg="#e2e8f0")
        style.configure("Title.TLabel", background="#0f172a", fg="#e2e8f0",
                        font=("Segoe UI", 20, "bold"))
        style.configure("Cat.TLabel", background="#0f172a", fg="#38bdf8",
                        font=("Segoe UI", 12, "bold"))

    def _build_header(self) -> None:
        head = ttk.Frame(self)
        head.pack(fill="x", padx=18, pady=(14, 4))
        ttk.Label(head, text=APP_NAME, style="Title.TLabel").pack(side="left")
        right = ttk.Frame(head)
        right.pack(side="right")
        self._dev_label = ttk.Label(right, text="Detecting device…", style="TLabel")
        self._dev_label.pack(side="right", padx=8)
        ttk.Label(right, text=f"v{APP_VERSION}", style="TLabel").pack(side="right", padx=8)

    def _build_body(self) -> None:
        # Scrollable body.
        container = ttk.Frame(self)
        container.pack(fill="both", expand=True, padx=18, pady=6)
        self._canvas = tk.Canvas(container, bg="#0f172a", highlightthickness=0)
        vsb = ttk.Scrollbar(container, orient="vertical", command=self._canvas.yview)
        self._inner = ttk.Frame(self._canvas)
        self._inner.bind(
            "<Configure>", lambda e: self._canvas.configure(scrollregion=self._canvas.bbox("all"))
        )
        self._canvas.create_window((0, 0), window=self._inner, anchor="nw")
        self._canvas.configure(yscrollcommand=vsb.set)
        self._canvas.pack(side="left", fill="both", expand=True)
        vsb.pack(side="right", fill="y")
        self._canvas.bind("<Configure>", self._on_canvas_configure)
        self._bind_mousewheel()

        # Group by category.
        by_cat: dict[TestCategory, list[TestMeta]] = {}
        for meta in TEST_CATALOGUE:
            by_cat.setdefault(meta.category, []).append(meta)

        for cat in (TestCategory.INTERACTIVE, TestCategory.PERFORMANCE,
                    TestCategory.HEALTH, TestCategory.SYSTEM, TestCategory.WORKFLOW):
            metas = by_cat.get(cat, [])
            if not metas:
                continue
            ttk.Label(self._inner, text=cat.value, style="Cat.TLabel").pack(anchor="w", pady=(10, 2))
            grid = ttk.Frame(self._inner)
            grid.pack(fill="x")
            for i, meta in enumerate(metas):
                self._build_card(grid, meta, i)

    def _on_canvas_configure(self, event) -> None:
        self._canvas.itemconfigure(self._canvas.find_all()[0], width=event.width)

    def _bind_mousewheel(self) -> None:
        def _on_wheel(event):
            self._canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

        self._canvas.bind_all("<MouseWheel>", _on_wheel)

    def _build_card(self, parent: ttk.Frame, meta: TestMeta, index: int) -> None:
        card = tk.Frame(parent, bg="#1e293b", bd=0, highlightthickness=1,
                        highlightbackground="#334155")
        row, col = divmod(index, 3)
        card.grid(row=row, column=col, padx=6, pady=6, sticky="nsew")
        parent.columnconfigure(col, weight=1)

        tk.Label(card, text=meta.name, bg="#1e293b", fg="white", font=("Segoe UI", 11, "bold"),
                 anchor="w").pack(fill="x", padx=10, pady=(8, 2))
        tk.Label(card, text=meta.purpose, bg="#1e293b", fg="#94a3b8", font=("Segoe UI", 9),
                 wraplength=300, justify="left").pack(fill="x", padx=10)

        status_var = tk.StringVar(value=TestStatus.NOT_RUN.value)
        badge = tk.Label(card, textvariable=status_var, bg=STATUS_COLORS[TestStatus.NOT_RUN],
                         fg="white", font=("Segoe UI", 9, "bold"), padx=8, pady=2)
        badge.pack(anchor="w", padx=10, pady=(6, 2))

        btn = tk.Button(card, text="Open" if not meta.automated else "Run",
                        command=lambda m=meta: self._launch(m), bg="#38bdf8", fg="black",
                        relief="flat", padx=12, pady=2, font=("Segoe UI", 9, "bold"))
        btn.pack(anchor="w", padx=10, pady=(0, 10))

        self._cards[meta.id] = {"status_var": status_var, "badge": badge}

    def _build_status_bar(self) -> None:
        bar = ttk.Frame(self)
        bar.pack(fill="x", padx=18, pady=(4, 10))
        self._summary_var = tk.StringVar(value="Ready")
        ttk.Label(bar, textvariable=self._summary_var, style="TLabel").pack(side="left")
        tk.Button(bar, text="Automatic Diagnostics", command=self._launch_auto,
                  bg="#22c55e", fg="white", relief="flat", padx=12).pack(side="right", padx=4)
        tk.Button(bar, text="History", command=self._launch_history,
                  bg="#334155", fg="white", relief="flat", padx=12).pack(side="right", padx=4)

    # ------------------------------------------------------------------ #
    def _detect_device(self) -> None:
        device = detect_device()
        self.device = device.to_dict()
        self._queue.put(("device", device))

    def _set_status(self, tid: TestID, outcome: TestOutcome) -> None:
        self.statuses[tid] = outcome
        card = self._cards.get(tid)
        if card:
            card["status_var"].set(outcome.status.value)
            card["badge"].configure(bg=STATUS_COLORS[outcome.status])

    # ------------------------------------------------------------------ #
    def _launch(self, meta: TestMeta) -> None:
        handler = {
            TestID.DISPLAY: DisplayTestWindow,
            TestID.KEYBOARD: KeyboardTestWindow,
            TestID.TOUCHPAD: TouchpadTestWindow,
            TestID.SPEAKERS: SpeakersTestWindow,
            TestID.MICROPHONE: MicrophoneTestWindow,
            TestID.CAMERA: CameraTestWindow,
            TestID.CPU_STRESS: CpuStressWindow,
            TestID.GPU_STRESS: GpuStressWindow,
            TestID.RAM_STRESS: RamStressWindow,
            TestID.FAN: FanStressWindow,
        }.get(meta.id)

        if meta.id == TestID.AUTO:
            return self._launch_auto()
        if meta.id == TestID.HISTORY:
            return self._launch_history()

        if handler is not None:
            self._set_status(meta.id, TestOutcome(meta.id, TestStatus.RUNNING, "Running…"))
            handler(self, on_result=lambda o, tid=meta.id: self._on_result(tid, o))
        elif meta.automated:
            # Headless automated test.
            self._set_status(meta.id, TestOutcome(meta.id, TestStatus.RUNNING, "Running…"))

            def worker(tid=meta.id):
                from .tests.automated import AUTOMATED_TESTS

                try:
                    outcome = AUTOMATED_TESTS[tid]()
                except Exception as exc:
                    outcome = TestOutcome(tid, TestStatus.ERROR, f"Error: {exc}", errors=[str(exc)])
                self._queue.put(("result", (tid, outcome)))

            threading.Thread(target=worker, daemon=True).start()

    def _on_result(self, tid: TestID, outcome: TestOutcome) -> None:
        self._set_status(tid, outcome)

    # ------------------------------------------------------------------ #
    def _launch_auto(self) -> None:
        AutoDiagnosticsWindow(self, self.device, on_complete=self._on_auto_complete)

    def _on_auto_complete(self, run: dict) -> None:
        for o in run.get("outcomes", []):
            try:
                tid = TestID(o["test_id"])
            except ValueError:
                continue
            self._set_status(tid, TestOutcome.from_dict(o))
        self._summary_var.set(
            f"Automatic run complete: {run.get('summary', {})}"
        )

    def _launch_history(self) -> None:
        HistoryWindow(self, self.store)

    # ------------------------------------------------------------------ #
    def _poll(self) -> None:
        try:
            while True:
                kind, payload = self._queue.get_nowait()
                if kind == "device":
                    d = payload
                    self._dev_label.configure(
                        text=f"{d.manufacturer} {d.model} · {d.cpu_name} · {d.memory_gb}"
                    )
                elif kind == "result":
                    tid, outcome = payload
                    self._set_status(tid, outcome)
        except queue.Empty:
            pass
        self.after(100, self._poll)


# --------------------------------------------------------------------------- #
# Automatic diagnostics window
# --------------------------------------------------------------------------- #
class AutoDiagnosticsWindow(tk.Toplevel):
    def __init__(self, master: tk.Misc, device: dict,
                 on_complete: Optional[Callable[[dict], None]] = None) -> None:
        super().__init__(master)
        self.title("Automatic Diagnostics")
        self.geometry("720x560")
        self.configure(bg="#0f172a")
        self.device = device
        self.on_complete = on_complete
        self._queue: "queue.Queue" = queue.Queue()
        self._build()
        self.after(100, self._poll)

    def _build(self) -> None:
        from .tests.automated import AUTOMATED_TESTS

        tk.Label(self, text="Automatic Diagnostics", bg="#0f172a", fg="white",
                 font=("Segoe UI", 15, "bold")).pack(pady=(14, 4))
        tk.Label(self, text="Select headless tests to run sequentially:",
                 bg="#0f172a", fg="#94a3b8").pack()

        self._vars: dict[TestID, tk.BooleanVar] = {}
        frame = tk.Frame(self, bg="#0f172a")
        frame.pack(fill="both", expand=True, padx=20, pady=8)
        order = [TestID.SYSTEM_INFO, TestID.BATTERY, TestID.STORAGE_HEALTH, TestID.THERMAL,
                 TestID.NETWORK, TestID.BLUETOOTH, TestID.USB, TestID.WINDOWS_HEALTH]
        for tid in order:
            if tid not in AUTOMATED_TESTS:
                continue
            var = tk.BooleanVar(value=True)
            self._vars[tid] = var
            meta = next((m for m in TEST_CATALOGUE if m.id == tid), None)
            label = meta.name if meta else tid.value
            tk.Checkbutton(frame, text=label, variable=var, bg="#0f172a", fg="white",
                           selectcolor="#334155", activebackground="#0f172a",
                           anchor="w").pack(anchor="w", pady=2)

        self._bar = ttk.Progressbar(self, maximum=1.0)
        self._bar.pack(fill="x", padx=20, pady=6)
        self._log = tk.Text(self, bg="#0b1220", fg="#e2e8f0", height=10, relief="flat",
                            font=("Consolas", 9))
        self._log.pack(fill="both", expand=True, padx=20, pady=6)

        ctl = tk.Frame(self, bg="#0f172a")
        ctl.pack(pady=8)
        self._run_btn = tk.Button(ctl, text="Run selected", command=self._run, bg="#22c55e",
                                  fg="white", relief="flat", padx=14)
        self._run_btn.pack(side="left", padx=4)
        tk.Button(ctl, text="Export HTML", command=self._export_html, bg="#38bdf8", fg="black",
                  relief="flat", padx=12).pack(side="left", padx=4)
        tk.Button(ctl, text="Export CSV", command=self._export_csv, bg="#38bdf8", fg="black",
                  relief="flat", padx=12).pack(side="left", padx=4)
        tk.Button(ctl, text="Close", command=self.destroy, bg="#334155", fg="white",
                  relief="flat", padx=12).pack(side="left", padx=4)
        self._run: Optional[Callable[[], None]] = None
        self._last_run: Optional[dict] = None

    def _run(self) -> None:
        selected = [tid for tid, var in self._vars.items() if var.get()]
        if not selected:
            messagebox.showinfo("Select tests", "Choose at least one test.")
            return
        self._run_btn.configure(state="disabled")
        self._log.delete("1.0", "end")

        def progress(i, total, tid):
            self._queue.put(("progress", (i, total, tid)))

        def worker():
            outcomes = run_automatic(selected, on_progress=progress)
            run = self.store_add(outcomes)
            self._queue.put(("done", run))

        threading.Thread(target=worker, daemon=True).start()

    def store_add(self, outcomes):
        store = HistoryStore()
        run = store.add_run(self.device, outcomes)
        self._last_run = run
        return run

    def _poll(self) -> None:
        try:
            while True:
                kind, payload = self._queue.get_nowait()
                if kind == "progress":
                    i, total, tid = payload
                    self._bar["value"] = (i / total) if total else 0
                    if tid:
                        self._log.insert("end", f"▸ {tid.value}…\n")
                        self._log.see("end")
                elif kind == "done":
                    run = payload
                    self._bar["value"] = 1.0
                    self._log.insert("end", f"\nDone. Summary: {run.get('summary')}\n")
                    self._run_btn.configure(state="normal")
                    if self.on_complete:
                        self.on_complete(run)
        except queue.Empty:
            pass
        self.after(100, self._poll)

    def _export_html(self) -> None:
        if not self._last_run:
            messagebox.showinfo("Nothing to export", "Run the diagnostics first.")
            return
        path = export_run(self._last_run, fmt="html")
        messagebox.showinfo("Exported", f"HTML report:\n{path}")

    def _export_csv(self) -> None:
        if not self._last_run:
            messagebox.showinfo("Nothing to export", "Run the diagnostics first.")
            return
        path = export_run(self._last_run, fmt="csv")
        messagebox.showinfo("Exported", f"CSV report:\n{path}")


# --------------------------------------------------------------------------- #
# History window
# --------------------------------------------------------------------------- #
class HistoryWindow(tk.Toplevel):
    def __init__(self, master: tk.Misc, store: HistoryStore) -> None:
        super().__init__(master)
        self.title("Test History & Reports")
        self.geometry("820x520")
        self.configure(bg="#0f172a")
        self.store = store
        self._build()
        self._refresh()

    def _build(self) -> None:
        tk.Label(self, text="Test History & Reports", bg="#0f172a", fg="white",
                 font=("Segoe UI", 15, "bold")).pack(pady=(14, 6))
        cols = ("timestamp", "device", "summary")
        self._tree = ttk.Treeview(self, columns=cols, show="headings")
        for c, w in (("timestamp", 180), ("device", 220), ("summary", 360)):
            self._tree.heading(c, text=c.title())
            self._tree.column(c, width=w)
        self._tree.pack(fill="both", expand=True, padx=20, pady=6)

        ctl = tk.Frame(self, bg="#0f172a")
        ctl.pack(pady=8)
        tk.Button(ctl, text="Export HTML", command=self._export_html, bg="#38bdf8", fg="black",
                  relief="flat", padx=12).pack(side="left", padx=4)
        tk.Button(ctl, text="Export CSV", command=self._export_csv, bg="#38bdf8", fg="black",
                  relief="flat", padx=12).pack(side="left", padx=4)
        tk.Button(ctl, text="Delete", command=self._delete, bg="#ef4444", fg="white",
                  relief="flat", padx=12).pack(side="left", padx=4)
        tk.Button(ctl, text="Close", command=self.destroy, bg="#334155", fg="white",
                  relief="flat", padx=12).pack(side="left", padx=4)
        self._runs: list[dict] = []

    def _refresh(self) -> None:
        for i in self._tree.get_children():
            self._tree.delete(i)
        self._runs = sorted(self.store.load(), key=lambda r: r.get("timestamp", ""), reverse=True)
        for r in self._runs:
            dev = r.get("device", {})
            summary = ", ".join(f"{k}:{v}" for k, v in r.get("summary", {}).items())
            self._tree.insert("", "end", values=(
                r.get("timestamp", "")[:19],
                f"{dev.get('manufacturer','')} {dev.get('model','')}".strip(),
                summary,
            ))

    def _selected(self):
        sel = self._tree.selection()
        if not sel:
            return None
        idx = self._tree.index(sel[0])
        return self._runs[idx] if idx < len(self._runs) else None

    def _export_html(self) -> None:
        run = self._selected()
        if not run:
            messagebox.showinfo("Select", "Choose a run first.")
            return
        messagebox.showinfo("Exported", f"HTML report:\n{export_run(run, fmt='html')}")

    def _export_csv(self) -> None:
        run = self._selected()
        if not run:
            messagebox.showinfo("Select", "Choose a run first.")
            return
        messagebox.showinfo("Exported", f"CSV report:\n{export_run(run, fmt='csv')}")

    def _delete(self) -> None:
        run = self._selected()
        if not run:
            return
        if messagebox.askyesno("Delete", "Delete this run?"):
            self.store.delete_run(run["id"])
            self._refresh()


def main() -> None:
    app = Dashboard()
    app.mainloop()


if __name__ == "__main__":
    main()
