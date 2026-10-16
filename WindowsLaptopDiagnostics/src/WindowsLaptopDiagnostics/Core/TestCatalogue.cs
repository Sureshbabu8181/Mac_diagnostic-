using System;
using System.Collections.Generic;

namespace WindowsLaptopDiagnostics.Core;

/// <summary>Static metadata the dashboard uses to render a labelled card.</summary>
public sealed record TestMeta(
    TestId Id,
    string Name,
    TestCategory Category,
    string Purpose,
    string Instructions,
    bool Automated = true,
    string? NeedsPermission = null);

/// <summary>
/// The full test catalogue: every test with a clear name, purpose and
/// instructions, grouped by category so they are easy to identify.
/// </summary>
public static class TestCatalogue
{
    public static readonly IReadOnlyList<TestMeta> All = new List<TestMeta>
    {
        // ---- Interactive Tests ----
        new(TestId.Display, "Display Test", TestCategory.Interactive,
            "Full-screen patterns to inspect for dead/stuck pixels and backlight bleed.",
            "Cycle colour/pattern screens; inspect for stuck pixels. Esc exits.", false),
        new(TestId.Keyboard, "Keyboard Test", TestCategory.Interactive,
            "Visual keyboard; keys highlight green as you press them.",
            "Press every key. Green = tested. No typed text is stored.", false),
        new(TestId.Touchpad, "Touchpad & Mouse", TestCategory.Interactive,
            "Live pointer X/Y, clicks and drag tracking on a test surface.",
            "Move, left/right-click and drag on the surface. Finish to exit.", false),
        new(TestId.Speakers, "Speakers & Headphones", TestCategory.Interactive,
            "Left/right/stereo/mono test tones routed per channel.",
            "Play each tone, listen, and confirm what you heard.", false),
        new(TestId.Microphone, "Microphone Test", TestCategory.Interactive,
            "Live input level; record, play back and delete a sample.",
            "Record your voice, play it back, then delete. Needs mic permission.", false,
            "microphone"),
        new(TestId.Camera, "Camera Test", TestCategory.Interactive,
            "Live camera preview with real frame count and measured FPS.",
            "Start the preview; confirm a clear image. Needs camera permission.", false,
            "camera"),

        // ---- Performance & Stress ----
        new(TestId.CpuStress, "CPU Stress Test", TestCategory.Performance,
            "Controlled CPU load with live utilisation and thermal warnings.",
            "Pick a duration and Start. Stop anytime. Warns at 90°C.", false),
        new(TestId.GpuStress, "GPU Stress Test", TestCategory.Performance,
            "Identifies GPU and runs a bounded render probe.",
            "Run the GPU probe. Live temp/usage need a vendor API.", false),
        new(TestId.RamStress, "RAM Stress Test", TestCategory.Performance,
            "Bounded memory allocation + integrity pattern verification.",
            "Choose a size within free memory; Start. Stop anytime.", false),
        new(TestId.Fan, "Fan & Cooling Test", TestCategory.Performance,
            "Cooling observation of temperature/clock/utilisation over 10s.",
            "Manual max-fan is Unsupported; this observes cooling instead.", false),

        // ---- Hardware Health ----
        new(TestId.Battery, "Battery & Charging", TestCategory.Health,
            "Charge level, charging state and design/full-charge capacity.",
            "Automated read-only check of power state.", true),
        new(TestId.StorageHealth, "SSD / HDD Health", TestCategory.Health,
            "Drive model, capacity, interface and SMART status (read-only).",
            "Automated read-only inventory. No writes to your drives.", true),
        new(TestId.Thermal, "Temperature & Sensors", TestCategory.Health,
            "CPU temperature, load, clock and fan RPM where exposed.",
            "Automated sensor read. Unsupported values are labelled.", true),

        // ---- System & Connectivity ----
        new(TestId.Network, "Wi-Fi & Network", TestCategory.System,
            "Adapter status, IP config, gateway and internet latency.",
            "Automated check incl. a latency probe.", true),
        new(TestId.Bluetooth, "Bluetooth Test", TestCategory.System,
            "Bluetooth radio presence and status.",
            "Automated adapter detection.", true),
        new(TestId.Usb, "USB & External Ports", TestCategory.System,
            "Enumerates connected USB devices.",
            "Automated enumeration. Physical port check needs a plug-in test.", true),
        new(TestId.SystemInfo, "System Information", TestCategory.System,
            "CPU, GPU, RAM, BIOS, motherboard, OS and serial.",
            "Automated inventory (read-only).", true),
        new(TestId.WindowsHealth, "Windows & Driver Health", TestCategory.System,
            "Device Manager problem codes and OS build.",
            "Automated read-only health check.", true),

        // ---- Workflow & Reports ----
        new(TestId.Auto, "Automatic Diagnostics", TestCategory.Workflow,
            "Run selected headless tests sequentially and build a report.",
            "Choose categories, run, then export a consolidated report.", true),
        new(TestId.History, "Test History & Reports", TestCategory.Workflow,
            "Review past runs and export reports.",
            "Open history to view, export or delete past runs.", true),
    };

    public static TestMeta? Find(TestId id)
    {
        foreach (var m in All)
            if (m.Id == id) return m;
        return null;
    }
}
