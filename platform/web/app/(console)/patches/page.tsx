"use client";

import { useEffect, useState } from "react";
import { api, type Page } from "@/lib/api";

interface Compliance {
  total_devices: number;
  patched: number;
  missing: number;
  patch_failures: number;
  reboot_pending: number;
  compliance_pct: number;
}

interface Patch {
  id: string;
  source: string;
  title: string;
  severity: string;
  category: string;
  kb_number: string | null;
  release_date: string | null;
  target_os: string | null;
  reboot_required: boolean;
  status: string;
  risk_score: number | null;
}

function sevBadge(s: string) {
  const tone = s === "critical" ? "red" : s === "high" ? "amber" : "blue";
  return <span className={`badge badge-${tone}`}>{s}</span>;
}

function statusBadge(s: string) {
  const tone =
    s === "approved"
      ? "green"
      : s === "scheduled"
        ? "blue"
        : s === "failed"
          ? "red"
          : "slate";
  return <span className={`badge badge-${tone}`}>{s}</span>;
}

export default function PatchesPage() {
  const [compliance, setCompliance] = useState<Compliance | null>(null);
  const [patches, setPatches] = useState<Patch[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    try {
      const [c, p] = await Promise.all([
        api<Compliance>("/patch-compliance"),
        api<Page<Patch>>("/patches?page=1&page_size=50"),
      ]);
      setCompliance(c);
      setPatches(p.items);
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function approve(id: string) {
    setErr("");
    setMsg("");
    try {
      await api(`/patches/${id}/approve`, { method: "POST" });
      setMsg("Patch approved");
      load();
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  }

  async function deploy(id: string) {
    setErr("");
    setMsg("");
    try {
      const res = await api<{ deployment_id: string; device_count: number }>(
        `/patches/${id}/deploy`,
        { method: "POST", body: JSON.stringify({ ring: "pilot", target_type: "all" }) },
      );
      setMsg(`Deployment ${res.deployment_id} scheduled for ${res.device_count} devices`);
      load();
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  }

  return (
    <div>
      <h1 className="page-title">Patch Management</h1>
      <p className="page-subtitle">Discover, approve, and deploy OS patches</p>

      {err && <p className="err">{err}</p>}
      {msg && <p style={{ color: "var(--green)" }}>{msg}</p>}

      {compliance && (
        <div className="stat-grid">
          <div className="stat">
            <div className="label">Compliance</div>
            <div className="value">{compliance.compliance_pct}%</div>
          </div>
          <div className="stat">
            <div className="label">Total devices</div>
            <div className="value">{compliance.total_devices}</div>
          </div>
          <div className="stat">
            <div className="label">Patched</div>
            <div className="value">{compliance.patched}</div>
          </div>
          <div className="stat">
            <div className="label">Missing</div>
            <div className="value">{compliance.missing}</div>
          </div>
          <div className="stat">
            <div className="label">Reboots pending</div>
            <div className="value">{compliance.reboot_pending}</div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Source</th>
              <th>Severity</th>
              <th>Category</th>
              <th>KB</th>
              <th>Reboot</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {patches.map((p) => (
              <tr key={p.id}>
                <td>{p.title}</td>
                <td className="muted">{p.source}</td>
                <td>{sevBadge(p.severity)}</td>
                <td className="muted">{p.category}</td>
                <td className="mono">{p.kb_number || "—"}</td>
                <td>{p.reboot_required ? "✓" : ""}</td>
                <td>{statusBadge(p.status)}</td>
                <td>
                  {(p.status === "discovered" || p.status === "failed") && (
                    <button className="btn btn-sm btn-primary" onClick={() => approve(p.id)}>
                      Approve
                    </button>
                  )}{" "}
                  {p.status === "approved" && (
                    <button className="btn btn-sm" onClick={() => deploy(p.id)}>
                      Deploy
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {patches.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  No patches discovered yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
