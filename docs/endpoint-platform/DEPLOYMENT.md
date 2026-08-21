# Deployment Guide — Sunrise MDM

Phase 12. Target topology: **hybrid-hosted, self-managed VPS**, multi-region with data
residency, no formal SLA. This document is the operational companion to `ARCHITECTURE.md`
and `SECURITY.md`.

## 1. Production Topology

```
                         Internet
                            │ 443
                       [ Caddy ]        TLS termination (LE), reverse proxy
                     ┌─────┼───────────────┐
                443/3000│           8080/api│         wss 8090
                   [ web ]            [ api ]        [ gateway ×N ]   WebSocket (agents)
                     └─────┬───────────────┘             │
                           │                             │
                [ Redis ] [ NATS JetStream ]   [ MinIO ] packages/large blobs
                           │
                [ Postgres 16 + RLS ]   (per region, data residency)
                           │
               [ worker ] (offline detection, job rollup, ring scheduling)
                           │
        [ Prometheus ] [ Grafana ] [ Loki ]   monitoring/logging (per region)
```

- **API** (`:8080`) — REST control plane for the web console + agents (enroll/heartbeat).
- **Gateway** (`:8090`) — WebSocket endpoint agents connect to for job push. Scale out
  horizontally behind the Caddy LB; agents keep one long-lived connection.
- **Worker** — offline rollup, scheduled jobs, patch ring promotion. Run ≥2 for HA.
- **Web** (`:3000`) — Next.js console; BFF proxy forwards to the API (`GO_API_URL`).
- State stores: Postgres (source of truth), Redis (cache/pub-sub), NATS JetStream (job
  queue, exactly-once delivery semantics), MinIO (package blobs, log collection).

## 2. Host Requirements (per region)

| Service | CPU | RAM | Disk |
|---------|-----|-----|------|
| Postgres | 4 vCPU | 8 GB | 100 GB NVMe + WAL archive volume |
| API/Gateway/Worker/Web | 8 vCPU | 16 GB | 40 GB |
| Redis/NATS/MinIO | 2 vCPU | 4 GB | 100 GB (MinIO grows with packages) |

Baseline: one 5k-endpoint region fits comfortably on a single 8 vCPU / 32 GB VPS; split
Postgres onto its own host when pushing past ~2k concurrent agents. Multi-tenant MSP scale
(20k) = 2–3 gateways + 2 workers + dedicated Postgres.

## 3. Deploying the Stack

### 3.1 Prerequisites

- Docker 24+ with Compose v2, or native binaries built via `platform/server`/`platform/web`.
- A domain with A records to each region's public IP (e.g. `mdm.region1.example.com`).
- Postgres 16, Redis 7, NATS 2.10+ (`-js`), MinIO (or S3-compatible), and a Vault instance.

### 3.2 Environment (production values)

Start from `platform/.env.example`; **change every placeholder**:

```bash
POSTGRES_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 64)        # 15-min admin tokens; 8h refresh
MINIO_SECRET_KEY=$(openssl rand -hex 32)
VAULT_TOKEN=$(vault token create -policy=admin -format=json | jq -r .auth.client_token)
```

Never commit `.env`. Fetch `JWT_SECRET`/DB credentials at runtime from Vault (the worker
and API both support `VAULT_ADDR`/`VAULT_TOKEN`; wire the API to resolve secrets rather
than keeping them in the environment for prod). SMTP creds only where notifications are
enabled.

### 3.3 Compose deployment

```bash
cd platform
cp .env.example .env            # then edit secrets (above)
docker compose build
docker compose up -d postgres redis nats minio
docker compose up -d api worker gateway web caddy prometheus grafana loki
docker compose exec api /app/server seed-admin <first-admin> <temp-password>
```

Migrations 001–008 auto-apply on first API start (idempotent, see §6).

### 3.4 Caddy (TLS)

`infra/caddy/Caddyfile` terminates TLS automatically via Let's Encrypt. Verify with
`docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile`. First run issues
certificates — allow ~1 min before health checks pass.

## 4. Backups & Restore

### 4.1 Postgres

```bash
# Weekly full + daily incremental via WAL archiving
pg_dump -U sunrise -h <host> -Fc sunrise > sunrise_$(date +%F).dump
# Continuous WAL archiving: set archive_mode=on + archive_command to your object store;
# restore with PITR (recovery_target_time) — see DATABASE.md.
```

Restore a full dump:

```bash
createdb -U sunrise -h <host> sunrise_restore
pg_restore -U sunrise -h <host> -d sunrise_restore sunrise_2026-01-01.dump
```

RLS policies are defined in migrations, so restoring into a fresh DB re-applies them.

### 4.2 MinIO / blobs

Use `mc mirror` to a second region or external S3 for the `packages` bucket. Losing MinIO
loses package blobs only — device/inventory data lives in Postgres.

### 4.3 Redis / NATS

Redis is a cache; NATS streams (job queue) should be mirrored to a second JetStream server
(`-cluster`/stream replicas=2) so pending jobs survive a node loss.

## 5. Scaling, Multi-Region & Data Residency

- **Data residency**: run a full stack per region; agents' enrollment tokens pin them to
  their home region (`region` field on the device + RLS). Cross-region admin visibility is
  read-only by default.
- **Agents**: heartbeat every 60s. A region's gateway tier must sustain
  `#agents / 60s` connects/s. Add gateways behind the LB and enable sticky-less WSS (the
  agent reconnects on demand, so no session affinity is required).
- **Job queue**: NATS JetStream handles the 10-min/3-retry command semantics; scale
  consumers by running more workers (idempotent consumers via durable queues).
- **Read scaling**: point reporting/Grafana queries at a Postgres read replica
  (`-config.read_replica_url`).

## 6. Migrations

Auto-applied at API startup, ordered 001→008, idempotent. Partitioned tables
(`audit_logs`, `patch_results`) use composite PKs `(id, occurred_at|captured_at)` — keep
this constraint in any hand-written SQL. For major changes, run in maintenance window:
stop `worker`, apply `psql -f migrations/00X_*.sql`, restart.

## 7. Monitoring & Runbook

- **Health**: `GET /api/v1/health` (API, used by compose healthchecks). Gateway: `:8090/healthz`.
- **Metrics**: Prometheus scrapes API/gateway/worker (`/metrics`); Grafana dashboards for
  agent online count, WS connections, job queue depth, heartbeat latency.
- **Logs**: Loki aggregates `stderr` from all services; alert on error-level lines.
- **Common issues**:
  - **Agent shows offline**: check gateway is up, NATS JetStream alive, and the worker is
    running (it flips `online:false` after 3 missed heartbeats).
  - **Job stuck queued**: confirm a worker is consuming the NATS stream and Redis is
    reachable.
  - **TLS failures**: validate Caddy config and that ports 80/443 are reachable.
  - **RLS leakage suspicions**: run the audit report query; `tenant_id` must always be in
    the WHERE clause — test with a cross-tenant device id (expect 403/404, never data).

## 8. Security Hardening Checklist (pre-go-live)

- [ ] `JWT_SECRET` rotated and stored in Vault (not `.env` in prod).
- [ ] mTLS device certificates enabled on gateway (`SECURITY.md` §agent transport).
- [ ] Postgres not exposed publicly; only the API/gateway/worker reach it.
- [ ] Caddy behind a firewall that allows only 80/443.
- [ ] MinIO console disabled or IP-allow-listed; bucket not public.
- [ ] First admin password changed immediately; RBAC roles reviewed for least privilege.
- [ ] Secrets excluded from the command queue payloads (audited in `jobs.go`).
- [ ] `audit_logs`/`patch_results` retention windows set (location 90 days per policy).
