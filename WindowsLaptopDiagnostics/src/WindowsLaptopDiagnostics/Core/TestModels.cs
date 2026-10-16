using System;
using System.Collections.Generic;

namespace WindowsLaptopDiagnostics.Core;

/// <summary>
/// Consistent status vocabulary for every test. A test NEVER reports Passed
/// unless it genuinely executed and met its success criteria, or the user
/// explicitly confirmed an observation.
/// </summary>
public enum TestStatus
{
    NotRun,
    Ready,
    Running,
    Passed,
    Warning,
    Failed,
    Unsupported,
    Cancelled,
    Error,
}

public static class TestStatusExtensions
{
    public static bool IsTerminal(this TestStatus s) => s is
        TestStatus.Passed or TestStatus.Warning or TestStatus.Failed or
        TestStatus.Unsupported or TestStatus.Cancelled or TestStatus.Error;

    public static string Label(this TestStatus s) => s switch
    {
        TestStatus.NotRun => "Not Run",
        TestStatus.Ready => "Ready",
        TestStatus.Running => "Running",
        TestStatus.Passed => "Passed",
        TestStatus.Warning => "Warning",
        TestStatus.Failed => "Failed",
        TestStatus.Unsupported => "Unsupported",
        TestStatus.Cancelled => "Cancelled",
        TestStatus.Error => "Error",
        _ => s.ToString(),
    };

    /// <summary>Hex brush color used across the UI for a status.</summary>
    public static string ColorHex(this TestStatus s) => s switch
    {
        TestStatus.NotRun => "#64748b",
        TestStatus.Ready => "#38bdf8",
        TestStatus.Running => "#38bdf8",
        TestStatus.Passed => "#22c55e",
        TestStatus.Warning => "#f59e0b",
        TestStatus.Failed => "#ef4444",
        TestStatus.Unsupported => "#a855f7",
        TestStatus.Cancelled => "#94a3b8",
        TestStatus.Error => "#ef4444",
        _ => "#64748b",
    };
}

/// <summary>Dashboard groupings so tests are easy to identify.</summary>
public enum TestCategory
{
    Interactive,
    Performance,
    Health,
    System,
    Workflow,
}

public static class TestCategoryExtensions
{
    public static string Label(this TestCategory c) => c switch
    {
        TestCategory.Interactive => "Interactive Tests",
        TestCategory.Performance => "Performance & Stress",
        TestCategory.Health => "Hardware Health",
        TestCategory.System => "System & Connectivity",
        TestCategory.Workflow => "Workflow & Reports",
        _ => c.ToString(),
    };
}

/// <summary>Stable identifiers for every test module.</summary>
public enum TestId
{
    Display,
    Keyboard,
    Touchpad,
    Speakers,
    Microphone,
    Camera,
    Fan,
    CpuStress,
    GpuStress,
    RamStress,
    Battery,
    StorageHealth,
    Network,
    Bluetooth,
    Usb,
    SystemInfo,
    Thermal,
    WindowsHealth,
    Auto,
    History,
}

/// <summary>A single measured value with unit and source.</summary>
public sealed record Reading(string Name, string Value, string Unit = "", string Source = "")
{
    public string Display() => string.IsNullOrEmpty(Unit) ? Value : $"{Value} {Unit}";
}

/// <summary>Result of running (or attempting) a test.</summary>
public sealed class TestOutcome
{
    public TestId TestId { get; init; }
    public TestStatus Status { get; set; } = TestStatus.NotRun;
    public string Summary { get; set; } = "";
    public List<Reading> Readings { get; } = new();
    public List<string> Errors { get; } = new();
    public List<string> Warnings { get; } = new();
    public bool UserConfirmed { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? EndedAt { get; set; }
    public double? DurationSeconds { get; set; }

    public static TestOutcome Running(TestId id, string summary = "Running…") =>
        new() { TestId = id, Status = TestStatus.Running, Summary = summary };

    public TestOutcome WithReading(string name, string value, string unit = "", string source = "")
    {
        Readings.Add(new Reading(name, value, unit, source));
        return this;
    }

    public TestOutcome WithWarning(string warning)
    {
        Warnings.Add(warning);
        return this;
    }

    public TestOutcome WithError(string error)
    {
        Errors.Add(error);
        return this;
    }

    /// <summary>Stamp start/end and compute duration, returning this for chaining.</summary>
    public TestOutcome Complete(TestStatus status, string summary)
    {
        Status = status;
        Summary = summary;
        EndedAt = DateTime.UtcNow;
        if (StartedAt is { } s)
            DurationSeconds = (EndedAt.Value - s).TotalSeconds;
        return this;
    }
}
