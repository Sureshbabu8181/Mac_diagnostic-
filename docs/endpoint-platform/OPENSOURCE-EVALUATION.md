# Sunrise MDM — Open-Source Component Evaluation (PHASE 3)

Mapping how existing open-source software is **used as-is**, **borrowed from**, or
**integrated later** — and explicitly what we **build ourselves** and why.

## 1. Decision Summary

| Project | License | Role in Sunrise MDM | Decision |
|---|---|---|---|
| osquery | Apache-2.0 | Inventory data model inspiration | Borrow concept; implement Go-native tables |
| FleetDM | MIT core / open-core | Full MDM + inventory | **Not adopted** — overlaps but lacks patch mgmt, asset lifecycle, MSP multi-tenancy; large security surface |
| GLPI | GPL-2.0 | ITAM (assets/procurement/ticketing) | Optional API integration post-MVP |
| MeshCentral | Apache-2.0 | Remote desktop/shell | Optional integration post-MVP (remote support channel) |
| Wazuh | GPL-2.0 | SIEM/EDR telemetry | Optional sidecar integration post-MVP |
| Ansible | GPL-3.0 | Infra/config automation | Platform-internal ops tool only |
| Headwind MDM | Apache-2.0 (open-core) | Android MDM | **Avoid** — Android-only, out of scope |

## 2. Detailed Evaluation

### osquery — INSPIRE
- **License**: Apache-2.0. **Arch**: C++ daemon exposing OS telemetry as SQL tables.
- **Platforms**: macOS, Windows, Linux.
- **Strengths**: de-facto endpoint telemetry standard; deep cross-platform tables (hardware,
  software, processes, network, files); actively maintained; well-audited.
- **Weaknesses**: no management server, no command execution framework, no patching.
- **Use**: Our Go agent implements the same *idea* (structured hardware/software tables) natively
  — avoids a second privileged daemon and its attack surface. Optional later: embed osquery as a
  data source for deep FIM/process visibility behind a feature flag.

### FleetDM — NOT ADOPTED (reference)
- **License**: MIT core; `/ee` commercial; client JS has separate terms. **Arch**: Go server + fleetd/orbit agents (osquery-based).
- **Platforms**: macOS, Windows, Linux, iOS, Android, ChromeOS.
- **Strengths**: excellent osquery management, GitOps YAML, REST API, real-time policies,
  MDM (nanoMDM), CIS benchmarks, proven at 100k+.
- **Weaknesses for us**: no patch automation/rings/maintenance windows; no asset lifecycle or
  procurement; MSP multi-tenancy is team-scoped, not true SaaS tenancy; 2026 CVE backlog
  (SQLi, authz bypasses, command injection, rate-limit bypass) requires continuous patching.
- **API**: excellent REST. **Community**: very active (6.7k stars, weekly releases).
- **Verdict**: integrate-for-inventory would still leave patch mgmt + asset lifecycle + tenancy
  to us — i.e., most of the platform — while adding a large second system. **Build instead.**

### GLPI — INTEGRATE LATER (optional)
- **License**: GPL-2.0. **Arch**: PHP + MySQL. **Platforms**: server-side; GLPI Agent on Win/Linux/macOS.
- **Strengths**: mature ITAM (procurement, warranty, contracts), ticketing, entity-based tenancy, REST API, large EU enterprise base.
- **Weaknesses**: not real-time RMM; no remote command framework, patching, or MDM; dated UI.
- **Verdict**: optional two-way sync (devices/assets ↔ GLPI) via REST for shops already on GLPI.
  Our asset model borrows GLPI's lifecycle field design.

### MeshCentral — INTEGRATE LATER (optional)
- **License**: Apache-2.0. **Arch**: Node.js server + agent; browser remote control.
- **Platforms**: Windows, macOS, Linux, FreeBSD.
- **Strengths**: strong browser remote desktop/terminal/file transfer; session recording;
  WoL/AMT; ~1.5k agents per modest VPS; E2E-encrypted sessions; documented REST API.
- **Weaknesses**: no patching, no alerting engine, no SaaS multi-tenancy, no software deployment.
- **Verdict**: optional post-MVP remote-support channel launched from our device page via its API.

### Wazuh — INTEGRATE LATER (optional)
- **License**: GPL-2.0. **Arch**: C++ agent + manager + OpenSearch indexer + dashboard.
- **Platforms**: Windows, Linux, macOS.
- **Strengths**: FIM, IDS, log collection, compliance maps (PCI/HIPAA/NIST), active response, vuln detection.
- **Weaknesses**: heavy OpenSearch cluster to operate; not a device/patch management platform;
  active response ≠ our controlled command framework; not SaaS multi-tenant.
- **Verdict**: optional sidecar for security telemetry fed to our device pages; never a dependency.

### Ansible — PLATFORM-INTERNAL OPS
- **License**: GPL-3.0. Agentless (SSH/WinRM). **Verdict**: use for managing our own servers
  (provisioning, hardening, backups). Not the endpoint layer.

### Headwind MDM — AVOID
- **License**: Apache-2.0 (open-core). **Platforms**: Android only (AOSP/kiosk). **Verdict**: out of scope (no Android requirement).

## 3. What We Build vs. Reuse

| Capability | Build | Reuse/Integrate |
|---|---|---|
| Inventory collection | Go agent native tables | osquery *concepts* |
| Asset lifecycle/ITAM | Build | GLPI API (optional sync) |
| Remote control | — | MeshCentral API (optional) |
| Security telemetry/SIEM | — | Wazuh (optional) |
| Server/infra automation | — | Ansible |
| macOS updates | Agent orchestrates | Apple Software Update / MDM |
| Windows updates | Agent orchestrates | Windows Update / WUfB |
| AuthN/SSO/MFA | Thin adapters | Keycloak |
| Secrets | Thin adapters | Vault |
| Object storage | — | MinIO/S3 |
| Queue | — | NATS JetStream |
| Metrics/logs | — | Prometheus/Grafana/Loki |

## 4. Compliance Notes
- No proprietary functionality is copied. All chosen OSS is Apache-2.0/MIT/GPL with compatible
  usage (GPL-2.0/GPL-3.0 used only as internal services or optional integration, not embedded).
- Our code is independent; we only consume APIs and reimplement generic concepts.
