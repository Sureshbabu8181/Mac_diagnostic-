"use client";

import { useEffect, useState } from "react";
import { api, type Page } from "@/lib/api";

interface Group {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  parent_id: string | null;
  is_system: boolean;
  created_at: string;
}

export default function GroupsPage() {
  const [items, setItems] = useState<Group[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState("static");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    try {
      const res = await api<Page<Group>>("/groups");
      setItems(res.items);
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      await api("/groups", {
        method: "POST",
        body: JSON.stringify({ name, description, kind }),
      });
      setMsg("Group created");
      setName("");
      setDescription("");
      load();
    } catch (err2) {
      setErr(String((err2 as Error).message || err2));
    }
  }

  return (
    <div>
      <h1 className="page-title">Groups</h1>
      <p className="page-subtitle">Device grouping for targeting commands</p>

      {err && <p className="err">{err}</p>}
      {msg && <p style={{ color: "var(--green)" }}>{msg}</p>}

      <div className="card">
        <h3>Create group</h3>
        <form onSubmit={create}>
          <div className="form-row">
            <input
              type="text"
              placeholder="Group name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              type="text"
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="static">Static</option>
              <option value="dynamic">Dynamic</option>
            </select>
            <button type="submit" className="btn btn-primary">
              Create
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Kind</th>
              <th>Description</th>
              <th>System</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {items.map((g) => (
              <tr key={g.id}>
                <td>{g.name}</td>
                <td>
                  <span className={`badge badge-${g.kind === "dynamic" ? "blue" : "slate"}`}>
                    {g.kind}
                  </span>
                </td>
                <td className="muted">{g.description || "—"}</td>
                <td>{g.is_system ? "✓" : ""}</td>
                <td className="muted">{new Date(g.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No groups yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
