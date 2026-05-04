import { clsx } from "clsx";
import type { ReactNode } from "react";

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "amber" | "red" | "blue" | "violet" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    red: "bg-rose-50 text-rose-700 ring-rose-200",
    blue: "bg-sky-50 text-sky-700 ring-sky-200",
    violet: "bg-violet-50 text-violet-700 ring-violet-200",
  };
  return <span className={clsx("inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1", tones[tone])}>{children}</span>;
}

export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function StatCard({ label, value, meta, tone = "slate" }: { label: string; value: string | number; meta?: string; tone?: "slate" | "green" | "amber" | "red" | "blue" }) {
  const accents = {
    slate: "border-slate-200",
    green: "border-emerald-300",
    amber: "border-amber-300",
    red: "border-rose-300",
    blue: "border-sky-300",
  };
  return (
    <div className={clsx("rounded-lg border-l-4 bg-white p-4 shadow-sm ring-1 ring-slate-200", accents[tone])}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      {meta ? <p className="mt-1 text-sm text-slate-500">{meta}</p> : null}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center">
      <p className="font-medium text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{body}</p>
    </div>
  );
}
