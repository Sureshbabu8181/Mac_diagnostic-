# Sunrise MDM — UI Wireframes (PHASE 9)

Next.js (Tailwind v4) enterprise console, light/dark theme, WebSocket live updates.

## 1. Global Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ Logo  Sunrise MDM        [search]   [Notifications]  User ▼ [theme]  │
├───────────────┬──────────────────────────────────────────────────────┤
│ Sidebar       │  Content                                             │
│ Dashboard     │                                                      │
│ Devices       │                                                      │
│ Assets        │                                                      │
│ Users         │                                                      │
│ Groups        │                                                      │
│ Software      │                                                      │
│ Applications  │                                                      │
│ Policies      │                                                      │
│ Commands      │                                                      │
│ Jobs          │                                                      │
│ Compliance    │                                                      │
│ Patch Mgmt    │                                                      │
│ Reports       │                                                      │
│ Audit Logs    │                                                      │
│ Settings      │                                                      │
└───────────────┴──────────────────────────────────────────────────────┘
```

## 2. Dashboard (live)

```
Total devices  Online  Offline  Non-compliant  Unknown   [by OS: Win/mac]
Critical alerts                        Patch compliance %
[Device status donut] [Compliance trend line] [Patch success rate]
[Recent jobs table]   [Latest notifications feed]
```

## 3. Devices List

```
Filters: OS | Status | Group | Department | Compliance | Search
Table: Hostname | OS/Version | Model | Last seen | Status dot | Assigned user | Compliance badge
Row actions: View | Commands | Assign | Tags
```

## 4. Device Detail (tabs)

```
Overview   Hostname, OS, model, serial, IP, online status, agent version, summary cards
Hardware   CPU, RAM, storage, GPU, battery health
Software   App table + compliance + outdated/unapproved badges
Users      Assigned user + login events
Network    Adapters, IPs, SSID, gateway history
Compliance Policy breakdown + scores
Commands   Run approved commands (risk badge + confirm dialog)
Jobs       Job history for this device
Timeline   asset history + audit merged, chronological
```

## 5. Command → Job Flow (confirm dialog)

```
Run command: [Restart]  Target: 12 devices (Finance dept dynamic group)
Risk: HIGH — requires MFA + approval
[Scope preview table] [Device count: 12]  [Schedule] [Cancel] [Confirm]
```

## 6. Asset Page

```
Lifecycle stepper: Procurement ▸ Receiving ▸ Inventory ▸ Assignment ▸ Active
                   ▸ Repair ▸ Reassignment ▸ Return ▸ Retirement ▸ Disposal
Fields: asset tag, serial, vendor, warranty, purchase date, assigned user, dept, location
History: timeline of transitions + field changes
```

## 7. Patch Management (per module)

```
Patch compliance %   Missing critical   High-risk devices   Reboot pending
[Patches table: title, severity, kb, release, status, actions approve/deploy/pause/cancel]
[Patch policies: severity, approval rule, rings, maintenance window]
[Deployment ring view: Ring0 ▸ Ring1 ▸ Ring2 ▸ Ring3 ▸ Ring4]
[Device patch status page per spec]
```

## 8. Admin Flows

- **Approval queue**: pending high-risk jobs/patches with scope preview + approve/reject.
- **Policy editor**: name, type, config form, scope assignment (org/dept/group/device).
- **Settings**: notifications channels, maintenance windows, retention, agent update rings.
- **Reports**: pick report type + format (CSV/PDF/JSON) + schedule.

## 9. UX Principles
- Loading skeletons, empty states, error toasts, confirm-on-destructive everywhere.
- Live WebSocket counters; device pages load-on-tab.
- Dark/light theme toggle persisted; keyboard navigable; responsive ≥360px.
