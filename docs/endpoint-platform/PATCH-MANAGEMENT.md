# Sunrise MDM — Patch Management Module (Design)

Covers the full patch-management requirement set (discovery → approval → rings → deployment
→ compliance → rollback → audit → API). MVP subset is marked **[MVP]**; everything else is
post-MVP sequencing.

## 1. Scope & Architecture Decision

The platform does **not** become a package repository. It provides **DISCOVERY + POLICY +
APPROVAL + SCHEDULING + DEPLOYMENT ORCHESTRATION + COMPLIANCE + REPORTING** while relying on:

- **macOS**: Apple Software Update / MDM (never bypass Apple's mechanisms; integrate with Apple MDM where MDM is required)
- **Windows**: Windows Update / Windows Update for Business / PowerShell official mechanisms (never untrusted sources)
- **Third-party apps**: trusted vendor/package repositories with signature + checksum validation
- **Agent updates / custom packages**: platform-uploaded signed artifacts

## 2. Patch Discovery **[MVP]**

Agent periodically collects (daily baseline + on-demand scan):
`OS name, OS version, OS build, kernel (where applicable), available updates, installed
updates, missing security/critical patches, app versions + available app updates, severity,
release date, installation status`.

Example:
```
MacBook-Pro-001: Current macOS 26.5 | Available macOS 26.6 | Severity Security | Status Missing
```

## 3. Patch Catalog

Entities (see DATABASE.md): `patches`, `patch_versions`, `patch_products`, `patch_cves`,
`patch_packages`, `patch_policies`, `patch_deployments`, `patch_deployment_targets`,
`patch_results`, `patch_exclusions`, `patch_approvals`, `patch_maintenance_windows`,
`patch_reboots`.

Patch fields: id, KB#, CVEs, vendor, product, version, target OS, release date, severity,
category, download info, install method, reboot requirement, supersedence, detection rule,
installation rule, rollback/recovery info.

Patch states: **Discovered → Approved → Scheduled → Downloading → Installing →
Reboot Required → Completed → Failed → Rolled Back**.

## 4. Severity & Auto-Approval Rules

`Critical | High | Medium | Low | Informational`.

Auto-approval rules (configurable):
- Critical security → auto-approve for Pilot ring
- High security → require administrator approval
- Feature updates → manual approval
- Custom rules engine (severity, patch age, product, target group) → action (approve/reject/flag)

## 5. Deployment Rings **[MVP]**

Ring 0 IT/Test → Ring 1 Pilot → Ring 2 Early Adopters → Ring 3 Production → Ring 4 Critical Systems.
Configurable per policy: delay between rings, % devices, maintenance window, automatic promotion,
manual approval. Example: released → IT/Test → wait 24h → Pilot → wait 48h → Early Adopters → Production.

## 6. Patch Policies **[MVP]**

Example "Critical Security Patch Policy": severity Critical, approval Automatic, deploy within 24h,
maintenance window 22:00–04:00, reboot required, user notified 15 min before reboot, 3 retries,
target all Windows devices. Stored in `patch_policies` (target_type/target_id → device groups/departments).

## 7. OS Patch Management

- **macOS**: `softwareupdate` list/install; enforce min OS version via policy; MDM-assisted where available; never bypass Apple's security.
- **Windows**: Windows Update + WUfB + official PowerShell; track pending/installed/failed/reboot-pending/security/feature updates.
- **Linux** (future): apt/dnf/yum/zypper via official repos.

## 8. Third-Party Application Patching **[post-MVP]**

Per-app catalog entry must have: trusted source, checksum, digital signature validation, version
detection rule, install/uninstall commands, exit-code mapping, reboot requirement. Never blindly
execute arbitrary downloaded installers.

## 9. Patch Compliance **[MVP]**

Dashboard metrics: total devices, patched, missing patches, critical missing, high-risk devices,
reboot pending, failures, unknown. Overall/critical/high/medium percentages + per-device status
(OS version, last patch, patch level, missing/critical, reboot pending, policy, last scan,
last successful update, failed updates, compliance state). Charts: compliance over time,
deployment success, OS versions, critical vulnerability exposure.

## 10. CVE Integration **[post-MVP]**

Track CVE/CVSS/severity/affected product-version/fixed version; map CVE → product → version →
devices → risk. Organization-specific risk scoring (not CVSS-only).

## 11. Maintenance Windows **[MVP]**

Global, department, and device-group maintenance windows (`maintenance_windows` table).
Examples: Production Sun 02:00–05:00; IT anytime; Finance Sat 23:00–04:00.

## 12. User Notifications & Reboot Management **[MVP]**

- Notify: "An important security update is ready to install." → Install Now / Remind Me / Schedule.
- Reboot countdown: 15/10/5/1 minute notices.
- Reboot policy: required, max deferral (e.g., 24h), force reboot in configured maintenance window
  after deadline — never without respecting policy + notification requirements. Tracked in `patch_reboots`.

## 13. Failure Handling & Rollback

- Failure path: capture exit code + logs → determine reason → retry per policy (3 attempts) →
  notify admin → mark non-compliant → escalate if threshold exceeded.
- Rollback: per-patch `rollback_supported` + method/command/timeout/recovery. If unsupported,
  provide recovery guidance, never pretend rollback exists.

## 14. Dependencies & Supersedence

`patches.supersedes / superseded_by`, product/OS version prerequisites. Never deploy superseded patches unnecessarily.

## 15. Approval & Emergency Workflow

- Standard: Discovered → Risk analysis → Admin review → Approve/Reject → Assign ring → Schedule → Deploy → Monitor → Promote. Supports pause/resume/cancel. All in `patch_approvals` + audit.
- Emergency **[post-MVP]**: Security Admin creates emergency patch → selects affected devices →
  emergency deployment → requires approval → deploy immediately → monitor → report; full audit.

## 16. Automation & Exclusions **[post-MVP]**

Rules: `IF severity=Critical AND patch age>24h AND device=Production THEN require approval`;
`IF severity=Critical AND ring=Pilot THEN auto-deploy`.

Exclusions: require device/group + patch + reason + requester + approver + created date +
expiration date. No permanent silent exclusions; after expiry device returns non-compliant.

## 17. Patch Audit **[MVP]**

Record approver, scheduler, target devices, start/complete times, install result, exit code,
reboot status, failure reason, user notifications. Searchable via `audit_logs` + `patch_approvals`.

## 18. Patch API **[MVP subset]**

```
GET  /api/v1/patches                        [MVP]
GET  /api/v1/devices/{id}/patches           [MVP]
GET  /api/v1/patches/missing                [MVP]
GET  /api/v1/patches/critical               [MVP]
POST /api/v1/patches/{id}/approve           [MVP]
POST /api/v1/patches/{id}/deploy            [MVP]
POST /api/v1/patches/{id}/pause|resume|cancel
GET  /api/v1/patch-jobs                     [MVP]
GET  /api/v1/patch-compliance               [MVP]
POST /api/v1/patch-exclusions               [post-MVP]
```

## 19. Patch Security

Never send arbitrary URLs to endpoints; never blindly execute downloaded binaries. Validate:
source, SHA-256, digital signature, package metadata, expected version. Signed jobs. API guarded
by RBAC + MFA + audit + rate limiting + approval workflow.

## 20. Patch Reports **[MVP]**

Daily/Weekly/Monthly: devices missing critical/security patches, success rate, failures,
reboot pending, unsupported OS, exceptions, CVE exposure, department compliance. Export CSV/PDF/JSON.

## 21. MVP Sequencing

1. Patch discovery + OS version detection + missing-patch detection **[MVP]**
2. Patch compliance + policies + maintenance windows + deployment rings **[MVP]**
3. Approved patch deployment + reboot management + result reporting + failure handling + audit **[MVP]**
4. Post-MVP: CVE intel, third-party app patching, emergency patching, advanced automation, exclusions, ClickHouse analytics.
