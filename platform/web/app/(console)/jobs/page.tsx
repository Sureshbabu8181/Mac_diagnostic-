"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Page } from "@/lib/api";

interface Command {
  id: string;
  name: string;
  code: string;
  platform: string;
  risk: string;
  requires_approval: boolean;
}

interface Device {
  id: string;
  hostname: string;
  os: string;
  online: boolean;
}

interface Group {
  id: string;
  name: string;
}

interface JobRow {
  id: string;
  command_id: string | null;
  status: string;
  risk: string;
  requires_approval: boolean;
  created_at: string;
}

function riskBadge(risk: string) {
  const tone = risk === "high" ? "red" : risk === "medium" ? "amber" : "green";
  return <span className={`badge badge-${tone}`}>{risk}</span>;
}

function statusBadge(status: string) {
  const tone =
    status === "completed"
      ? "green"
      : status === "pending"
        ? "amber"
        : status === "failed"
          ? "red"
          : "blue";
  return <span className={`badge badge-${tone}`}>{status}</span>;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [commandId, setCommandId] = useState("");
  const [target, setTarget] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadJobs() {
    try {
      const res = await api<Page<JobRow>>("/jobs?page=1&page_size=50");
      setJobs(res.items);
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const [c, d, g] = await Promise.all([
          api<Page<Command>>("/commands"),
          api<Page<Device>>("/devices?page=1&page_size=100"),
          api<Page<Group>>("/groups"),
        ]);
        setCommands(c.items);
        setDevices(d.items);
        setGroups(g.items);
        await loadJobs();
      } catch (e) {
        setErr(String((e as Error).message || e));
      }
    })();
  }, []);

  async function dispatch(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const isDevice = target.startsWith("device:");
      const isGroup = target.startsWith("group:");
      const body = {
        command_id: commandId,
        targets: {
          device_ids: isDevice ? [target.slice(7)] : [],
          group_ids: isGroup ? [target.slice(6)] : [],
        },
        args: {},
      };
      await api("/jobs", { method: "POST", body: JSON.stringify(body) });
      setMsg("Job dispatched");
      setCommandId("");
      setTarget("");
      loadJobs();
    } catch (e2) {
      setErr(String((e2 as Error).message || e2));
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: string) {
    try {
      await api(`/jobs/${id}/approve`, { method: "POST" });
      loadJobs();
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  }

  return (
    <div>
      <h1 className="page-title">Jobs & Commands</h1>
      <p className="page-subtitle">Dispatch approved commands to devices or groups</p>

      {err && <p className="err">{err}</p>}
      {msg && <p style={{ color: "var(--green)" }}>{msg}</p>}

      <div className="card">
        <h3>Dispatch command</h3>
        <form onSubmit={dispatch}>
          <div className="form-row">
            <select value={commandId} onChange={(e) => setCommandId(e.target.value)} required>
              <option value="">Select command…</option>
              {commands.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code}) · {c.platform} · {c.risk}
                  {c.requires_approval ? " · needs approval" : ""}
                </option>
              ))}
            </select>
            <select value={target} onChange={(e) => setTarget(e.target.value)} required>
              <option value="">Select target…</option>
              <optgroup label="Groups">
                {groups.map((g) => (
                  <option key={g.id} value={`group:${g.id}`}>
                    Group: {g.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Devices">
                {devices.map((d) => (
                  <option key={d.id} value={`device:${d.id}`}>
                    {d.hostname || d.id.slice(0, 8)}
                  </option>
                ))}
              </optgroup>
            </select>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Dispatching…" : "Dispatch"}
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Command</th>
              <th>Risk</th>
              <th>Status</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td className="mono">{j.id.slice(0, 8)}</td>
                <td>{j.command_id ? j.command_id.slice(0, 8) : "—"}</td>
                <td>{riskBadge(j.risk)}</td>
                <td>{statusBadge(j.status)}</td>
                <td className="muted">{new Date(j.created_at).toLocaleString()}</td>
                <td>
                  <Link className="btn btn-sm" href={`/jobs/${j.id}`}>
                    Details
                  </Link>{" "}
                  {j.status === "pending" && j.requires_approval && (
                    <button className="btn btn-sm btn-primary" onClick={() => approve(j.id)}>
                      Approve
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No jobs yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
