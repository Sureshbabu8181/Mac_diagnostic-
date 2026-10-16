"""Interactive stress-test windows (CPU, GPU, RAM, Fan) with live controls.

Each window runs its workload on a worker thread so the UI stays responsive,
shows live progress/readings, and offers an immediate Stop. Results are reported
back via the on_result callback as a TestOutcome.
"""

from __future__ import annotations

import threading
import tkinter as tk
from tkinter import ttk
from typing import Callable, Optional

from ..testkit import Reading, TestID, TestOutcome, TestStatus
from . import stress


# --------------------------------------------------------------------------- #
# CPU stress window
# --------------------------------------------------------------------------- #
class CpuStressWindow(tk.Toplevel):
    DURATIONS = [("Short (10s)", 10), ("Medium (30s)", 30), ("Long (60s)", 60)]

    def __init__(self, master: tk.Misc, on_result: Optional[Callable[[TestOutcome], None]] = None) -> None:
        super().__init__(master)
        self.on_result = on_result
        self.title("CPU Stress Test")
        self.geometry("640x460")
        self.configure(bg="#0f172a")
        self._token = stress.CancellationToken()
        self._running = False
        self._result: dict = {}
        self._build()

    def _build(self) -> None:
        tk.Label(self, text="CPU Stress Test", bg="#0f172a", fg="white",
                 font=("Segoe UI", 15, "bold")).pack(pady=(14, 4))
        tk.Label(self, text="Burns CPU across (cores-1) workers. Stop anytime. "
                           "Temperature warns at 90°C.", bg="#0f172a", fg="#94a3b8",
                 wraplength=560, font=("Segoe UI", 9)).pack(padx=20)

        dur = tk.Frame(self, bg="#0f172a")
        dur.pack(pady=10)
        tk.Label(dur, text="Duration:", bg="#0f172a", fg="#e2e8f0").pack(side="left")
        self._dur = tk.IntVar(value=30)
        for label, secs in self.DURATIONS:
            tk.Radiobutton(dur, text=label, variable=self._dur, value=secs, bg="#0f172a",
                           fg="white", selectcolor="#334155", activebackground="#0f172a").pack(
                side="left", padx=6)

        self._bar = ttk.Progressbar(self, maximum=1.0)
        self._bar.pack(fill="x", padx=20, pady=8)

        self._read_var = tk.StringVar(value="Idle")
        tk.Label(self, textvariable=self._read_var, bg="#0f172a", fg="#38bdf8",
                 font=("Consolas", 11), wraplength=560, justify="left").pack(padx=20, pady=6)

        ctl = tk.Frame(self, bg="#0f172a")
        ctl.pack(pady=10)
        self._start_btn = tk.Button(ctl, text="Start", command=self._start, bg="#22c55e",
                                    fg="white", relief="flat", padx=16)
        self._start_btn.pack(side="left", padx=4)
        self._stop_btn = tk.Button(ctl, text="Stop", command=self._stop, bg="#ef4444",
                                   fg="white", relief="flat", padx=16, state="disabled")
        self._stop_btn.pack(side="left", padx=4)
        tk.Button(ctl, text="Close", command=self.close, bg="#334155", fg="white",
                  relief="flat", padx=12).pack(side="left", padx=4)

    def _start(self) -> None:
        if self._running:
            return
        self._token = stress.CancellationToken()
        self._running = True
        self._start_btn.configure(state="disabled")
        self._stop_btn.configure(state="normal")
        duration = float(self._dur.get())

        def progress(frac: float, sample: dict) -> None:
            self.after(0, lambda: self._update(frac, sample))

        def worker():
            self._result = stress.cpu_stress_worker(duration, self._token, progress)
            self.after(0, self._finish)

        threading.Thread(target=worker, daemon=True).start()

    def _update(self, frac: float, sample: dict) -> None:
        self._bar["value"] = frac
        parts = [f"Elapsed: {sample.get('elapsed', 0)}s"]
        if sample.get("load") is not None:
            parts.append(f"Load: {sample['load']:.0f}%")
        if sample.get("temp") is not None:
            parts.append(f"Temp: {sample['temp']:.1f}°C")
        else:
            parts.append("Temp: unsupported")
        if sample.get("clock") is not None:
            parts.append(f"Clock: {sample['clock']:.0f}MHz")
        self._read_var.set("  ·  ".join(parts))

    def _stop(self) -> None:
        self._token.cancel()

    def _finish(self) -> None:
        self._running = False
        self._start_btn.configure(state="normal")
        self._stop_btn.configure(state="disabled")
        outcome = stress.make_cpu_outcome(self._result, float(self._dur.get()))
        self._read_var.set(outcome.summary)
        if self.on_result:
            self.on_result(outcome)

    def close(self) -> None:
        self._token.cancel()
        self.destroy()


# --------------------------------------------------------------------------- #
# RAM stress window
# --------------------------------------------------------------------------- #
class RamStressWindow(tk.Toplevel):
    def __init__(self, master: tk.Misc, on_result: Optional[Callable[[TestOutcome], None]] = None) -> None:
        super().__init__(master)
        self.on_result = on_result
        self.title("RAM Stress Test")
        self.geometry("640x460")
        self.configure(bg="#0f172a")
        self._token = stress.CancellationToken()
        self._running = False
        self._result: dict = {}
        self._build()

    def _build(self) -> None:
        from ..support import hardware as hw

        tk.Label(self, text="RAM Stress Test", bg="#0f172a", fg="white",
                 font=("Segoe UI", 15, "bold")).pack(pady=(14, 4))
        mem = hw.memory_status()
        total = mem.get("total_gb", 0)
        tk.Label(self, text=f"Installed: {total} GB · reserves {stress.RESERVED_MEMORY_GB} GB for Windows+app.",
                 bg="#0f172a", fg="#94a3b8", font=("Segoe UI", 9)).pack()

        size = tk.Frame(self, bg="#0f172a")
        size.pack(pady=10)
        tk.Label(size, text="Test size:", bg="#0f172a", fg="#e2e8f0").pack(side="left")
        # Default to a conservative fraction of free memory.
        default_mb = max(256, int((total - stress.RESERVED_MEMORY_GB) * 512)) if total else 512
        self._size_mb = tk.IntVar(value=min(default_mb, 4096))
        opts = [256, 512, 1024, 2048, 4096]
        combo = ttk.Combobox(size, textvariable=self._size_mb, values=opts, width=8, state="readonly")
        combo.pack(side="left", padx=8)
        tk.Label(size, text="MB", bg="#0f172a", fg="#e2e8f0").pack(side="left")

        self._bar = ttk.Progressbar(self, maximum=1.0)
        self._bar.pack(fill="x", padx=20, pady=8)
        self._read_var = tk.StringVar(value="Idle")
        tk.Label(self, textvariable=self._read_var, bg="#0f172a", fg="#38bdf8",
                 font=("Consolas", 11), wraplength=560, justify="left").pack(padx=20, pady=6)

        ctl = tk.Frame(self, bg="#0f172a")
        ctl.pack(pady=10)
        self._start_btn = tk.Button(ctl, text="Start", command=self._start, bg="#22c55e",
                                    fg="white", relief="flat", padx=16)
        self._start_btn.pack(side="left", padx=4)
        self._stop_btn = tk.Button(ctl, text="Stop", command=self._stop, bg="#ef4444",
                                   fg="white", relief="flat", padx=16, state="disabled")
        self._stop_btn.pack(side="left", padx=4)
        tk.Button(ctl, text="Close", command=self.close, bg="#334155", fg="white",
                  relief="flat", padx=12).pack(side="left", padx=4)

    def _start(self) -> None:
        if self._running:
            return
        self._token = stress.CancellationToken()
        self._running = True
        self._start_btn.configure(state="disabled")
        self._stop_btn.configure(state="normal")
        target_gb = float(self._size_mb.get()) / 1024.0

        def progress(frac: float, info: dict) -> None:
            self.after(0, lambda: self._update(frac, info))

        def worker():
            self._result = stress.ram_stress_worker(target_gb, self._token, progress)
            self.after(0, self._finish)

        threading.Thread(target=worker, daemon=True).start()

    def _update(self, frac: float, info: dict) -> None:
        self._bar["value"] = frac
        self._read_var.set(f"Allocated: {info.get('allocated_gb', 0)} GB · Verified: {info.get('verified_gb', 0)} GB")

    def _stop(self) -> None:
        self._token.cancel()

    def _finish(self) -> None:
        self._running = False
        self._start_btn.configure(state="normal")
        self._stop_btn.configure(state="disabled")
        outcome = stress.make_ram_outcome(self._result, float(self._size_mb.get()) / 1024.0)
        self._read_var.set(outcome.summary)
        if self.on_result:
            self.on_result(outcome)

    def close(self) -> None:
        self._token.cancel()
        self.destroy()


# --------------------------------------------------------------------------- #
# Fan / cooling observation window
# --------------------------------------------------------------------------- #
class FanStressWindow(tk.Toplevel):
    def __init__(self, master: tk.Misc, on_result: Optional[Callable[[TestOutcome], None]] = None) -> None:
        super().__init__(master)
        self.on_result = on_result
        self.title("Fan & Cooling Test")
        self.geometry("640x460")
        self.configure(bg="#0f172a")
        self._token = stress.CancellationToken()
        self._running = False
        self._build()

    def _build(self) -> None:
        tk.Label(self, text="Fan & Cooling Test", bg="#0f172a", fg="white",
                 font=("Segoe UI", 15, "bold")).pack(pady=(14, 4))
        tk.Label(self,
                 text="Manual max-fan control is Unsupported on Windows (no safe public API — "
                      "never force undocumented EC writes). This runs a 10s cooling observation instead.",
                 bg="#0f172a", fg="#f59e0b", wraplength=560, font=("Segoe UI", 9)).pack(padx=20)

        self._bar = ttk.Progressbar(self, maximum=1.0)
        self._bar.pack(fill="x", padx=20, pady=12)
        self._read_var = tk.StringVar(value="Idle")
        tk.Label(self, textvariable=self._read_var, bg="#0f172a", fg="#38bdf8",
                 font=("Consolas", 11), wraplength=560, justify="left").pack(padx=20, pady=6)

        ctl = tk.Frame(self, bg="#0f172a")
        ctl.pack(pady=10)
        self._start_btn = tk.Button(ctl, text="Run observation (10s)", command=self._start,
                                    bg="#22c55e", fg="white", relief="flat", padx=16)
        self._start_btn.pack(side="left", padx=4)
        self._stop_btn = tk.Button(ctl, text="Stop", command=self._stop, bg="#ef4444",
                                   fg="white", relief="flat", padx=16, state="disabled")
        self._stop_btn.pack(side="left", padx=4)
        tk.Button(ctl, text="Close", command=self.close, bg="#334155", fg="white",
                  relief="flat", padx=12).pack(side="left", padx=4)

    def _start(self) -> None:
        if self._running:
            return
        self._token = stress.CancellationToken()
        self._running = True
        self._start_btn.configure(state="disabled")
        self._stop_btn.configure(state="normal")

        def progress(frac: float, sample: dict) -> None:
            self.after(0, lambda: self._update(frac, sample))

        def worker():
            outcome = stress.run_fan_observation(10.0, self._token, progress)
            self.after(0, lambda: self._finish(outcome))

        threading.Thread(target=worker, daemon=True).start()

    def _update(self, frac: float, sample: dict) -> None:
        self._bar["value"] = frac
        parts = []
        if sample.get("temp") is not None:
            parts.append(f"Temp: {sample['temp']:.1f}°C")
        else:
            parts.append("Temp: unsupported")
        if sample.get("load") is not None:
            parts.append(f"Load: {sample['load']:.0f}%")
        if sample.get("rpm") is not None:
            parts.append(f"RPM: {sample['rpm']:.0f}")
        else:
            parts.append("RPM: unsupported")
        self._read_var.set("  ·  ".join(parts))

    def _stop(self) -> None:
        self._token.cancel()

    def _finish(self, outcome: TestOutcome) -> None:
        self._running = False
        self._start_btn.configure(state="normal")
        self._stop_btn.configure(state="disabled")
        self._read_var.set(outcome.summary)
        if self.on_result:
            self.on_result(outcome)

    def close(self) -> None:
        self._token.cancel()
        self.destroy()


# --------------------------------------------------------------------------- #
# GPU window (probe + bounded render demo)
# --------------------------------------------------------------------------- #
class GpuStressWindow(tk.Toplevel):
    def __init__(self, master: tk.Misc, on_result: Optional[Callable[[TestOutcome], None]] = None) -> None:
        super().__init__(master)
        self.on_result = on_result
        self.title("GPU Stress Test")
        self.geometry("640x440")
        self.configure(bg="#0f172a")
        self._build()

    def _build(self) -> None:
        tk.Label(self, text="GPU Stress Test", bg="#0f172a", fg="white",
                 font=("Segoe UI", 15, "bold")).pack(pady=(14, 4))
        tk.Label(self, text="Identifies the GPU and runs a bounded render demo. "
                           "Live utilisation/temperature need a vendor API (Unsupported here).",
                 bg="#0f172a", fg="#94a3b8", wraplength=560, font=("Segoe UI", 9)).pack(padx=20)

        self._text = tk.Text(self, bg="#0b1220", fg="#e2e8f0", height=10, relief="flat",
                             font=("Consolas", 10))
        self._text.pack(fill="both", expand=True, padx=20, pady=10)

        ctl = tk.Frame(self, bg="#0f172a")
        ctl.pack(pady=8)
        tk.Button(ctl, text="Run GPU probe", command=self._run, bg="#22c55e", fg="white",
                  relief="flat", padx=14).pack(side="left", padx=4)
        tk.Button(ctl, text="Close", command=self.close, bg="#334155", fg="white",
                  relief="flat", padx=12).pack(side="left", padx=4)

    def _run(self) -> None:
        outcome = stress.run_gpu_probe()
        self._text.delete("1.0", "end")
        self._text.insert("end", outcome.summary + "\n\n")
        for r in outcome.readings:
            self._text.insert("end", f"  {r.name}: {r.display()}\n")
        for w in outcome.warnings:
            self._text.insert("end", f"  ! {w}\n")
        if self.on_result:
            self.on_result(outcome)

    def close(self) -> None:
        self.destroy()
