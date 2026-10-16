using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Windows.Data;
using System.Windows.Input;
using WindowsLaptopDiagnostics.Core;
using WindowsLaptopDiagnostics.Hardware;
using WindowsLaptopDiagnostics.Infrastructure;

namespace WindowsLaptopDiagnostics.ViewModels;

/// <summary>
/// A sidebar navigation entry. Selection state is observable so the RadioButton
/// can bind TwoWay (ConverterParameter cannot be a Binding in WPF).
/// When a user checks an item, the callback navigates to that page.
/// </summary>
public sealed class NavItem : ObservableObject
{
    private readonly Action<string>? _onSelected;
    private bool _isChecked;

    public NavItem(string key, string label, TestId? testId, string group, Action<string>? onSelected)
    {
        Key = key;
        Label = label;
        TestId = testId;
        Group = group;
        _onSelected = onSelected;
    }

    public string Key { get; }
    public string Label { get; }
    public TestId? TestId { get; }
    public string Group { get; }

    public bool IsChecked
    {
        get => _isChecked;
        set
        {
            if (!SetProperty(ref _isChecked, value)) return;
            if (value) _onSelected?.Invoke(Key);
        }
    }
}

/// <summary>
/// Base class for all page view models. Provides lifecycle hooks so a page can
/// start/stop work when navigated to/from (releasing resources, stopping polls).
/// </summary>
public abstract class PageViewModelBase : ObservableObject
{
    public abstract string Title { get; }

    /// <summary>Called when the page becomes active. Load data here.</summary>
    public virtual void OnActivated() { }

    /// <summary>Called when navigating away. Release resources/stop timers here.</summary>
    public virtual void OnDeactivated() { }
}

/// <summary>
/// Root view model: owns the sidebar, the device snapshot, and the active page.
/// </summary>
public sealed class MainViewModel : ObservableObject
{
    private readonly DeviceInfoService _device = new();
    private readonly Dictionary<string, PageViewModelBase> _pages;
    private readonly List<NavItem> _navItems;
    private PageViewModelBase? _activePage;
    private string _activeKey = "";
    private string _filter = "";

    /// <summary>Ordered sidebar definition: key, label, test id, group.</summary>
    private static readonly (string Key, string Label, TestId? Id, string Group)[] NavDefinitions =
    {
        ("overview",  "Overview",                 null,                  "General"),
        ("display",   "Display Test",             TestId.Display,        "Input & Display"),
        ("keyboard",  "Keyboard Test",            TestId.Keyboard,       "Input & Display"),
        ("touchpad",  "Touchpad & Mouse",         TestId.Touchpad,       "Input & Display"),
        ("speakers",  "Speakers & Headphones",    TestId.Speakers,       "Multimedia"),
        ("microphone","Microphone Test",          TestId.Microphone,     "Multimedia"),
        ("camera",    "Camera Test",              TestId.Camera,         "Multimedia"),
        ("cpu",       "CPU Stress Test",          TestId.CpuStress,      "Performance"),
        ("gpu",       "GPU Stress Test",          TestId.GpuStress,      "Performance"),
        ("ram",       "RAM Stress Test",          TestId.RamStress,      "Performance"),
        ("fan",       "Fan & Cooling",            TestId.Fan,            "Performance"),
        ("storage",   "SSD / HDD Health",         TestId.StorageHealth,  "Hardware"),
        ("battery",   "Battery & Charging",       TestId.Battery,        "Hardware"),
        ("thermal",   "Temperature & Sensors",    TestId.Thermal,        "Hardware"),
        ("network",   "Wi-Fi & Network",          TestId.Network,        "Connectivity"),
        ("bluetooth", "Bluetooth",                TestId.Bluetooth,      "Connectivity"),
        ("usb",       "USB & External Ports",     TestId.Usb,            "Connectivity"),
        ("system",    "System Information",       TestId.SystemInfo,     "System"),
        ("windows",   "Windows & Driver Health",  TestId.WindowsHealth,  "System"),
        ("auto",      "Automatic Diagnostics",    TestId.Auto,           "Workflow"),
        ("history",   "Test History & Reports",   TestId.History,        "Workflow"),
    };

    /// <summary>Honest descriptions for modules not yet implemented.</summary>
    private static readonly Dictionary<string, string> PlaceholderDescriptions = new(StringComparer.OrdinalIgnoreCase)
    {
        ["display"]    = "Full-screen colour, gradient, geometry and pixel-inspection patterns with auto-hiding overlay controls and multi-monitor selection.",
        ["keyboard"]   = "On-screen layout highlighting physical key-down/key-up events with tested-key coverage and counts.",
        ["touchpad"]   = "Live pointer X/Y coordinates, movement trail, left/right click counts and drag checks on a defined test surface.",
        ["speakers"]   = "Left / right / stereo / mono test tones routed to a selectable output device with immediate stop.",
        ["microphone"] = "Input-device selection, live waveform and level meter, record / play / delete of a user-initiated recording.",
        ["camera"]     = "Live camera preview with measured frame count, measured FPS and actual capture resolution.",
        ["cpu"]        = "Bounded, cancellable multi-threaded workload with duration, progress and available telemetry.",
        ["gpu"]        = "Bounded graphics-rendering workload with adapter telemetry where the driver exposes it.",
        ["ram"]        = "Bounded application-level allocation with pattern write/read verification and guaranteed cleanup.",
        ["fan"]        = "Cooling observation; controlled maximum-fan test only where a documented vendor-supported method exists.",
        ["storage"]    = "Drive inventory, interface, capacity, volume usage and available SMART / health data (read-only).",
        ["battery"]    = "Charge, power source, design vs full-charge capacity and wear estimate where exposed.",
        ["thermal"]    = "CPU / GPU temperature, fan RPM, clocks, utilization and throttling indicators where exposed.",
        ["network"]    = "Adapter state, IP configuration, gateway reachability, latency and connectivity checks.",
        ["bluetooth"]  = "Adapter availability and device discovery via the Windows Bluetooth stack.",
        ["usb"]        = "USB controller and device enumeration with a guided known-good-device manual check.",
        ["system"]     = "Processor, memory, graphics, storage, BIOS, Windows build and device inventory.",
        ["windows"]    = "Read-only Windows health, servicing state and driver-problem inspection.",
        ["auto"]       = "Runs a chosen subset of tests in a safe sequence, pausing for human observations.",
        ["history" ]   = "Stored results with search, filtering, detail inspection and CSV / HTML export.",
    };

    public MainViewModel()
    {
        _pages = BuildPages();

        _navItems = new List<NavItem>(NavDefinitions.Length);
        foreach (var d in NavDefinitions)
            _navItems.Add(new NavItem(d.Key, d.Label, d.Id, d.Group, NavigateTo));

        NavigateCommand = new RelayCommand(o => NavigateTo(o?.ToString() ?? ""));

        NavView = CollectionViewSource.GetDefaultView(_navItems);
        NavView.GroupDescriptions.Add(new PropertyGroupDescription(nameof(NavItem.Group)));
        NavView.Filter = o =>
            string.IsNullOrWhiteSpace(_filter) ||
            (o is NavItem n && n.Label.Contains(_filter.Trim(), StringComparison.OrdinalIgnoreCase));
        NavView.Refresh();

        // Selecting the first item drives the initial navigation + activation.
        _navItems[0].IsChecked = true;
    }

    public DeviceInfoService Device => _device;
    public IReadOnlyList<NavItem> NavItems => _navItems;

    /// <summary>Grouped, filterable view bound by the sidebar ItemsControl.</summary>
    public ICollectionView NavView { get; }

    public ICommand NavigateCommand { get; }

    public PageViewModelBase? ActivePage
    {
        get => _activePage;
        private set => SetProperty(ref _activePage, value);
    }

    public string ActiveKey
    {
        get => _activeKey;
        private set
        {
            if (SetProperty(ref _activeKey, value))
                OnPropertyChanged(nameof(IsOverview));
        }
    }

    public bool IsOverview => ActiveKey == "overview";

    /// <summary>Text used to filter sidebar items (search/filter requirement).</summary>
    public string Filter
    {
        get => _filter;
        set
        {
            if (SetProperty(ref _filter, value))
                NavView.Refresh();
        }
    }

    /// <summary>Navigate to a page key. Idempotent; deactivates the old page first.</summary>
    public void NavigateTo(string key)
    {
        if (string.IsNullOrWhiteSpace(key)) return;
        if (string.Equals(_activeKey, key, StringComparison.OrdinalIgnoreCase) && _activePage is not null)
            return;
        if (!_pages.TryGetValue(key, out var page))
        {
            // Keep selection honest when a destination does not exist yet.
            foreach (var n in _navItems)
                n.IsChecked = string.Equals(n.Key, _activeKey, StringComparison.OrdinalIgnoreCase);
            return;
        }

        _activePage?.OnDeactivated();
        ActiveKey = key;
        foreach (var n in _navItems)
            n.IsChecked = string.Equals(n.Key, key, StringComparison.OrdinalIgnoreCase);
        ActivePage = page;
        page.OnActivated();
    }

    private Dictionary<string, PageViewModelBase> BuildPages()
    {
        var pages = new Dictionary<string, PageViewModelBase>(StringComparer.OrdinalIgnoreCase)
        {
            ["overview"] = new OverviewViewModel(_device, this),
            ["display"]  = new DisplayViewModel(),
            ["keyboard"] = new KeyboardViewModel(),
            ["touchpad"] = new TouchpadViewModel(),
            ["speakers"] = new SpeakersViewModel(),
            ["microphone"] = new MicrophoneViewModel(),
            ["camera"]   = new CameraViewModel(),
            ["cpu"]      = new CpuStressViewModel(),
            ["gpu"]      = new GpuStressViewModel(),
            ["ram"]      = new RamStressViewModel(),
            ["fan"]      = new FanViewModel(),
            ["thermal"]  = new ThermalViewModel(),
        };

        foreach (var d in NavDefinitions)
        {
            if (pages.ContainsKey(d.Key)) continue;
            var desc = PlaceholderDescriptions.TryGetValue(d.Key, out var s)
                ? s
                : "This module has not been implemented yet.";
            pages[d.Key] = new PlaceholderViewModel(d.Label, desc);
        }

        return pages;
    }
}
