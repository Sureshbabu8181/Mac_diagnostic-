# Sunrise MDM — Agent Architecture (PHASE 8)

Go endpoint agent for macOS + Windows, running as a system service.

## 1. Agent Responsibilities

Register → enroll (mTLS) → heartbeat → collect inventory → receive signed jobs → execute
approved jobs → upload results → report errors → self-update (staged) → offline local queue
→ reconnect sync.

## 2. Process & Packaging

| Platform | Distribution | Service |
|---|---|---|
| macOS | Signed `.pkg` (with/without MDM-assisted enrollment) | `launchd` daemon (`com.sunrise-mdm.agent`) |
| Windows | Signed `.msi` (silent `msiexec /quiet`, GPO/SCCM-compatible) | Windows Service (`SunriseAgent`) |
| Self-update | Signed artifact per `agent_versions`, staged rings, checksum+signature verified | Stop→replace→start |

## 3. Internal Architecture

```
Sunrise Agent (Go)
├── Connection Manager        mTLS WebSocket ↔ gateway; long-poll fallback; reconnects w/ backoff
├── Heartbeat                 every 60s (configurable 30s–15m); includes liveness + mini status
├── Job Engine                receive → validate signature → allowlist check → execute → result
│   ├── Local Job Queue       ≤100 jobs / ≤24h while offline; retry + exponential backoff
│   └── Executors             per-command handlers (restart, lock, inventory, log collect, …)
├── Inventory Collector       hardware / software / network / OS tables (daily baseline + on-demand)
├── Software Manager          install/uninstall/upgrade approved packages (signed, checksummed)
├── Patch Manager             macOS: Apple SW Update / MDM; Windows: WU / WUfB (Phase 10 MVP subset)
├── Policy Cache              last-known policies, enforced offline, re-synced on reconnect
├── Compliance Evaluator      local policy eval → compliance state
├── Tracker (optional)        login/logout events; location events (consent-gated); usage metering
├── Updater                   staged signed self-update
└── Secure Local Store        config (root/SYSTEM 0600), queue, cert, last-known state
```

## 4. Communication Protocol

- **Transport**: WSS `wss://<gateway>/api/v1/ws/agent` with mTLS.
- **Frames** (JSON, versioned): `hello`, `heartbeat`, `job_push`, `job_ack`, `job_result`,
  `inventory`, `events`, `update_check`, `update_status`, `error`.
- **Replay protection**: each frame carries monotonic seq + timestamp; server window checks.
- **Offline**: exponential backoff 30s→1m→2m→5m→10m→30m cap; queue jobs locally; batch-sync
  inventory/results on reconnect.
- **Fallback**: if WS fails repeatedly, HTTP long-poll `GET /api/v1/agent/jobs`.

## 5. Job Execution Model

1. Receive signed job (command_id, args, nonce, TTL, job_id).
2. Verify signature (Ed25519), nonce/TTL, command allowlist + args schema.
3. Local policy check (risk/ring/maintenance window where applicable).
4. Execute with timeout + retry (default 10 min, 3 retries, backoff).
5. Capture exit code, stdout/stderr (size-capped), duration.
6. Submit result idempotently `(job_target_id, attempt)`.
7. Agent never executes unsigned/unmatched jobs; never accepts arbitrary shell from server.

## 6. Inventory Model (osquery-style tables, Go-native)

| Table | macOS | Windows |
|---|---|---|
| system_info | sw_vers, sysctl | registry/SystemInfo, WMI |
| hardware | sysctl, ioreg | WMI Win32_ComputerSystem/Processor/PhysicalMemory |
| disk_info | diskutil | WMI Win32_LogicalDisk |
| battery | pmset | WMI Win32_Battery (where present) |
| os_version | sw_vers | registry + winver APIs |
| network | ifconfig/route | ipconfig/Get-NetAdapter (or win32 APIs) |
| apps | /Applications + launchservices | registry Uninstall keys + MSI ARP |
| filevault/bitlocker | fdesetup | manage-bde |
| updates | softwareupdate --list | USO/Windows Update COM |

## 7. Patch Manager (MVP scope)

- **Discovery**: macOS `softwareupdate --list`; Windows USO/Windows Update COM → structured
  patch metadata (title, severity, kb, reboot) sent to backend.
- **Install**: macOS `softwareupdate --install` (respect Apple mechanisms; MDM-assisted when
  available); Windows via Windows Update API/WUfB — never third-party sources.
- **Reboot**: per policy (deferral window, user notifications, maintenance window).
- **Result**: exit code, logs, reboot status → backend `patch_results`.

## 8. Security Properties (see SECURITY.md)

- mTLS device cert; signed jobs; no arbitrary URLs; no blind binary execution; package
  checksum+signature validation; least-privilege exec contexts; secure local store;
  uninstall authorization; secure local logs.

## 9. Build & Release

- Build matrix (GitHub Actions): `darwin/arm64`, `darwin/amd64`, `windows/amd64`.
- Sign (macOS: Developer ID + notarization; Windows: Authenticode) then publish artifact +
  sha256 to backend `agent_versions` for staged rollout.
- Version-gated capabilities so backend can target older agents safely.

## 10. Test Strategy (see TESTING.md)
- Unit: executors, queue, policy cache. Integration: against local gateway/NATS. 
- Device test pool: VMs (macOS via virtualization, Windows via Hyper-V/Parallels) — never
  destructive commands against production devices.
