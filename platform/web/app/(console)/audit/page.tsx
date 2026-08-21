"use client";

import { useEffect, useState } from "react";
import { api, type Page } from "@/lib/api";

interface AuditRow {
  id: string;
  user_id: string | null;
  device_id: string | null;
  actor_type: string;
  action: string;
  resource_type: string;
  resource_id: string;
  ip: string;
  occurred_at: string;
}

function actorBadge(t: string) {
  return t === "agent" ? (
    <span className="badge badge-blue">agent</span>
  ) : (
    <span className="badge badge-green">admin</span>
  );
}

export default function AuditPage() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [action, setAction] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    try {
      const q = new URLSearchParams({ page: "1", page_size: "100" });
      if (action) q.set("action", action);
      const res = await api<Page<AuditRow>>(`/audit-logs?${q.toString()}`);
      setItems(res.items);
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1 className="page-title">Audit Logs</h1>
      <p className="page-subtitle">Immutable trail of administrative and agent actions</p>

      <div className="toolbar">
        <input
          type="text"
          placeholder="Filter by action…"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
        <button className="btn btn-primary" onClick={load}>
          Apply
        </button>
      </div>

      {err && <p className="err">{err}</p>}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Resource</th>
              <th>User</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <td className="muted">{new Date(a.occurred_at).toLocaleString()}</td>
                <td>{actorBadge(a.actor_type)}</td>
                <td className="mono">{a.action}</td>
                <td className="muted">
                  {a.resource_type}
                  {a.resource_id ? ` / ${a.resource_id.slice(0, 8)}` : ""}
                </td>
                <td className="mono">{a.user_id ? a.user_id.slice(0, 8) : "—"}</td>
                <td className="mono">{a.ip || "—"}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No audit events
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
