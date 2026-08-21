# Sunrise MDM — Technology Selection (PHASE 4)

Final confirmed stack and the alternatives considered for each layer.

## 1. Final Stack

| Layer | Selected | Version | Why (vs alternatives) |
|---|---|---|---|
| Frontend | Next.js (React, Tailwind CSS v4) | 16.x | Server components, App Router, WS dashboards, light/dark |
| Backend | Go (chi router) | 1.23+ | Concurrency for 20k heartbeats; single binaries; type safety |
| Endpoint agent | Go | 1.23+ | Cross-compile macOS/Windows; static binary; low footprint |
| Database | PostgreSQL | 16+ | RLS multi-tenancy, JSONB, partitioning, mature |
| Cache/state | Redis | 7.x | Heartbeat liveness, rate limits, ring counters, short-lived tokens |
| Message queue | NATS JetStream | 2.10+ | Pub/sub + durable work queues, low latency, at-least-once |
| Object storage | MinIO (S3 API) | latest | Self-hostable; S3-compatible for cloud later |
| Identity | Keycloak | 24+ | OIDC/SAML federation, MFA, realm+group→role mapping |
| Secrets | HashiCorp Vault | 1.15+ | Dynamic DB creds, signing keys, enrollment tokens |
| Reverse proxy | Caddy | 2.x | Auto-TLS, minimal config, health checks |
| Metrics | Prometheus + Grafana | latest | Standard, self-hostable |
| Logs | Loki (+ Promtail/Alloy) | latest | Lightweight; scales to 20k devices |
| Audit/events | PostgreSQL (partitioned) | 16+ | Immediate; optional ClickHouse later for analytics |
| Containers | Docker + docker-compose | latest | Uniform dev/prod |
| CI/CD | GitHub Actions | — | Build+sign agents for macOS/Windows/Linux, run tests, publish artifacts |
| Migrations | golang-migrate | latest | Forward-only, reviewed migrations |

## 2. Decisions & Rejected Alternatives

| Decision | Rejected options | Reason |
|---|---|---|
| Go backend | Node.js, Python, Java | Concurrency, static binaries, ecosystem fit with agent |
| Go agent | Rust, C++, Python | Rust = stronger memory safety but slower velocity; C++ = unsafe; Python = packaging/heavy |
| NATS | RabbitMQ, Redis Streams, Kafka | Lowest ops overhead at 20k; JetStream gives durable queues; Kafka overkill pre-100k |
| WebSocket + heartbeat | gRPC stream, MQTT, polling | Simple, works through most NATs/proxies, push-based |
| Postgres | MySQL, MongoDB | RLS is the decisive multi-tenant feature |
| MinIO | Only cloud S3 | Self-hosted by requirement; S3 API keeps cloud optional |
| Keycloak | Direct per-IdP integration | Single OIDC/SAML broker for 5+ IdPs |
| Caddy | Nginx, Traefik | Auto-TLS simplicity |
| Loki | OpenSearch/Elasticsearch | Much lighter ops for log aggregation at our scale |
| Modular monolith | Microservices | 1–5k endpoints doesn't need service mesh; split later only if warranted |

## 3. Versioning & Repo Strategy

- Monorepo: `platform/` with `web/`, `server/`, `agent/`, `infra/`, `docs/`.
- Agents versioned semantically; agent self-update tracks `agent_versions` with signed artifacts.
- API versioned `/api/v1`; breaking changes require `/api/v2`.

## 4. Risks of the Selected Stack

- **Vault/Keycloak ops burden** on a small team → compose-based runbooks + backups (Phases 12–13).
- **WebSocket egress blocks** on some networks → agent long-poll fallback (Phase 8).
- **Postgres RLS performance** at 20k → partitioning hot tables + PgBouncer (Phases 5, 11).
- **Go agent privilege** (SYSTEM/root) → signing, checksum, minimal-attack-surface design (Phase 7–8).
