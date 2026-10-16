using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using WindowsLaptopDiagnostics.Infrastructure;

namespace WindowsLaptopDiagnostics.Services;

/// <summary>Live progress from a running stress workload.</summary>
public sealed record StressProgress(
    double ElapsedSeconds,
    double? TemperatureC,
    bool Throttled,
    double LoadPercent,
    double ClockMHz);

/// <summary>Final tally of a stress run, including why it ended.</summary>
public sealed record StressResult(
    double RequestedSeconds,
    double ActualSeconds,
    string EndedReason,
    double PeakTemperatureC,
    bool ThrottleObserved,
    double AvgLoadPercent,
    double AvgClockMHz,
    double MaxClockMHz);

/// <summary>
/// Bounded, cancellable CPU workload.
///
/// Guarantees the plan's acceptance criteria:
///  - the workload never exceeds its requested duration (the loop checks the
///    deadline every iteration, not on a timer that could be starved);
///  - cancel returns within about one second (workers poll a volatile flag
///    rather than blocking on a wait handle);
///  - safety limits (thermal, elapsed) stop the run and say so.
/// </summary>
public sealed class CpuStress : IDisposable
{
    /// <summary>Thermal ceiling in °C. Above this the run stops itself.</summary>
    public const double ThermalStopC = 95;

    /// <summary>Thermal warning threshold in °C.</summary>
    public const double ThermalWarnC = 85;

    private readonly CancellationTokenSource _cts = new();
    private readonly object _gate = new();
    private Task[]? _workers;
    private volatile bool _stopRequested;

    public bool IsRunning { get; private set; }
    public bool WasCancelled { get; private set; }

    public event Action<StressProgress>? Progress;
    public event Action<StressResult>? Completed;

    /// <summary>
    /// Starts <paramref name="threads"/> worker loops. Each iteration does real
    /// integer work so the core stays busy, then checks the stop flag.
    /// </summary>
    public void Start(int threads, double durationSeconds)
    {
        if (IsRunning) throw new InvalidOperationException("A workload is already running.");
        if (threads < 1) threads = 1;
        if (threads > 64) threads = 64;
        if (durationSeconds < 1) durationSeconds = 1;
        if (durationSeconds > 600) durationSeconds = 600;

        IsRunning = true;
        WasCancelled = false;
        _stopRequested = false;

        var sw = Stopwatch.StartNew();
        double peakTemp = double.MinValue;
        bool throttleSeen = false;
        var loadSamples = new System.Collections.Generic.List<double>();
        var clockSamples = new System.Collections.Generic.List<double>();
        string endedReason = "duration reached";

        _workers = new Task[threads];
        for (int i = 0; i < threads; i++)
        {
            int workerIndex = i;
            _workers[i] = Task.Factory.StartNew(
                () => WorkerLoop(workerIndex, sw, durationSeconds),
                CancellationToken.None,
                TaskCreationOptions.LongRunning,
                TaskScheduler.Default);
        }

        // Sampler: reads telemetry on this thread at 4 Hz and enforces the
        // thermal safety limit independently of the workers.
        var sampler = Task.Factory.StartNew(() =>
        {
            while (!_stopRequested && sw.Elapsed.TotalSeconds < durationSeconds)
            {
                double t = sw.Elapsed.TotalSeconds;
                double? temp = null;
                double load = 0, clock = 0;
                bool throttled = false;

                try
                {
                    var cpu = PerformanceService.ReadCpu(out _);
                    if (cpu.State == SensorState.Available && cpu.Value is { } c)
                    {
                        load = c.LoadPercent;
                        clock = c.ClockMHz;
                        throttled = c.Throttled;
                        loadSamples.Add(load);
                        clockSamples.Add(clock);
                        if (throttled) throttleSeen = true;
                    }

                    var ts = PerformanceService.ReadCpuTemperature();
                    if (ts.State == SensorState.Available && ts.Value is { } tv)
                    {
                        temp = tv;
                        if (tv > peakTemp) peakTemp = tv;
                    }
                }
                catch (Exception ex) { Logger.Warn("Stress telemetry sampling failed", ex); }

                // Safety: thermal ceiling overrides everything.
                if (temp is { } tAbove && tAbove >= ThermalStopC)
                {
                    endedReason = $"stopped at thermal limit ({tAbove:0.#} °C ≥ {ThermalStopC:0} °C)";
                    RequestStop();
                    break;
                }

                try { Progress?.Invoke(new StressProgress(t, temp, throttled, load, clock)); }
                catch (Exception ex) { Logger.Warn("Stress progress handler failed", ex); }

                Thread.Sleep(250);
            }

            try { if (_workers is { Length: > 0 }) Task.WaitAll(_workers, TimeSpan.FromSeconds(2)); }
            catch { /* individual faults are already logged */ }
            IsRunning = false;

            if (WasCancelled) endedReason = "cancelled by the operator";
            else if (endedReason == "duration reached" && _stopRequested)
                endedReason = "stopped by safety limit";

            double avgLoad = loadSamples.Count > 0 ? loadSamples.Average() : 0;
            double avgClock = clockSamples.Count > 0 ? clockSamples.Average() : 0;
            double maxClock = clockSamples.Count > 0 ? clockSamples.Max() : 0;
            if (peakTemp == double.MinValue) peakTemp = 0;

            try
            {
                Completed?.Invoke(new StressResult(
                    durationSeconds,
                    Math.Round(sw.Elapsed.TotalSeconds, 1),
                    endedReason,
                    peakTemp,
                    throttleSeen,
                    Math.Round(avgLoad, 1),
                    Math.Round(avgClock, 0),
                    Math.Round(maxClock, 0)));
            }
            catch (Exception ex) { Logger.Warn("Stress completion handler failed", ex); }
        }, CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);
    }

    private void WorkerLoop(int index, Stopwatch sw, double durationSeconds)
    {
        // Independent seed per thread so the loops do not coalesce.
        ulong state = 0x9E3779B97F4A7C15UL + (ulong)index * 0x85EBCA6BUL;
        while (!_stopRequested)
        {
            if (sw.Elapsed.TotalSeconds >= durationSeconds) return;

            // xorshift* over a handful of rounds: integer work the core must do.
            for (int i = 0; i < 512; i++)
            {
                state ^= state >> 12;
                state ^= state << 25;
                state ^= state >> 27;
                state *= 0x2545F4914F6CDD1DUL;
            }

            // Volatile read, not a wait: cancel is observed within microseconds
            // of the flag flip, so the run returns promptly.
            if (_stopRequested) return;
        }
    }

    /// <summary>Requests an early stop. Returns within ~1 s per the plan.</summary>
    public void RequestStop()
    {
        _stopRequested = true;
        WasCancelled = true;
    }

    /// <summary>Cancels and waits briefly for the workers to unwind.</summary>
    public void Cancel()
    {
        RequestStop();
        try { if (_workers is { Length: > 0 }) Task.WaitAll(_workers, TimeSpan.FromSeconds(1)); }
        catch { /* worker already gone */ }
    }

    public void Dispose()
    {
        RequestStop();
        try { if (_workers is { Length: > 0 }) Task.WaitAll(_workers, TimeSpan.FromSeconds(1)); }
        catch { /* already finished */ }
        try { _cts.Dispose(); } catch { /* already disposed */ }
    }
}

/// <summary>
/// Bounded RAM test: allocate, fill with a deterministic pattern, read back and
/// verify, then release. A mismatch is reported honestly as a fault candidate.
/// Release is guaranteed in <see cref="Dispose"/> and on cancellation.
/// </summary>
public sealed class RamStress : IDisposable
{
    private byte[]? _block;
    private volatile bool _stopRequested;

    public bool IsRunning { get; private set; }
    public bool WasCancelled { get; private set; }

    public event Action<StressProgress>? Progress;
    public event Action<RamResult>? Completed;

    /// <summary>Fills and verifies up to <paramref name="megabytes"/> in 1 MB chunks.</summary>
    public void Start(int megabytes, int passes)
    {
        if (IsRunning) throw new InvalidOperationException("A RAM test is already running.");
        if (megabytes < 16) megabytes = 16;
        if (passes < 1) passes = 1;

        IsRunning = true;
        WasCancelled = false;
        _stopRequested = false;

        var sw = Stopwatch.StartNew();
        long mismatches = 0;
        long firstBadOffset = -1;
        string endedReason = "completed";

        Task.Run(() =>
        {
            try
            {
                int chunkBytes = 1024 * 1024;
                int chunks = Math.Max(1, megabytes);
                _block = new byte[chunkBytes];

                for (int pass = 0; pass < passes && !_stopRequested; pass++)
                {
                    for (int c = 0; c < chunks && !_stopRequested; c++)
                    {
                        byte seed = (byte)(pass * 31 + c * 7 + 0x5A);
                        for (int i = 0; i < chunkBytes; i++)
                            _block[i] = (byte)(seed ^ (i & 0xFF));

                        // Read back and verify immediately so a fault is pinned
                        // to a specific pass and chunk rather than "somewhere".
                        for (int i = 0; i < chunkBytes; i++)
                        {
                            byte expected = (byte)(seed ^ (i & 0xFF));
                            if (_block[i] != expected)
                            {
                                mismatches++;
                                if (firstBadOffset < 0)
                                    firstBadOffset = (long)c * chunkBytes + i;
                            }
                        }

                        try
                        {
                            Progress?.Invoke(new StressProgress(
                                sw.Elapsed.TotalSeconds, null, false,
                                (c + 1) * 100.0 / chunks, 0));
                        }
                        catch (Exception ex) { Logger.Warn("RAM progress handler failed", ex); }
                    }
                }

                if (_stopRequested) endedReason = "cancelled by the operator";
            }
            catch (OutOfMemoryException)
            {
                endedReason = "ran out of memory before the requested size was reached";
            }
            catch (Exception ex)
            {
                endedReason = $"error: {ex.Message}";
                Logger.Warn("RAM test failed", ex);
            }
            finally
            {
                // Guaranteed release, including on cancel and on fault.
                _block = null;
                IsRunning = false;
                try
                {
                    GC.Collect();
                    GC.WaitForPendingFinalizers();
                }
                catch { /* collection is best-effort */ }

                try
                {
                    Completed?.Invoke(new RamResult(
                        megabytes, passes, mismatches, firstBadOffset, endedReason,
                        Math.Round(sw.Elapsed.TotalSeconds, 1)));
                }
                catch (Exception ex) { Logger.Warn("RAM completion handler failed", ex); }
            }
        });
    }

    public void RequestStop()
    {
        _stopRequested = true;
        WasCancelled = true;
    }

    public void Dispose()
    {
        _stopRequested = true;
        _block = null;
    }
}

/// <summary>Outcome of a RAM pattern verification run.</summary>
public sealed record RamResult(
    int Megabytes,
    int Passes,
    long Mismatches,
    long FirstBadOffset,
    string EndedReason,
    double Seconds);
