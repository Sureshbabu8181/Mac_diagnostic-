# Sunrise MDM — API Specification (PHASE 6)

REST API under `/api/v1`. A machine-readable OpenAPI 3.0 document (`openapi.yaml`) is
generated from the Go handlers at implementation time and committed to the repo.

## 1. Conventions

- **Versioning**: `/api/v1`. Breaking changes → `/api/v2` (never mutate v1).
- **Auth**: `Authorization: Bearer <JWT>` for admins; device certs / short-lived agent tokens for agent endpoints. API keys via `X-API-Key`.
- **Pagination**: `?page=1&page_size=50` (max 200). Response meta: `{items, page, page_size, total}`.
- **Filtering**: `?filter[status]=active&filter[os]=windows&filter[tenant_id]=<id>` (tenant override only for Super Admin).
- **Sorting**: `?sort=hostname&sort_order=asc|desc`.
- **Rate limiting**: per-token/IP sliding window (default 300 req/min admin, 600 req/min agent gateway); headers `X-RateLimit-Limit/Remaining/Reset`. 429 on exceed.
- **Idempotency**: `Idempotency-Key` header on POST/PUT; duplicate key within 24h returns original response.
- **Standard errors**:
```json
{ "error": { "code": "validation_error", "message": "...", "field_errors": [{"field":"hostname","message":"required"}], "request_id": "..." } }
```
  Codes: `validation_error`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `rate_limited`, `quota_exceeded`, `internal_error`.
- **Audit**: every mutating endpoint writes `audit_logs`.

## 2. Admin Endpoints

### Auth
- `POST /api/v1/auth/login` → OIDC redirect / Keycloak
- `GET /api/v1/auth/callback`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`

### Devices
- `GET /api/v1/devices` (filter/sort/paginate)
- `GET /api/v1/devices/{id}` — full record + network + compliance summary
- `PATCH /api/v1/devices/{id}` — hostname, department, assigned user, tags, notes
- `DELETE /api/v1/devices/{id}` — decommission (soft delete + revoke tokens)
- `POST /api/v1/devices/{id}/commands` — run approved command (→ job)
- `GET /api/v1/devices/{id}/software`, `/network`, `/compliance`, `/jobs`, `/timeline`, `/audit`

### Assets
- `GET/POST /api/v1/assets`, `GET/PATCH/DELETE /api/v1/assets/{id}`
- `POST /api/v1/assets/{id}/transitions` — lifecycle state change (validates state machine, writes history)
- `GET /api/v1/assets/{id}/history`

### Users
- `GET/POST /api/v1/users`, `GET/PATCH/DELETE /api/v1/users/{id}`
- `POST /api/v1/users/{id}/roles` — assign scoped role (tenant + departments)

### Groups
- `GET/POST /api/v1/groups`, `GET/PATCH/DELETE /api/v1/groups/{id}`
- `POST /api/v1/groups/{id}/rules` — dynamic rules
- `POST /api/v1/groups/{id}/members`, `DELETE /api/v1/groups/{id}/members/{deviceId}`

### Software
- `GET /api/v1/software`, `GET /api/v1/software/{id}/devices`
- `GET /api/v1/software/outdated`, `GET /api/v1/software/unapproved`
- `GET/POST/PATCH /api/v1/packages`, `GET /api/v1/packages/{id}/download` (presigned)

### Policies
- `GET/POST /api/v1/policies`, `GET/PATCH/DELETE /api/v1/policies/{id}`
- `POST /api/v1/policies/{id}/assignments` — org/dept/group/device with inheritance

### Commands & Jobs
- `GET /api/v1/commands` — approved command library
- `POST /api/v1/jobs` — create command/software deployment job (targets: devices, groups, dynamic)
- `POST /api/v1/jobs/{id}/approve` / `reject` (2nd-admin for high risk)
- `GET /api/v1/jobs`, `GET /api/v1/jobs/{id}`, `POST /api/v1/jobs/{id}/cancel`
- `GET /api/v1/jobs/{id}/results`, `GET /api/v1/command-results`

### Compliance
- `GET /api/v1/compliance/summary` — overall/critical/high etc.
- `GET /api/v1/compliance/devices` — per-device breakdown
- `GET /api/v1/compliance/policies/{id}`

### Reports
- `GET /api/v1/reports/{type}` — asset/software/os/compliance/patches/… with `?format=csv|pdf|json`
- `POST /api/v1/reports/schedules` — daily/weekly/monthly + delivery channels

### Audit & Notifications
- `GET /api/v1/audit-logs` (filter actor/action/resource/date-range, paginate)
- `GET /api/v1/notifications`, `POST /api/v1/notifications/channels` (email/slack/teams/webhook)

### Patches (see PATCH-MANAGEMENT.md for full detail)
- `GET /api/v1/patches`, `GET /api/v1/devices/{id}/patches`, `GET /api/v1/patches/missing`, `GET /api/v1/patches/critical`
- `POST /api/v1/patches/{id}/approve|reject|deploy|pause|resume|cancel`
- `GET /api/v1/patch-jobs`, `GET /api/v1/patch-compliance`
- `POST /api/v1/patch-exclusions`, `GET /api/v1/patch-exclusions`
- `GET /api/v1/patch-policies`, `GET/POST /api/v1/maintenance-windows`

### Admin (Super Admin)
- `GET/POST /api/v1/admin/organizations`, `GET/POST /api/v1/admin/roles`, `GET/POST /api/v1/admin/permissions`
- `GET /api/v1/admin/tenants/{id}/isolation-audit`

## 3. Agent Endpoints (mTLS / short-lived agent tokens)

- `POST /api/v1/agent/enroll` — one-time token + CSR → device cert
- `POST /api/v1/agent/heartbeat` — liveness + online state
- `POST /api/v1/agent/inventory` — batched HW/SW/network payload
- `GET /api/v1/agent/jobs` — job poll (WS push preferred; HTTP fallback)
- `POST /api/v1/agent/jobs/{jobId}/ack` / `result` — ack, result submission (exit code, stdout/stderr)
- `POST /api/v1/agent/events` — login/logout, location (consent-gated), usage metering
- `GET /api/v1/agent/update` — check for staged agent update
- `GET /api/v1/agent/packages/{fileKey}` — signed package download (presigned, SHA-256 enforced)

## 4. Idempotency & Race Handling
- Job creation is idempotent via `Idempotency-Key`; duplicate target selection collapses.
- Result submission is idempotent by `(job_target_id, attempt)`; last-write-wins with version check.
- State transitions validated server-side (jobs/patch/deployment state machines) — optimistic concurrency via `updated_at`/row version.

## 5. WebSocket (dashboard + agent gateway)
- Admin dashboard: `WSS /api/v1/ws/dashboard` — live counters, job status, compliance changes (RBAC-scoped).
- Agent gateway: `WSS /api/v1/ws/agent` — mTLS, heartbeat + job push; HTTP long-poll fallback when WS blocked.
