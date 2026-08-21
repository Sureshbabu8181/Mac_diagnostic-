# Sunrise MDM — Security Model (PHASE 7)

Security is designed before implementation. This document is the threat model,
the trust boundaries, and the concrete controls mapped to each component.

## 1. Assets & Trust Boundaries

```
[ Admin browser ] --TLS+SSO--> [ Caddy ] --TLS--> [ API / Web ]
                                   |
[ Agent (SYSTEM) ] --mTLS-WS-----> [ Agent Gateway ] --> [ NATS ] --> [ Workers ] --> [ PostgreSQL / MinIO / Vault ]
```

Boundaries:
1. Internet ↔ Caddy (TLS, rate limit, WAF-lite)
2. Caddy ↔ Backend (internal TLS, service auth)
3. Agent ↔ Gateway (mTLS, device certs, job signing)
4. Backend ↔ Data stores (Vault-issued creds, network ACLs)
5. Admin sessions (SSO JWT, MFA, RBAC, session timeout)

## 2. Authentication

- **Admins**: OIDC/SAML via Keycloak (Google/Entra/Okta/LDAP federated). MFA enforced by
  Keycloak policy. Sessions: JWT access (15 min) + refresh (8 h absolute) + rotation;
  single-session per user with revocable sessions.
- **Agents**: enrollment issues a **device certificate** (internal CA, keyed to device);
  all agent traffic over mTLS. Short-lived per-session tokens for agent APIs; rotated each reconnect.
- **API keys**: hashed at rest (`key_hash`, prefix visible), scoped per tenant, expirable, revocable, `last_used_at` audited.

## 3. Authorization (RBAC)

- Roles: Super Admin, IT Admin, Helpdesk, Asset Manager, Security Admin, Read Only, Auditor.
- Permissions are granular (`devices:read|write`, `assets:*`, `jobs:create|approve`,
  `patches:approve`, `audit:read`, `reports:read`, `users:manage`, …) mapped via `role_permissions`.
- Scoping: `user_roles` bind role + tenant + department list. **Super Admin is the only
  cross-tenant role.** Every query resolves effective permissions from `(tenant, dept, role)`.
- High-risk actions (job create, patch deploy, asset disposal) additionally require MFA
  re-authentication and/or 2nd-admin approval.

## 4. Data Protection

- **In transit**: TLS 1.2+ everywhere; agents use mTLS.
- **At rest**: PostgreSQL/object-storage encryption at rest; field-level encryption for
  sensitive fields (location, login identity) via Vault keys; logs redact secrets.
- **Secrets**: HashiCorp Vault (dynamic DB creds, signing keys, enrollment tokens, package
  signing keys, notification webhook secrets). **Never** in env files or the job queue.
- **Credentials on endpoints**: never stored in plaintext; installers/scripts run without
  embedded credentials; secrets delivered only via a separate encrypted channel when a
  legitimate need exists (future: Vault agent-side integrations).

## 5. Agent Security

- Enrollment: one-time, expiring, revocable token → keypair → CSR → signed device cert.
- Job validation: signed jobs (Ed25519 via Vault), replay protection (nonce + TTL),
  command allowlist matching (exact command IDs + validated args schema).
- Package validation: SHA-256 pinned at upload + digital signature verified before execution.
- Execution: least-privilege execution context within SYSTEM/root; argument validation to
  prevent injection; stdout/stderr captured with size caps; timeouts enforced by agent.
- Local state: config protected (owner root/SYSTEM, permissions 0600); agent removal requires
  uninstall authorization; local logs written securely and rotated.
- Self-update: signed staged artifacts only; version/checksum verified before replace.

## 6. Command & Job Security

- Only **approved command library** entries are executable; no arbitrary shell.
- High-risk commands require: RBAC + MFA + 2nd-admin approval + confirmation with scope
  preview + device count. Never one-click bulk arbitrary execution.
- Server enforces state machine; client validates each job before executing.
- Rate limiting + idempotency keys on job creation to prevent job-storm.

## 7. Multi-Tenant Isolation

- `tenant_id` on every tenant-owned row + **PostgreSQL RLS** (`app.tenant_id`).
- Agent gateway binds connection → tenant from device cert; NATS subjects namespaced per tenant.
- Object storage buckets per tenant; presigned URLs scoped to tenant.
- Cross-tenant requests rejected at middleware and provably at DB level.
- Dedicated **isolation test suite** (see TESTING.md).

## 8. Audit Logging

- Every mutating operation writes `audit_logs`: actor, tenant, action, resource, before/after
  JSON, IP, UA, request_id, occurred_at.
- Agent events (enrollment, update, unenroll) audited with device identity.
- Audit logs are append-only (permission `audit:read` for Auditor only; no UPDATE/DELETE grants).
- Retention configurable per tenant; partitioned monthly.

## 9. Network & Rate Protection

- Caddy + backend: per-key/IP rate limits, body-size limits, request validation (zod server-side).
- WS gateway: per-device message caps, per-tenant connection caps.
- Replay protection on agent messages (timestamp + nonce window).

## 10. Secrets & Key Management

- Vault: DB dynamic creds, TLS cert issuance/CA, package signing key, enrollment token
  signing, notification webhooks. Audit of Vault access.
- Key rotation policy: DB creds auto-rotated; signing keys rotated with dual-key grace.

## 11. Ops Security

- Admin session timeout 15 min idle / 8 h absolute; break-glass local accounts (Super Admin,
  MFA) with audit; security updates for base images via CI; signed containers (optional).
- Vulnerability scanning in CI (govulncheck, npm audit, Trivy on images).

## 12. Incident & Revocation

- Device compromise → revoke device cert + tokens + quarantine device (mark status).
- Admin compromise → revoke sessions, API keys, force MFA re-enroll.
- Data residency: per-region gateways; location retention 90 days default; export/deletion
  APIs for data-subject requests.

## 13. Control Mapping

| Requirement | Control |
|---|---|
| TLS | Caddy + mTLS agents |
| Encryption at rest | DB/object encryption + field-level sensitive data |
| Secure agent auth | Device certs + short tokens |
| Device revocation | Cert + token revoke |
| Short-lived tokens | 15 min access / rotation |
| RBAC / MFA | Keycloak + scoped roles + MFA gate |
| Command authorization | Approved library + risk approval + signed jobs |
| Rate limiting | Per-key/tenant limits |
| Input validation | zod + strict handlers |
| Secrets mgmt | Vault, no plaintext |
| Secure update | Signed staged artifacts |
| Replay protection | Nonce + TTL |
| Admin timeout | 15m/8h + rotation |
