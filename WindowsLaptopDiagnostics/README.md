# Windows Laptop Diagnostics

A professional Windows desktop application for inspecting laptop hardware, running guided manual
tests, executing safe automated diagnostics, and generating reports.

Built with **C# / .NET 8 / WPF**, using documented Windows interfaces (WMI, Win32 API / P-Invoke,
WASAPI via NAudio, DirectShow/MF capture via OpenCvSharp).

> **Honesty rule:** this application never fabricates a hardware reading or a test result.
> A test reports `Passed` only when its documented acceptance criteria are actually satisfied.
> Anything the current machine, driver, firmware, or Windows edition cannot expose is reported as
> `Unsupported` / `Unavailable` / `Permission Required`.

---

## Requirements

| Item | Requirement |
| --- | --- |
| OS | Windows 10 (19041+) or Windows 11, x64 |
| SDK to build | .NET SDK 8.0.3xx |
| Runtime to run (framework-dependent) | .NET 8 **Desktop** Runtime |
| Privileges | User (no admin required for core diagnostics; individual operations say when elevation is needed) |
| Network | Not required for core diagnostics |

`DOTNET_ROOT` must point at your .NET install if it is **not** in `C:\Program Files\dotnet`
(e.g. a per-user install at `%LOCALAPPDATA%\Microsoft\dotnet`).

---

## Build

```powershell
$dn = "$env:LOCALAPPDATA\Microsoft\dotnet\dotnet.exe"   # or just "dotnet"
& $dn build .\WindowsLaptopDiagnostics.sln -c Release
```

## Run

```powershell
$env:DOTNET_ROOT = "$env:LOCALAPPDATA\Microsoft\dotnet"   # only if dotnet is per-user
& "$PSScriptRoot\src\WindowsLaptopDiagnostics\bin\Release\net8.0-windows\WindowsLaptopDiagnostics.exe"
```

## Test

```powershell
& $dn test .\WindowsLaptopDiagnostics.sln
```

## Publish a self-contained executable

```powershell
& $dn publish .\src\WindowsLaptopDiagnostics -c Release -r win-x64 --self-contained true `
    -p:PublishSingleFile=true
```

---

## Project layout

```
WindowsLaptopDiagnostics/
├── WindowsLaptopDiagnostics.sln
├── README.md                     ← this file
├── ARCHITECTURE.md               ← structure, design decisions, hardware interfaces
├── PROJECT_STATUS.md             ← what is implemented and what is verified
├── IMPLEMENTATION_PLAN.md        ← phases, dependencies, milestones, acceptance criteria
├── docs/                         ← known limitations, test catalogue
└── src/WindowsLaptopDiagnostics/ ← the WPF application
    ├── App.xaml(.cs)             application resources & entry point
    ├── MainWindow.xaml(.cs)      navigation shell
    ├── Resources/Theme.xaml      dark charcoal/navy theme, cyan accents
    ├── Core/                     shared result model, test catalogue, status rules
    ├── Infrastructure/           MVVM base, commands, converters, logging, cancellation
    ├── Services/                 settings, history, reporting, audio, camera
    ├── Hardware/                 WMI + P/Invoke wrappers and device inventory
    ├── Diagnostics/              individual test implementations
    ├── Monitoring/               on-demand telemetry polling
    ├── ViewModels/               one per page + shared child VMs
    └── Views/                    user controls, one per page
```

---

## The 20 tests

Grouped by category, all sharing one result model and one status vocabulary:

**Interactive** — display, keyboard, touchpad & mouse, speakers, microphone, camera
**Performance / stress** — CPU, GPU, RAM, fan & cooling, temperature & sensors
**Health** — SSD/HDD, battery & charging, Windows & driver health, system information
**System / connectivity** — Wi-Fi & network, Bluetooth, USB & external ports
**Workflow / reports** — automatic diagnostics, test history & reports

Statuses used consistently everywhere:
`Not Run`, `Ready`, `Running`, `Passed`, `Warning`, `Failed`, `Unsupported`, `Cancelled`, `Error`.

---

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — structure, decisions, hardware interfaces, module responsibilities
- [PROJECT_STATUS.md](PROJECT_STATUS.md) — implemented features, verification results, limitations
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — phases and acceptance criteria
- [docs/Known-Limitations.md](docs/Known-Limitations.md) — hardware-dependent limitations
