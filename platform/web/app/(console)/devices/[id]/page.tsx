"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

interface Device {
  id: string;
  device_uuid: string;
  hostname: string;
  os: string;
  os_version: string | null;
  os_build: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  cpu: string | null;
  ram_mb: number | null;
  storage_mb: number | null;
  gpu: string | null;
  mac_address: string | null;
  ip_address: string | null;
  last_seen: string | null;
  online: boolean;
  status: string;
  encryption_status: string | null;
  agent_version: string | null;
  compliance_score: number | null;
  created_at: string;
}

interface Command {
  id: string;
  name: string;
  code: string;
  platform: string;
  risk: string;
  timeout_seconds: number;
  requires_approval: boolean;
}

interface NetIf {
  iface: string | null;
  ipv4: string | null;
  ipv6: string | null;
  mac: string | null;
  is_primary: boolean;
}

function fmtTime(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleString();
}

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [device, setDevice] = useState<Device | null>(null);
  const [network, setNetwork] = useState<NetIf[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [cmd, setCmd] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [d, c] = await Promise.all([
          api<{ device: Device; network: NetIf[] }>(`/devices/${id}`),
          api<{ items: Command[] }>("/commands"),
        ]);
        setDevice(d.device);
        setNetwork(d.network);
        setCommands(c.items);
      } catch (e) {
        setErr(String((e as Error).message || e));
      }
    })();
  }, [id]);

  async function runCommand() {
    if (!cmd) return;
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      await api("/jobs", {
        method: "POST",
        body: JSON.stringify({
          command_id: cmd,
          targets: { device_ids: [id], group_ids: [] },
          args: {},
        }),
      });
      setMsg("Command dispatched");
      setCmd("");
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }

  if (err && !device) return <p className="err">Failed to load: {err}</p>;
  if (!device) return <p className="muted">Loading…</p>;

  const cells: Array<[string, string]> = [
    ["Hostname", device.hostname || "—"],
    ["OS", `${device.os || ""} ${device.os_version || ""} (${device.os_build || ""})`],
    ["Manufacturer", device.manufacturer || "—"],
    ["Model", device.model || "—"],
    ["Serial number", device.serial_number || "—"],
    ["CPU", device.cpu || "—"],
    ["RAM", device.ram_mb != null ? `${Math.round(device.ram_mb / 1024)} GB` : "—"],
    ["GPU", device.gpu || "—"],
    ["MAC", device.mac_address || "—"],
    ["IP address", device.ip_address || "—"],
    ["Encryption", device.encryption_status || "—"],
    ["Agent version", device.agent_version || "—"],
    ["Compliance", device.compliance_score != null ? `${device.compliance_score}%` : "—"],
    ["Registered", fmtTime(device.created_at)],
    ["Last seen", fmtTime(device.last_seen)],
  ];

  return (
    <div>
      <Link href="/devices" className="muted" style={{ fontSize: 13 }}>
        ← Back to devices
      </Link>
      <h1 className="page-title" style={{ marginTop: 8 }}>
        {device.hostname || device.id}
      </h1>
      <p className="page-subtitle">
        {device.online ? (
          <span className="badge badge-green">online</span>
        ) : (
          <span className="badge badge-amber">offline</span>
        )}{" "}
        <span className="muted mono">{device.device_uuid}</span>
      </p>

      {err && <p className="err">{err}</p>}

      <h3 className="muted" style={{ textTransform: "uppercase", fontSize: 12 }}>
        Hardware & identity
      </h3>
      <div className="detail-grid">
        {cells.map(([k, v]) => (
          <div className="cell" key={k}>
            <div className="k">{k}</div>
            <div className="v">{v}</div>
          </div>
        ))}
      </div>

      <h3 className="muted" style={{ textTransform: "uppercase", fontSize: 12 }}>
        Network
      </h3>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Interface</th>
              <th>IPv4</th>
              <th>IPv6</th>
              <th>MAC</th>
              <th>Primary</th>
            </tr>
          </thead>
          <tbody>
            {network.map((n, i) => (
              <tr key={i}>
                <td className="mono">{n.iface || "—"}</td>
                <td className="mono">{n.ipv4 || "—"}</td>
                <td className="mono">{n.ipv6 || "—"}</td>
                <td className="mono">{n.mac || "—"}</td>
                <td>{n.is_primary ? "✓" : ""}</td>
              </tr>
            ))}
            {network.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No network data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Run command</h3>
        <div className="form-row">
          <select value={cmd} onChange={(e) => setCmd(e.target.value)}>
            <option value="">Select command…</option>
            {commands.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code}) · {c.risk}
                {c.requires_approval ? " · needs approval" : ""}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={runCommand} disabled={busy || !cmd}>
            {busy ? "Dispatching…" : "Dispatch"}
          </button>
        </div>
        {msg && <p style={{ color: "var(--green)" }}>{msg}</p>}
      </div>
    </div>
  );
}
