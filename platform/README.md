# Sunrise MDM — Endpoint Management Platform

Multi-tenant Asset + Endpoint Management + Software Inventory + Patch Management + Remote
Command platform (macOS + Windows). Architecture: see `docs/endpoint-platform/`.

## Documentation

- `docs/endpoint-platform/` — design: ARCHITECTURE, DATABASE, API, SECURITY, AGENT, UI,
  PATCH-MANAGEMENT, TECHNOLOGY-SELECTION, OPENSOURCE-EVALUATION
- `docs/endpoint-platform/TESTING.md` — how each layer is verified (unit + e2e)
- `docs/endpoint-platform/DEPLOYMENT.md` — production topology, backups, scaling, hardening

## Repository Layout

```
platform/
├── docker-compose.yml     dev stack (Postgres, Redis, NATS, MinIO, API, Gateway, Worker, Web, Caddy, Monitoring)
├── server/                Go backend (API + agent gateway + workers)
├── agent/                 Go endpoint agent
├── web/                   Next.js admin console
└── infra/                 Caddy, Prometheus, Grafana, Loki configs
```

## Quick Start (dev)

```bash
cp .env.example .env
docker compose up -d --build
# Web:  https://localhost        (Caddy)  or http://localhost:3000
# API:  http://localhost:8080/api/v1
# WSS:  ws://localhost:8090/api/v1/agent/ws
```

1. Seed an admin: `docker compose exec api /app/server seed-admin admin@sunrise-mdm.test Demo@12345`
2. Log in at http://localhost:3000 (or https://localhost via Caddy).
3. Enroll a device:
   - Create an enrollment token via `POST /api/v1/enrollment-tokens` (API) — or POST `/api/v1/agent/enroll`
     directly with a token to bootstrap.
   - Run the agent: `./agent/bin/agent -s http://localhost:8080 -t <enroll-token>` (see below).

## Building the Agent

```bash
cd agent
docker build --build-arg GOOS=darwin --build-arg GOARCH=arm64 -o out/agent-darwin-arm64 .
# or cross-compile without Docker:
export PATH="/usr/local/opt/go/bin:$PATH"
CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -o out/agent-darwin-amd64 ./cmd/agent
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -o out/agent-windows-amd64.exe ./cmd/agent
```

Agent flags: `-s <api base URL>` (default `http://localhost:8080`), `-t <one-time enrollment token>`,
`-heartbeat <seconds>` (default 60). Identity, token, and the offline result queue are persisted
under the user config dir (`~/.config/sunrise-mdm`). The agent supports the approved command set:
`collect_inventory`, `restart`, `shutdown`, `lock_screen`, `collect_logs`.

## Agent Downloads

Compiled binaries are served by Caddy from `https://<host>/downloads/` (from
`agent/downloads/`, built locally — not committed). Build all three:

```bash
cd agent && mkdir -p downloads
export PATH="/usr/local/opt/go/bin:$PATH"
CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -o downloads/agent-darwin-amd64 ./cmd/agent
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -o downloads/agent-darwin-arm64 ./cmd/agent
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -o downloads/agent-windows-amd64.exe ./cmd/agent
```

Download links (dev, via Caddy):

| OS/arch | URL |
|---------|-----|
| macOS Intel | `https://localhost/downloads/agent-darwin-amd64` |
| macOS Apple Silicon | `https://localhost/downloads/agent-darwin-arm64` |
| Windows x64 | `https://localhost/downloads/agent-windows-amd64.exe` |

Download and enroll:

```bash
curl -k -o agent -L https://localhost/downloads/agent-darwin-arm64 && chmod +x agent
./agent -s https://localhost -t <enrollment-token>   # -s is the API base URL
```

## Local dev without Docker (macOS)

Requires Go 1.23+, local PostgreSQL 16, Redis, and NATS with JetStream (`-js`).

```bash
# 1. Database
createdb -O <user> sunrise
# 2. Dependencies (Homebrew)
brew install redis nats-server
redis-server --daemonize yes
nats-server -js -m 8222 &            # JetStream enabled
# 3. Build + run backend (three processes)
cd server
export PATH="/usr/local/opt/go/bin:$PATH"
go build -o /tmp/sunrise-server ./cmd/server
/tmp/sunrise-server api &             # :8080  (migrations auto-apply on first start)
/tmp/sunrise-server gateway &         # :8090  (WebSocket)
/tmp/sunrise-server worker &          # job rollup + offline detection
/tmp/sunrise-server seed-admin admin@sunrise-mdm.test Demo@12345
# 4. Web console
cd ../web
npm install && npm run dev            # http://localhost:3000 (BFF proxies to :8080)
# 5. Agent (real device)
cd ../agent && go build -o /tmp/sunrise-agent ./cmd/agent
/tmp/sunrise-agent -s http://localhost:8080 -t <enrollment-token> -heartbeat 60
```

## MVP Scope (Phase 10)

Auth → Dashboard → Device enrollment → Heartbeat → HW/SW inventory → Device details →
Groups → RBAC → Approved command library → Job queue + results → Audit logs → Software
deployment (rings) → Patch MVP (discovery/policies/windows/rings/deploy/reboot/results/
failure handling/audit) → Compliance → Notifications → Reports → API.

Status: **Phase 11 complete** — core vertical slice built and smoke-tested end-to-end;
unit tests for auth/RBAC/pagination/perm + agent (see `docs/endpoint-platform/TESTING.md`).
Deployment guide in `docs/endpoint-platform/DEPLOYMENT.md`.
