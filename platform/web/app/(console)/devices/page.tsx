"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Page } from "@/lib/api";

interface Device {
  id: string;
  hostname: string;
  os: string;
  os_version: string | null;
  online: boolean;
  status: string;
  serial_number: string | null;
  ip_address: string | null;
  model: string | null;
  last_seen: string | null;
  compliance_score: number | null;
}

function osBadge(os: string) {
  const lower = (os || "").toLowerCase();
  if (lower === "windows") return <span className="badge badge-blue">{os}</span>;
  if (lower === "macos") return <span className="badge badge-slate">{os}</span>;
  return <span className="badge badge-slate">{os || "unknown"}</span>;
}

export default function DevicesPage() {
  const [items, setItems] = useState<Device[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [os, setOs] = useState("");
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    try {
      const q = new URLSearchParams({ page: "1", page_size: "100" });
      if (search) q.set("search", search);
      if (os) q.set("os", os);
      if (status) q.set("status", status);
      const res = await api<Page<Device>>(`/devices?${q.toString()}`);
      setItems(res.items);
      setTotal(res.total);
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
      <h1 className="page-title">Devices</h1>
      <p className="page-subtitle">{total} managed endpoints</p>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search hostname or serial…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={os} onChange={(e) => setOs(e.target.value)}>
          <option value="">All OS</option>
          <option value="windows">Windows</option>
          <option value="macos">macOS</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="unknown">Unknown</option>
        </select>
        <button className="btn btn-primary" onClick={load}>
          Apply
        </button>
      </div>

      {err && <p className="err">{err}</p>}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Hostname</th>
              <th>OS</th>
              <th>Model</th>
              <th>Serial</th>
              <th>IP</th>
              <th>Status</th>
              <th>Compliance</th>
            </tr>
          </thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link href={`/devices/${d.id}`}>
                    {d.hostname || d.id.slice(0, 8)}
                  </Link>
                </td>
                <td>
                  {osBadge(d.os)}
                  {d.os_version ? <span className="muted"> {d.os_version}</span> : null}
                </td>
                <td className="muted">{d.model || "—"}</td>
                <td className="muted mono">{d.serial_number || "—"}</td>
                <td className="muted mono">{d.ip_address || "—"}</td>
                <td>
                  {d.online ? (
                    <span className="badge badge-green">online</span>
                  ) : (
                    <span className="badge badge-amber">offline</span>
                  )}
                </td>
                <td>{d.compliance_score != null ? `${d.compliance_score}%` : "—"}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No devices found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
