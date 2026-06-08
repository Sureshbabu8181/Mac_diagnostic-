"use client";

import { FormEvent, useState } from "react";
import { BedDouble, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

const demoAccounts = [
  ["admin@sunrisepg.test", "Super Admin"],
  ["owner@sunrisepg.test", "Owner"],
  ["accounts@sunrisepg.test", "Accountant"],
  ["care@sunrisepg.test", "Caretaker"],
  ["resident@sunrisepg.test", "Resident"],
] as const;

export default function LoginPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({ email: "admin@sunrisepg.test", password: "Demo@12345" });

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setToast(null);
    try {
      await apiPost<{ id: string }>("/api/auth/login", form);
      router.replace("/dashboard");
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Login failed." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 flex-col justify-between bg-[#0f172a] bg-[radial-gradient(ellipse_at_top_left,#1e293b,transparent_70%),radial-gradient(ellipse_at_bottom_right,#0f766e,transparent_60%)] p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 backdrop-blur">
            <BedDouble size={22} className="text-emerald-300" />
          </div>
          <div>
            <p className="text-sm font-semibold">Sunrise PG</p>
            <p className="text-xs text-white/50">Management System</p>
          </div>
        </div>
        <div className="space-y-4">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            Welcome back
          </h1>
          <p className="max-w-md text-base leading-relaxed text-white/60">
            Manage your PG or hostel operations — rooms, residents, billing, maintenance, and more from a single dashboard.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            {["Room Management", "Billing", "Complaints", "Inventory", "Reports"].map((item) => (
              <span key={item} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/50 backdrop-blur">
                {item}
              </span>
            ))}
          </div>
        </div>
        <p className="text-xs text-white/30">&copy; {new Date().getFullYear()} Sunrise PG. All rights reserved.</p>
      </div>

      <div className="flex w-full items-center justify-center px-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0f172a]">
              <BedDouble size={24} className="text-emerald-300" />
            </div>
            <h1 className="text-xl font-bold text-slate-950">Sunrise PG</h1>
            <p className="text-sm text-slate-500">Sign in to your account</p>
          </div>

          <div className="hidden lg:mb-8 lg:block">
            <h2 className="text-xl font-semibold text-slate-950">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500">Choose a demo account or enter credentials</p>
          </div>

          {toast ? (
            <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${toast.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
              {toast.text}
            </div>
          ) : null}

          <form className="space-y-5" onSubmit={handleLogin}>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Quick select</label>
              <div className="grid grid-cols-2 gap-2">
                {demoAccounts.map(([email, label]) => (
                  <button
                    className={`rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition ${form.email === email ? "border-slate-950 bg-slate-950 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`}
                    key={email}
                    type="button"
                    onClick={() => setForm({ email, password: "Demo@12345" })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="email">Email</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="password">Password</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>

            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              disabled={saving}
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
              Sign in
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            Demo password for all accounts: <span className="font-mono text-slate-500">Demo@12345</span>
          </p>
        </div>
      </div>
    </div>
  );
}

async function apiPost<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload.data as T;
}
