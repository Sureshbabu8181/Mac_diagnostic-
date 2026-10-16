using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using WindowsLaptopDiagnostics.Core;
using WindowsLaptopDiagnostics.Infrastructure;

namespace WindowsLaptopDiagnostics.Services;

/// <summary>One step the orchestrator can run.</summary>
public sealed record AutoStep(
    string Key,
    string Name,
    TestCategory Category,
    string Purpose,
    bool Automatable,
    string SkipReason);

/// <summary>Live progress pushed to the UI.</summary>
public sealed record AutoProgress(
    string Key,
    string Name,
    TestStatus Status,
    string Detail,
    int Completed,
    int Total);

/// <summary>Tally of a finished run. Skipped is deliberately its own bucket.</summary>
public sealed record AutoSummary(
    int Total,
    int Passed,
    int Warning,
    int Failed,
    int Unsupported,
    int Skipped,
    int Cancelled,
    int Error)
{
    /// <summary>
    /// Explicitly excludes skipped/unsupported/cancelled from the pass count,
    /// so a run cannot look successful merely because most of it did not run.
    /// </summary>
    public int Executed => Passed + Warning + Failed + Error;

    public string OneLine =>
        $"{Passed} passed · {Warning} warning · {Failed + Error} failed · " +
        $"{Unsupported} unsupported · {Skipped} skipped · {Cancelled} cancelled";
}

/// <summary>
/// Runs a chosen subset of checks in sequence with live per-step state, a
/// cancellation that is honoured between steps, and a summary that keeps
/// "did not run" separate from "ran and passed".
///
/// Interactive checks (display, keyboard, touchpad, speakers, microphone,
/// camera) are listed but never auto-executed: they need a human at the
/// machine, and silently counting them as anything would be a lie. They are
/// marked skipped with the reason printed.
/// </summary>
public static class AutoDiagnosticsService
{
    /// <summary>The full step catalogue, in a sensible running order.</summary>
    public static IReadOnlyList<AutoStep> Catalogue { get; } = new[]
    {
        new AutoStep("system",   "System information",  TestCategory.System,
            "Collect manufacturer, model, serial, BIOS, CPU, memory and Windows build.",
            true, ""),
        new AutoStep("windows",  "Windows & drivers",   TestCategory.System,
            "Decode every device ConfigManagerErrorCode and read servicing state.",
            true, ""),
        new AutoStep("storage",  "Storage health",      TestCategory.Health,
            "Inventory disks, read the SMART summary and probe volume readability.",
            true, ""),
        new AutoStep("battery",  "Battery & charging",  TestCategory.Health,
            "Read charge, power source and both capacities; compute wear only when both exist.",
            true, ""),
        new AutoStep("usb",      "USB devices",         TestCategory.System,
            "Enumerate USB devices and controllers and decode any problem code.",
            true, ""),
        new AutoStep("bluetooth","Bluetooth",           TestCategory.System,
            "Read the Bluetooth stack and decide whether a real radio is present.",
            true, ""),
        new AutoStep("network",  "Network addressing",  TestCategory.System,
            "Read adapter, MAC, IP, gateway and DNS. Sends no traffic at all.",
            true, ""),

        new AutoStep("display",  "Display test",        TestCategory.Interactive,
            "Full-screen colour and pixel patterns with visual confirmation.",
            false, "Requires a human to look at the screen - run it from the sidebar."),
        new AutoStep("keyboard", "Keyboard test",       TestCategory.Interactive,
            "Detect key presses across the physical layout.",
            false, "Requires a human to press keys - run it from the sidebar."),
        new AutoStep("touchpad", "Touchpad & mouse",    TestCategory.Interactive,
            "Track pointer movement, trail and button counts.",
            false, "Requires a human to move the pointer - run it from the sidebar."),
        new AutoStep("speakers", "Speakers",            TestCategory.Interactive,
            "Play channel-routed tones and wait for what the listener heard.",
            false, "Requires a human to listen - run it from the sidebar."),
        new AutoStep("microphone","Microphone",         TestCategory.Interactive,
            "Record, meter and play back from a capture endpoint.",
            false, "Requires a human to speak and listen - run it from the sidebar."),
        new AutoStep("camera",   "Camera",              TestCategory.Interactive,
            "Capture frames and measure delivered FPS.",
            false, "Requires a human to judge the picture - run it from the sidebar."),
        new AutoStep("cpu",      "CPU stress",          TestCategory.Performance,
            "Bounded multi-threaded load with a thermal-aware cancel.",
            false, "Deliberately not auto-run: a stress test needs the technician to choose a duration and watch temperatures."),
        new AutoStep("gpu",      "GPU stress",          TestCategory.Performance,
            "Bounded rendering workload with live engine utilisation.",
            false, "Deliberately not auto-run: a stress test needs the technician to choose a duration."),
        new AutoStep("ram",      "RAM stress",          TestCategory.Performance,
            "Bounded pattern fill with read-back verification.",
            false, "Deliberately not auto-run: a stress test needs the technician to choose a size and duration."),
        new AutoStep("fan",      "Fan & cooling",       TestCategory.Performance,
            "10-second observation; writes to hardware only with a vendor method.",
            false, "Deliberately not auto-run: changing fan speed needs explicit consent."),
        new AutoStep("thermal",  "Temperature sensors", TestCategory.Performance,
            "Read CPU/GPU temperature, clocks and throttling flags.",
            true, ""),
    };

    public static IReadOnlyList<AutoStep> Selected(string[] keys) =>
        Catalogue.Where(s => keys.Contains(s.Key)).ToList();

    /// <summary>
    /// Runs the chosen steps in catalogue order. Each step is awaited and its
    /// own exception is captured, so one failure never aborts the rest; the
    /// token is checked before every step so cancel is honoured promptly.
    /// </summary>
    public static async Task<(List<HistoryEntry> Entries, AutoSummary Summary, bool Cancelled)>
        RunAsync(
            IReadOnlyList<AutoStep> steps,
            bool includeNetworkProbe,
            IProgress<AutoProgress>? progress,
            CancellationToken ct)
    {
        var entries = new List<HistoryEntry>();
        int total = steps.Count, done = 0;

        void Report(AutoStep s, TestStatus st, string detail) =>
            progress?.Report(new AutoProgress(s.Key, s.Name, st, detail, done, total));

        bool cancelled = false;

        foreach (var step in steps)
        {
            if (ct.IsCancellationRequested)
            {
                // Remaining steps are recorded as cancelled, not silently dropped.
                var c = new TestOutcome { TestId = TestId.Auto, StartedAt = DateTime.UtcNow }
                    .Complete(TestStatus.Cancelled, "Not run - the run was cancelled.");
                entries.Add(HistoryService.Record(c, step.Key, step.Name, step.Category.Label()));
                Report(step, TestStatus.Cancelled, "cancelled");
                done++;
                cancelled = true;
                continue;
            }

            if (!step.Automatable)
            {
                var s = new TestOutcome { TestId = TestId.Auto, StartedAt = DateTime.UtcNow }
                    .Complete(TestStatus.NotRun, step.SkipReason);
                entries.Add(HistoryService.Record(s, step.Key, step.Name, step.Category.Label()));
                Report(step, TestStatus.NotRun, step.SkipReason);
                done++;
                continue;
            }

            Report(step, TestStatus.Running, "running");
            var started = DateTime.UtcNow;

            try
            {
                var outcome = await RunOneAsync(step, includeNetworkProbe, ct).ConfigureAwait(false);
                outcome.StartedAt = started;
                outcome.EndedAt = DateTime.UtcNow;
                outcome.DurationSeconds = (outcome.EndedAt.Value - started).TotalSeconds;

                entries.Add(HistoryService.Record(outcome, step.Key, step.Name, step.Category.Label()));
                Report(step, outcome.Status, outcome.Summary);
            }
            catch (OperationCanceledException)
            {
                var o = new TestOutcome { TestId = TestId.Auto, StartedAt = started }
                    .Complete(TestStatus.Cancelled, "Cancelled while running.");
                entries.Add(HistoryService.Record(o, step.Key, step.Name, step.Category.Label()));
                Report(step, TestStatus.Cancelled, "cancelled");
                cancelled = true;
            }
            catch (Exception ex)
            {
                Logger.Error($"Auto step '{step.Key}' failed", ex);
                var o = new TestOutcome { TestId = TestId.Auto, StartedAt = started }
                    .Complete(TestStatus.Error, $"Step failed: {ex.Message}");
                o.WithError(ex.GetType().Name);
                entries.Add(HistoryService.Record(o, step.Key, step.Name, step.Category.Label()));
                Report(step, TestStatus.Error, ex.Message);
            }

            done++;
        }

        var summary = new AutoSummary(
            total,
            entries.Count(e => e.Status == nameof(TestStatus.Passed)),
            entries.Count(e => e.Status == nameof(TestStatus.Warning)),
            entries.Count(e => e.Status == nameof(TestStatus.Failed)),
            entries.Count(e => e.Status == nameof(TestStatus.Unsupported)),
            entries.Count(e => e.Status == nameof(TestStatus.NotRun)),
            entries.Count(e => e.Status == nameof(TestStatus.Cancelled)),
            entries.Count(e => e.Status == nameof(TestStatus.Error)));

        return (entries, summary, cancelled);
    }

    /// <summary>Dispatches one automatable step to the real hardware services.</summary>
    private static async Task<TestOutcome> RunOneAsync(
        AutoStep step, bool includeNetworkProbe, CancellationToken ct)
    {
        // Every read is done off the UI thread; each branch is a genuine query,
        // and an empty result is reported as such rather than as a pass.
        return await Task.Run(async () =>
        {
            var o = TestOutcome.Running(TestId.Auto, step.Purpose);
            ct.ThrowIfCancellationRequested();

            switch (step.Key)
            {
                case "system":
                {
                    var rows = HardwareService.SystemInventory();
                    foreach (var (k, v) in rows) o.WithReading(k, v);
                    int unavailable = rows.Count(r => r.Value == "Unavailable");
                    return rows.Count == 0
                        ? o.Complete(TestStatus.Error, "Windows returned no inventory rows.")
                        : o.Complete(TestStatus.Passed,
                            $"{rows.Count} inventory items read" +
                            (unavailable > 0 ? $", {unavailable} reported Unavailable." : "."));
                }

                case "windows":
                {
                    var problems = HardwareService.DriverProblems();
                    var (build, _, hotfixes, _, detail) = HardwareService.ServicingState();
                    o.WithReading("Windows build", build);
                    o.WithReading("Updates reported", hotfixes.ToString());
                    foreach (var (name, _, code, meaning) in problems.Take(20))
                        o.WithReading(name, $"error {code} - {meaning}");

                    if (problems.Count == 0)
                        return o.Complete(TestStatus.Passed,
                            "No device reports a driver problem code.");
                    int stopped = problems.Count(p => HardwareService.IsDeviceStopped(p.Code));
                    return stopped > 0
                        ? o.Complete(TestStatus.Failed,
                            $"{problems.Count} device(s) with a problem code, {stopped} stopped.")
                        : o.Complete(TestStatus.Warning,
                            $"{problems.Count} device(s) report a problem code.");
                }

                case "storage":
                {
                    var disks = HardwareService.Disks();
                    var vols = HardwareService.Volumes();
                    var (smartOk, smartVal, smartDetail) = HardwareService.SmartSummary();

                    foreach (var d in disks)
                        o.WithReading(d.Model, $"{d.SizeGb:0.#} GB · {d.Interface} · {d.Status}");
                    foreach (var v in vols.Where(v => v.SizeGb > 0))
                        o.WithReading($"Volume {v.Letter}", $"{v.UsedPercent:0.#}% used");
                    o.WithReading("SMART", smartVal);

                    if (disks.Count == 0)
                        return o.Complete(TestStatus.Error, "Windows reports no physical disk.");

                    var failing = disks.Where(d => d.Health == DriveHealth.Failing).ToList();
                    if (failing.Count > 0)
                        return o.Complete(TestStatus.Failed,
                            $"{failing.Count} disk(s) report a failing Windows status.");

                    var unreadable = vols.Count(v => v.Readable == false);
                    if (unreadable > 0)
                        return o.Complete(TestStatus.Warning,
                            $"{unreadable} volume(s) could not be read in this session.");

                    // Passed on the OS summary only - the wording must say so.
                    return smartOk && smartVal.Equals("OK", StringComparison.OrdinalIgnoreCase)
                        ? o.Complete(TestStatus.Passed,
                            $"{disks.Count} disk(s) read; SMART summary OK (OS-level verdict only, not raw attributes).")
                        : o.Complete(TestStatus.Warning,
                            $"Disk status read, but SMART summary is '{smartVal}'.");
                }

                case "battery":
                {
                    var b = HardwareService.Battery();
                    o.WithReading("Charge", $"{b.ChargePercent} %");
                    o.WithReading("Power source", b.OnAc ? (b.Charging ? "AC, charging" : "AC, not charging") : "battery");
                    o.WithReading("Design capacity", b.DesignMwH is { } d ? $"{d:0} mWh" : "Unavailable");
                    o.WithReading("Full-charge capacity", b.FullChargeMwH is { } f ? $"{f:0} mWh" : "Unavailable");
                    o.WithReading("Wear", b.WearPercent is { } w ? $"{w:0.#} %" : "Unavailable");

                    if (b.ChargePercent <= 0 && !b.OnAc)
                        return o.Complete(TestStatus.Warning,
                            "Battery reports 0 % on battery power - it may not hold a charge.");
                    if (b.WearPercent is { } wear && wear >= 40)
                        return o.Complete(TestStatus.Warning,
                            $"Wear is {wear:0.#} % - well above the usual replacement guidance.");
                    return b.WearPercent is null
                        ? o.Complete(TestStatus.Passed,
                            $"Charge {b.ChargePercent} %; wear could not be calculated (capacities not exposed).")
                        : o.Complete(TestStatus.Passed,
                            $"Charge {b.ChargePercent} %, wear {b.WearPercent:0.#} % (measured from both capacities).");
                }

                case "usb":
                {
                    var usb = HardwareService.UsbInventory();
                    int problems = usb.Count(d => d.ErrorCode != 0);
                    foreach (var d in usb.Take(25))
                        o.WithReading(d.Name, d.ErrorCode == 0 ? "no problem" : $"error {d.ErrorCode}");

                    if (usb.Count == 0)
                        return o.Complete(TestStatus.Warning,
                            "Windows reports no USB devices or controllers.");
                    return problems > 0
                        ? o.Complete(TestStatus.Warning,
                            $"{problems} of {usb.Count} USB entr(ies) report a problem code.")
                        : o.Complete(TestStatus.Passed,
                            $"{usb.Count} USB entr(ies) enumerated, none with a problem code. " +
                            "Enumeration only - a port test still needs a known-good device.");
                }

                case "bluetooth":
                {
                    var devices = ConnectivityService.AdaptersAndRadios();
                    bool radio = ConnectivityService.RadioPresent(devices);
                    foreach (var d in devices)
                        o.WithReading(d.Name, d.ErrorCode == 0 ? "ok" : $"error {d.ErrorCode}");

                    if (devices.Count == 0)
                        return o.Complete(TestStatus.Unsupported,
                            "Windows reports no Bluetooth stack entries.");
                    return radio
                        ? o.Complete(TestStatus.Passed,
                            "A Bluetooth radio adapter is present and reports no problem.")
                        : o.Complete(TestStatus.Warning,
                            "Bluetooth entries exist but no radio adapter was found - only protocol nodes.");
                }

                case "network":
                {
                    var adapters = ConnectivityService.Adapters();
                    foreach (var a in adapters)
                    {
                        o.WithReading(a.Description, a.Mac);
                        o.WithReading("  IP", a.Addresses.Count > 0 ? string.Join(", ", a.Addresses) : "none");
                        o.WithReading("  gateway", a.Gateways.Count > 0 ? string.Join(", ", a.Gateways) : "none");
                        o.WithReading("  DNS", a.DnsServers.Count > 0 ? string.Join(", ", a.DnsServers) : "none");
                    }

                    if (adapters.Count == 0)
                        return o.Complete(TestStatus.Warning,
                            "No IP-enabled adapter is reported by Windows.");
                    if (adapters.All(a => a.Addresses.Count == 0))
                        return o.Complete(TestStatus.Warning,
                            "An adapter is present but holds no IP address.");

                    if (!includeNetworkProbe)
                        return o.Complete(TestStatus.Passed,
                            $"{adapters.Count} adapter(s) read. No probe was sent - that is an opt-in.");

                    var probe = await ConnectivityService.ProbeAsync(includeInternet: false, includeDns: true)
                        .ConfigureAwait(false);
                    foreach (var line in probe.Evidence) o.WithReading("evidence", line);
                    return probe.Domain switch
                    {
                        FaultDomain.Healthy => o.Complete(TestStatus.Passed, probe.Verdict),
                        FaultDomain.Router => o.Complete(TestStatus.Failed, probe.Verdict),
                        FaultDomain.Dns => o.Complete(TestStatus.Failed, probe.Verdict),
                        _ => o.Complete(TestStatus.Warning, probe.Verdict),
                    };
                }

                case "thermal":
                {
                    var temp = WindowsApi.CpuTemperatureC();
                    var clock = WindowsApi.CpuClockMHz();
                    var max = WindowsApi.CpuMaxClockMHz();
                    o.WithReading("CPU clock", clock is { } c ? $"{c:0} MHz" : "Unavailable");
                    o.WithReading("Max clock", max is { } m ? $"{m:0} MHz" : "Unavailable");
                    o.WithReading("CPU temperature", temp is { } t ? $"{t:0.#} °C" : "Unavailable");

                    if (temp is null)
                        return o.Complete(TestStatus.Unsupported,
                            "CPU temperature is not readable in this session (firmware hides it, or elevation is needed). " +
                            "No thermal reading is invented.");
                    return o.Complete(TestStatus.Passed,
                        $"Temperature readable: {temp:0.#} °C.");
                }

                default:
                    return o.Complete(TestStatus.Unsupported,
                        $"No automation is defined for '{step.Name}'.");
            }
        }, ct).ConfigureAwait(false);
    }
}
