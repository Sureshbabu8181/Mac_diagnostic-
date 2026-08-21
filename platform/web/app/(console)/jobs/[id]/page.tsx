"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

interface JobResult {
  device_id: string;
  status: string;
  exit_code: number | null;
  stdout: string | null;
  stderr: string | null;
  attempt: number | null;
  collected_at: string | null;
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Record<string, unknown> | null>(null);
  const [results, setResults] = useState<JobResult[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<{ job: Record<string, unknown>; results: JobResult[] }>(`/jobs/${id}`)
      .then((d) => {
        setJob(d.job);
        setResults(d.results);
      })
      .catch((e) => setErr(String((e as Error).message || e)));
  }, [id]);

  if (err) return <p className="err">Failed to load: {err}</p>;
  if (!job) return <p className="muted">Loading…</p>;

  return (
    <div>
      <Link href="/jobs" className="muted" style={{ fontSize: 13 }}>
        ← Back to jobs
      </Link>
      <h1 className="page-title" style={{ marginTop: 8 }}>
        Job {String(job.id || "").slice(0, 8)}
      </h1>
      <p className="page-subtitle">
        Status: <b>{String(job.status || "")}</b> · Risk: <b>{String(job.risk || "")}</b>
      </p>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Device</th>
              <th>Status</th>
              <th>Exit code</th>
              <th>Attempt</th>
              <th>Collected</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i}>
                <td className="mono">{r.device_id.slice(0, 8)}</td>
                <td>
                  <span
                    className={`badge badge-${
                      r.status === "completed"
                        ? "green"
                        : r.status === "failed"
                          ? "red"
                          : "amber"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="mono">{r.exit_code ?? "—"}</td>
                <td>{r.attempt ?? "—"}</td>
                <td className="muted">
                  {r.collected_at ? new Date(r.collected_at).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
            {results.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No results yet — job is queued or awaiting an agent
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {results
        .filter((r) => r.stdout || r.stderr)
        .map((r, i) => (
          <div className="card" key={`out-${i}`}>
            <h3>Output · {r.device_id.slice(0, 8)}</h3>
            {r.stdout ? (
              <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>
                {r.stdout}
              </pre>
            ) : null}
            {r.stderr ? (
              <pre className="mono" style={{ whiteSpace: "pre-wrap", color: "var(--red)" }}>
                {r.stderr}
              </pre>
            ) : null}
          </div>
        ))}
    </div>
  );
}
