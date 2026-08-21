# Sunrise MDM — Architecture Proposal (PHASE 2)

> Deliverable for Phase 2 of the Asset & Endpoint Management Platform.
> Approved requirements from Phase 1 Q&A are summarized inline; this document is the
> technology and systems architecture proposal. No application code is written until this
> proposal is approved.

## 1. Overview

Sunrise MDM is a multi-tenant, hybrid-hosted **Asset + Endpoint Management + Software
Inventory + Patch Management + Remote Command** platform for macOS and Windows endpoints,
managed by an IT staff of 30+ across 20+ departments, growing from 1,000–5,000 to
5,000–20,000 endpoints in 3 years, with devices in multiple regions and data-residency
requirements.

## 2. Approved Requirements (Phase 1 Summary)

| Area | Decision |
|---|---|
| Scale | 1,000–5,000 now → 5,000–20,000 in 3 years |
| Tenancy | Multi-tenant (MSP model), scoped roles, RLS isolation |
| Hosting | Hybrid, self-managed VPS, multi-region + data residency |
| OS | macOS + Windows, equal priority, system-level agent |
| Agent | Go, WebSocket + heartbeat (60s default, configurable), full offline queue |
| Tracking | All dimensions; location only with consent; login events tracked |
| Software inv. | Installed apps + licenses + usage metering; daily baseline scan + on-demand |
| Commands | Approved command library, risk-gated approval, groups/devices targeting |
| Deployment | Admin-uploaded verified packages; 3 rings; silent w/ notifications |
| Policies | Org→Dept→Group→Device inheritance; report-only non-compliance |
| Identity | OIDC/SAML via Keycloak + MFA; 7 scoped roles |
| Security | mTLS device certs, short tokens, Vault, TLS everywhere, secrets excluded from queue |
| Offline | 3 missed heartbeats = offline; 100 jobs/24h local queue; batch sync |
| Tracking privacy | Location consent flag; 90-day retention; restricted role access |
| Patch Mgmt | Full module per spec: discovery, catalog, rings, policies, maintenance windows, compliance, rollback, audit, API |

## 3. Architecture Principles

1. **Security first** — every boundary authenticated (mTLS for agents), every state change audited, secrets never in transit through the job queue.
2. **Tenant isolation by construction** — `tenant_id` on every row + PostgreSQL Row-Level Security; every query scoped.
3. **Build, don't over-build** — MVP on a single VPS, scaling path documented to 20k+ without rewrites.
4. **Integrate, don't reinvent** — leverage OS vendor update mechanisms (Apple/Microsoft), not our own package mirrors.
5. **Push, not poll** — persistent WebSocket delivers jobs; heartbeat reports liveness.
6. **Offline-first** — agents are peers; the platform degrades gracefully when endpoints disconnect.

## 4. High-Level Architecture

```
                         ┌────────────────────────────────────────────┐
                         │              Admin Portal (Browser)         │
                         │         Next.js UI + Light/Dark theme        │
                         └──────────────────────┬─────────────────────┘
                                                │ HTTPS + SSO
                         ┌──────────────────────▼─────────────────────┐
                         │  Caddy (reverse proxy, TLS termination)     │
                         └───────┬─────────────────────┬───────────────┘
                                 │                     │
                 ┌───────────────▼─────────────┐   ┌───▼──────────────────────┐
                 │  Go Backend API (REST /v1)   │   │  Go Agent Gateway (WS)   │
                 │  auth · devices · assets ·   │   │  mTLS · heartbeat · job  │
                 │  software · policies · jobs  │   │  push · result intake    │
                 │  · patches · reports · audit │   └───────────┬──────────────┘
                 └───────┬─────────────┬───────┘               │ WebSocket (mTLS)
                         │             │                       │
         ┌───────────────▼───┐   ┌─────▼──────────────┐   ┌────▼──────────────────┐
         │    PostgreSQL      │   │      NATS          │   │  Endpoint Agents      │
         │  (RLS, tenant-id)  │   │  jobs · events ·   │   │  (Go, macOS/Windows)  │
         │  + Redis (cache)   │   │  patch workflows   │   │  system service ·     │
         └───────────────────┘   └─────┬──────────────┘   │  local queue · mTLS    │
                                       │                  └────────────────────────┘
                    ┌──────────────────▼──────────────────┐
                    │  Workers (Go)                       │
                    │  job dispatch · inventory ingest ·  │
                    │  compliance eval · patch engine ·   │
                    │  notifications · reports            │
                    └─────────────────────────────────────┘

   Supporting: MinIO (packages), Vault (secrets), Keycloak (identity),
               Prometheus+Grafana (metrics), Loki (logs), ClickHouse (audit/events, optional)
```

**Regional agent gateways** (for data residency): agents connect to the nearest gateway,
which forwards to the central control plane; tenant data is written/read from the region
that owns it.

## 5. Technology Selection

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | **Next.js + React + Tailwind** | Enterprise UI, light/dark, SSR/CSR, WebSocket dashboard |
| Backend | **Go** | Concurrency for 20k heartbeats, single static binaries, fast cold start |
| Agent | **Go** | Cross-compile macOS/Windows, static binary, small footprint |
| Database | **PostgreSQL 16+** | RLS multi-tenancy, JSONB for flexible payloads, mature |
| Cache | **Redis** | Heartbeat state, rate limiting, session cache, ring counters |
| Queue | **NATS JetStream** | Low latency pub/sub, at-least-once, work queues, no heavy broker ops |
| Object storage | **MinIO** (S3-compatible) | Package blobs, agent artifacts, report exports |
| Identity | **Keycloak** (self-hosted) | OIDC/SAML federation (Google/Entra/Okta/LDAP), MFA, group→role mapping |
| Secrets | **HashiCorp Vault** | DB creds, signing keys, enrollment tokens, token encryption keys |
| Proxy | **Caddy** | Auto-TLS, simple config, health-check-aware |
| Metrics | **Prometheus + Grafana** | Standard, self-hostable |
| Logs | **Loki** | Lightweight log aggregation, scales to 20k |
| Events/audit | **PostgreSQL** (audit_logs) + optional **ClickHouse** for high-volume analytics | Searchable audit now; analytics later |
| Containers | **Docker + docker-compose** (dev), Compose/K8s (prod) | Uniform local and cloud deploys |
| CI/CD | **GitHub Actions** | Build agents for 3 OS targets, run tests, sign artifacts |

## 6. Core Components Detail

### 6.1 Go Backend (API)
- REST `/api/v1/*` — admin + agent endpoints, versioned.
- Middleware: tenant resolution → RLS-scoped DB session; RBAC (role + tenant + dept scope);
  MFA-gated high-risk ops; rate limiting; idempotency keys; audit logging on all writes.
- Modular monolith (auth, devices, assets, software, policies, commands, jobs, patches,
  compliance, reports, notifications) — split into microservices only when NATS/workers
  genuinely need it (patch engine, notification fan-out).

### 6.2 Agent Gateway
- Accepts mTLS WebSocket connections, validates device cert, correlates session to device.
- Routes: heartbeat (updates `last_seen`, online state), job acknowledgment, result intake,
  signed job push.
- Falls back to long-poll/HTTP if WebSocket is blocked.

### 6.3 Workers
- **Job dispatcher**: takes approved jobs → NATS per-device/group queues → gateway push.
- **Inventory ingest**: normalize hardware/software/network payloads → DB, evaluate dynamic
  groups + compliance + patch status.
- **Patch engine**: evaluates patch policy/rings/maintenance windows, creates patch jobs,
  tracks results, promotes rings, handles retries/exclusions.
- **Notification & report workers**: fan out emails/Slack/Teams/webhooks; generate scheduled reports.

### 6.4 PostgreSQL + RLS
- Every table carries `tenant_id`; RLS policies enforce `tenant_id = current_setting('app.tenant_id')`.
- Connection pooling via PgBouncer; partitioned tables for `audit_logs`, `events`, `command_results`, `patch_results`.
- Migration tool: golang-migrate (forward-only, reviewed).

### 6.5 Endpoint Agent (Go)
- Runs as launchd daemon / Windows service (SYSTEM).
- Subsystems: connection (mTLS WS), heartbeat, inventory collector, local job queue,
  policy cache, software/patch operations, self-update (signed artifacts, staged), logging.
- Executes only **approved, signed jobs**; never accepts arbitrary commands.
- Verifies package checksums/signatures before install.

### 6.6 Object Storage (MinIO)
- Presigned, time-limited download URLs for packages/agent updates.
- SHA-256 recorded at upload; agent verifies before execution.
- Region-local buckets to satisfy data residency.

## 7. Key Data Flows

### 7.1 Enrollment
```
Admin creates enrollment token (Vault-signed, TTL) → installs agent (pkg/MSI)
Agent generates keypair → POST /enroll with token + CSR
Backend verifies token, signs device cert (internal CA), stores device row
Agent receives cert → establishes mTLS WebSocket → first inventory → device Active
```

### 7.2 Heartbeat + Inventory
```
Agent → WS heartbeat every 60s (configurable) → gateway updates last_seen/online
Daily baseline scan + on-demand scans: agent collects HW/SW/network → batched payload
Workers normalize → DB → dynamic groups & compliance & patch evaluation re-run
Dashboard live-updates via WS
```

### 7.3 Command / Job
```
Admin selects approved command + targets → RBAC check → risk check
High-risk → 2nd admin approval → confirmation (scope preview, device count)
Backend creates job (idempotency key) → NATS → gateway → agent
Agent validates signature + applies local policy → executes (timeout, retry)
Result (exit code, stdout/stderr) → gateway → DB → dashboard + audit
States: Pending → Approved → Queued → Delivered → Running → Completed/Failed/Expired
```

### 7.4 Patch Management (high level)
```
Patch discovery (OS vendor APIs / agent scan) → backend patch catalog
Policy evaluation (severity/ring/maintenance window/approval rules)
Approved + scheduled → patch job → agent downloads from trusted source (vendor or platform),
verifies signature → installs → reboot per policy → re-scan → compliance update
Failure → retry per policy → escalation → admin notification
```

## 8. Multi-Tenancy Model

- `tenants` table; every domain object has `tenant_id`.
- PostgreSQL **Row-Level Security**: `tenant_id = current_setting('app.tenant_id')` applied to
  all tenant-owned tables (devices, assets, groups, policies, jobs, patches, audit).
- Keycloak realms: one realm per tenant or realm-per-platform with client+group scoping
  (chosen at Phase 6); role claims carry `{tenant_id, department_ids}`.
- Super Admin spans tenants; all other roles scoped to tenant + departments.
- Isolation test suite explicitly asserts: cross-tenant API access, cross-tenant commands,
  cross-tenant data reads, cross-tenant job delivery all fail.

## 9. Security Architecture

- TLS everywhere; agents use **mTLS** (device certs signed by platform CA).
- Short-lived session tokens (agents) + short-lived JWTs (admins, 15min idle / 8h absolute).
- Device revocation on unenroll/compromise; cert + token revocation lists.
- Secrets in **Vault**; never transmitted via the job queue; excluded from command payloads.
- Approved command library only; signed jobs; replay protection (nonce + TTL); rate limiting;
  input validation; RBAC + MFA on high-risk ops; full audit trail.
- Package integrity: SHA-256 pinned at upload, digital signature validated on device.
- Agent self-update: staged rings, signed artifacts, checksum-verified.

## 10. Offline Behavior

- Offline at 3 missed heartbeats (~3 min @ 60s).
- Agent keeps local queue (≤100 jobs / ≤24h); older jobs marked `Expired (offline)`.
- Exponential backoff: 30s → 1m → 2m → 5m → 10m → 30m cap.
- Cached policies enforced offline; batched inventory + results synced on reconnect.

## 11. Scaling Path (100 → 20,000+)

| Stage | Endpoints | Shape |
|---|---|---|
| MVP | ≤ 1,000 | Single VPS: Caddy + API + gateway + Postgres + Redis + NATS + MinIO + Keycloak + Vault |
| Growth | 1,000–5,000 | Split workers; PgBouncer; NATS cluster; Prometheus/Grafana/Loki; backups + DR |
| Scale | 5,000–20,000 | Horizontal API/gateway/workers behind LB; regional gateways for data residency; partitioned hot tables; ClickHouse for events |
| Beyond | 20k+ | Per-region control planes, sharded tenants, advanced HA |

No rewrites between stages — only topology changes.

## 12. Deployment

- **Dev**: single `docker-compose.yml` (Postgres, Redis, NATS, MinIO, Vault, Keycloak, API, worker, gateway, web, Caddy).
- **Prod**: Compose or Kubernetes per provider (AWS/GCP/Azure) + on-prem equivalent;
  managed Postgres option; object storage via MinIO or S3/GCS/Azure Blob;
  backups (WAL + snapshot) and DR runbook; TLS via Caddy auto-issuance; health checks on every service.
- **Regions**: per-residency-region gateway + object storage; control plane in one or more regions.

## 13. Open-Source Integration Map (Phase 3 preview)

- **Build**: platform core (as designed).
- **Borrow concepts**: osquery-style inventory tables.
- **Integrate later (optional APIs)**: GLPI (ITAM sync), Wazuh (SIEM telemetry), MeshCentral (remote control), Ansible (platform-internal ops).
- **Vendor update channels**: Apple Software Update/MDM, Windows Update/WUfB, distro repos (Linux, later).

## 14. MVP Scope (Phase 10)

Auth (SSO+MFA) → Dashboard → Device enrollment → Heartbeat → HW/SW inventory →
Device details (8 tabs) → Static/dynamic groups → RBAC (7 roles) → Approved command
library → Job queue + results → Audit logs → Software deployment (3 rings) →
Patch MVP (discovery, policies, maintenance windows, rings, deployment, reboot mgmt,
results, failure handling, audit) → Compliance → Notifications → Reports → API.

## 15. Assumptions, Risks, Improvements

**Assumptions**
- macOS fleet can use Apple Software Update/MDM channels (not our own package mirror).
- Windows updates via Microsoft mechanisms.
- A Keycloak instance can be hosted on the control-plane VPS.
- Email relay (SMTP) available for notifications.

**Risks**
- Multi-tenant isolation defects — mitigated by RLS + explicit isolation test suite.
- macOS/Windows update API drift — mitigated by version-gated capabilities + agent abstraction.
- Data residency legal ambiguity — mitigated by per-region gateways + configurable retention.
- WebSocket blocked on some networks — mitigated by long-poll fallback.
- Vault/Keycloak operational burden on small team — mitigated by compose-based ops docs.

**Improvements (post-MVP)**
- ClickHouse for high-volume analytics; CVE intelligence feeds; third-party app catalog
  (Chrome/Zoom/…) with signature validation; emergency patching; usage metering dashboards;
  remote-control integration (MeshCentral).

## 16. Next Phases

3. Open-source component evaluation map (detail) → 4. Technology selection confirmation →
5. Database/ER design → 6. API spec (OpenAPI) → 7. Security model → 8. Agent architecture →
9. UI wireframes → 10. MVP implementation → 11. Testing → 12. Deployment → 13. Documentation.
