"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface Summary {
  total_devices: number;
  online: number;
  offline: number;
  non_compliant: number;
  windows: number;
  macos: number;
  unknown: number;
  critical_alerts: number;
}

export default function DashboardPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<Summary>("/dashboard/summary")
      .then(setData)
      .catch((e) => setErr(String(e.message || e)));
  }, []);

  if (err) return <p className="err">Failed to load: {err}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const stats: Array<[string, number]> = [
    ["Total devices", data.total_devices],
    ["Online", data.online],
    ["Offline", data.offline],
    ["Non-compliant", data.non_compliant],
    ["Windows", data.windows],
    ["macOS", data.macos],
    ["Unknown", data.unknown],
    ["Critical alerts", data.critical_alerts],
  ];

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Fleet overview</p>

      <div className="stat-grid">
        {stats.map(([label, value]) => (
          <div className="stat" key={label}>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Quick actions</h3>
        <div className="form-row">
          <Link className="btn" href="/devices">
            Browse devices
          </Link>
          <Link className="btn" href="/jobs">
            Run a command
          </Link>
          <Link className="btn" href="/patches">
            Patch management
          </Link>
        </div>
      </div>
    </div>
  );
}
