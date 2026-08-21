# Testing Guide — Sunrise MDM

Phase 11. How each layer of the platform is verified today, and the roadmap for automated
quality gates. This is the companion to `ARCHITECTURE.md` and `API.md`.

## 1. Testing Tiers

| Tier | Scope | Where | Runs today? |
|------|-------|-------|-------------|
| **T1 – Go unit** | Pure logic: JWT sign/parse, RBAC matrix, pagination, perm middleware, agent WS URL derivation, command mapping | `server/internal/*_test.go`, `agent/internal/**/*_test.go` | ✅ `go test ./...` |
| **T2 – API integration** | HTTP handlers against Postgres (RLS on), real Redis/NATS | `server/internal/api` + smoke script | ⚠️ manual via `/tmp/sunrise-e2e.sh` |
| **T3 – Agent live** | Enroll → heartbeat → inventory → WS job push → result | real macOS host | ✅ performed during Phase 10 |
| **T4 – Web** | Lint, typecheck, production build | `platform/web` | ✅ `npm run lint`, `npm run build` |
| **T5 – E2E smoke** | Full vertical slice across all services | shell script | ⚠️ manual, documented below |

## 2. Running the Tests

### 2.1 Go unit tests (server + agent)

```bash
# Go toolchain is Homebrew-installed — prefix every go invocation:
export PATH="/usr/local/opt/go/bin:$PATH"

cd platform/server && go test ./...          # auth, httpx, api perm middleware, …
cd platform/agent && go test ./...           # wsBase derivation, command mapping, …
```

Coverage: `go test -cover ./...`.

Test files added in Phase 11:

- `server/internal/auth/auth_test.go` — JWT round-trip, wrong secret, tampering, expiry,
  alg allow-list, full RBAC role→permission matrix (Super Admin wildcard, Helpdesk lacks
  `jobs:approve`, Auditor read-only, unknown roles denied, …).
- `server/internal/httpx/httpx_test.go` — pagination defaults/clamps/garbage-input, error
  and JSON envelope encoding.
- `server/internal/api/server_test.go` — the `perm` middleware exercised through the real
  `auth.Middleware`: authorized role → 200, unauthorized role → 403, missing/invalid
  bearer → 401.
- `agent/internal/agent/agent_test.go` — WS base URL derivation (http→ws, https→wss,
  explicit override, parse-error fallback), unknown-command rejection, and OS-specific
  command mapping for restart/lock.

### 2.2 Web console

```bash
cd platform/web
npm run lint
npm run build        # verifies the Next.js standalone production build
```

### 2.3 E2E smoke test (live services)

The Phase 10 script `/tmp/sunrise-e2e.sh` drives the real stack and asserts every link:

```
POST /auth/login → POST /enrollment-tokens → agent enroll → heartbeat →
inventory → GET /devices → device detail → POST /jobs (approved cmd) →
agent polls → submits result → GET /jobs/{id} → RBAC (Helpdesk denied devices:write) →
high-risk approval (pending → approve → queued) → /audit → /groups → dashboard summary
```

Prerequisites: `api`, `gateway`, `worker` running (migrations auto-apply); Redis `:6379`,
NATS JetStream `:4222`, Postgres 16. Seed the admin (`seed-admin`), create a Helpdesk test
user, then run the script and expect `ALL E2E CHECKS PASSED`.

Live agent verification (T3) additionally asserted real `system_profiler`/`sw_vers`
inventory (87 `device_software` rows) and completed WebSocket-pushed jobs
(`collect_inventory`, `collect_logs`).

## 3. What Unit Tests Don't Cover (known gaps)

These need live dependencies and are validated by the smoke script / manual runs:

- RLS tenant isolation behavior across all 20+ tenant tables.
- Agent offline-result queue flush and worker `online:false` rollup after 3 missed heartbeats.
- Command approval re-dispatch (queued job must carry the stored command code + timeout).
- Multi-tenancy end-to-end: two tenants must never see each other's devices.
- WebSocket push path, reconnect/backoff, and the 10-minute / 3-retry command semantics.

## 4. CI / Automation Roadmap

Not wired yet — recommended pipeline (GitHub Actions or equivalent):

1. `server: go vet ./... && go test ./...`
2. `agent: go vet ./... && go test ./...`
3. `web: npm ci && npm run lint && npm run build`
4. Integration job with docker-compose: boot Postgres/Redis/NATS/MinIO, apply migrations,
   run the API contract tests against the running server.
5. Post-merge, nightly E2E against a full docker-compose stack + a macOS runner for agent jobs.

## 5. Performance / Scale Notes

- No formal load tests yet. Target profile: 5k → 20k endpoints. Watch items: heartbeat
  rate (60s), WebSocket fan-out on the gateway, `audit_logs`/`patch_results` partitions,
  Redis pub/sub for job dispatch. See `DATABASE.md` for partitioning and index rationale.
