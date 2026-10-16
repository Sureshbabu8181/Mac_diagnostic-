using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Input;
using WindowsLaptopDiagnostics.Core;
using WindowsLaptopDiagnostics.Infrastructure;
using WindowsLaptopDiagnostics.Services;

namespace WindowsLaptopDiagnostics.ViewModels;

/// <summary>A named display test pattern and the brush that paints it.</summary>
public sealed record DisplayPattern(string Key, string Name, string Kind, string? Description);

/// <summary>
/// Display diagnostics: real mode/monitor inventory plus a full-screen
/// pattern session driven by DisplayView. Dead/stuck pixel checking is a
/// MANUAL visual inspection — the app never claims automated pixel detection.
/// </summary>
public sealed class DisplayViewModel : PageViewModelBase
{
    public DisplayViewModel()
    {
        StartCommand = new RelayCommand(StartSession, () => !IsRunning);
        StopCommand = new RelayCommand(() => IsRunning = false, () => IsRunning);
        ConfirmPixelsCommand = new RelayCommand(() => ManualPixelsConfirmed = true);
        ResetManualCommand = new RelayCommand(() => ManualPixelsConfirmed = false);
    }

    public override string Title => "Display Test";

    // ---- inventory ----
    private List<WindowsApi.DisplayHead> _displays = new();
    public List<WindowsApi.DisplayHead> Displays
    {
        get => _displays;
        private set
        {
            if (SetProperty(ref _displays, value))
                OnPropertyChanged(nameof(DisplayCountText));
        }
    }

    private WindowsApi.DisplayHead? _selectedDisplay;
    public WindowsApi.DisplayHead? SelectedDisplay
    {
        get => _selectedDisplay;
        set
        {
            if (SetProperty(ref _selectedDisplay, value))
                OnPropertyChanged(nameof(ModeSummary));
        }
    }

    public string ModeSummary => SelectedDisplay is { } d && d.Width > 0
        ? $"{d.Width} x {d.Height} @ {d.RefreshHz} Hz"
        : "Mode unavailable";

    public string DisplayCountText => Displays.Count switch
    {
        0 => "No display head detected",
        1 => "Single display",
        _ => $"{Displays.Count} displays attached",
    };

    private string _modeList = "";
    public string ModeList { get => _modeList; private set => SetProperty(ref _modeList, value); }

    // ---- session state ----
    private bool _isRunning;
    public bool IsRunning
    {
        get => _isRunning;
        set
        {
            if (SetProperty(ref _isRunning, value))
            {
                OnPropertyChanged(nameof(IsIdle));
                if (!value) SessionEndedAt = DateTime.Now;
            }
        }
    }

    public bool IsIdle => !IsRunning;

    private int _patternIndex;
    public int PatternIndex
    {
        get => _patternIndex;
        set
        {
            if (SetProperty(ref _patternIndex, value))
            {
                OnPropertyChanged(nameof(CurrentPattern));
                OnPropertyChanged(nameof(PatternPosition));
                OnPropertyChanged(nameof(PatternName));
            }
        }
    }

    private bool _paused;
    public bool Paused
    {
        get => _paused;
        set => SetProperty(ref _paused, value);
    }

    private DateTime? _sessionEndedAt;
    public DateTime? SessionEndedAt { get => _sessionEndedAt; private set => SetProperty(ref _sessionEndedAt, value); }

    public IReadOnlyList<DisplayPattern> Patterns { get; } = new[]
    {
        new DisplayPattern("black",    "Black",            "Solid",     "Hunt for stuck/bright pixels and backlight bleed."),
        new DisplayPattern("white",    "White",            "Solid",     "Hunt for dead/dark pixels and uniformity tints."),
        new DisplayPattern("red",      "Red",              "Solid",     "Red subpixel check — stuck red subpixels show as bright."),
        new DisplayPattern("green",    "Green",            "Solid",     "Green subpixel check."),
        new DisplayPattern("blue",     "Blue",             "Solid",     "Blue subpixel check."),
        new DisplayPattern("gray50",   "Mid Gray (50%)",   "Solid",     "Uniformity and banding check at mid level."),
        new DisplayPattern("gray16",   "Gray 16",          "Solid",     "Shadow detail / near-black uniformity."),
        new DisplayPattern("gray235",  "Gray 235",         "Solid",     "Highlight detail / near-white uniformity."),
        new DisplayPattern("gradient", "Grayscale Ramp",   "Gradient",  "Banding and gradient smoothness across 0-255."),
        new DisplayPattern("rgbgrad",  "Colour Ramp",      "Gradient",  "R/G/B primary ramps — look for steps or dead bands."),
        new DisplayPattern("contrast", "Contrast Steps",   "Gradient",  "Discrete contrast steps from black to white."),
        new DisplayPattern("checker",  "Checkerboard",     "Geometry",  "Sharpness, scaling and geometry; 1 px grid at edges."),
        new DisplayPattern("grid",     "Pixel Grid",       "Geometry",  "1-pixel grid/lines to spot scaling or focus issues."),
        new DisplayPattern("uniform",  "Uniformity Field", "Uniform",   "Brightness-uniformity inspection (mura, corners)."),
        new DisplayPattern("corners",  "Corner Marks",     "Uniform",   "Confirms the full panel area is addressed, no crop."),
    };

    public DisplayPattern CurrentPattern =>
        Patterns[Math.Clamp(PatternIndex, 0, Patterns.Count - 1)];

    public string PatternName => $"{CurrentPattern.Name}  ({PatternIndex + 1} / {Patterns.Count})";
    public string PatternPosition => $"{PatternIndex + 1} of {Patterns.Count}";

    private bool _manualPixelsConfirmed;
    public bool ManualPixelsConfirmed
    {
        get => _manualPixelsConfirmed;
        set
        {
            if (SetProperty(ref _manualPixelsConfirmed, value))
                OnPropertyChanged(nameof(ManualStatus));
        }
    }

    public string ManualStatus => ManualPixelsConfirmed
        ? "User confirmed: no dead or stuck pixels noticed"
        : "Manual inspection not confirmed";

    public ICommand StartCommand { get; }
    public ICommand StopCommand { get; }
    public ICommand ConfirmPixelsCommand { get; }
    public ICommand ResetManualCommand { get; }

    public void Next()
    {
        if (Patterns.Count == 0) return;
        PatternIndex = (PatternIndex + 1) % Patterns.Count;
    }

    public void Previous()
    {
        if (Patterns.Count == 0) return;
        PatternIndex = (PatternIndex - 1 + Patterns.Count) % Patterns.Count;
    }

    /// <summary>Raised when the user starts a full-screen session; the view opens the window.</summary>
    public event Action? SessionRequested;

    private void StartSession()
    {
        if (SelectedDisplay is not { } d)
            return;
        PatternIndex = 0;
        Paused = false;
        SessionRequested?.Invoke();
    }

    public override void OnActivated() => _ = LoadAsync();

    /// <summary>Called by the view when Esc exits full-screen.</summary>
    public void EndSession() => IsRunning = false;

    private async Task LoadAsync()
    {
        // EnumerateDisplays hits user32; keep it off the UI thread.
        var heads = await Task.Run(WindowsApi.EnumerateDisplays);
        Displays = heads;
        if (SelectedDisplay is null || !heads.Any(h => h.DeviceName == SelectedDisplay.DeviceName))
            SelectedDisplay = heads.FirstOrDefault(h => h.IsPrimary) ?? heads.FirstOrDefault();

        ModeList = SelectedDisplay is { } d
            ? DescribeModes(d)
            : "No display selected";
    }

    private static string DescribeModes(WindowsApi.DisplayHead d)
    {
        var modes = WindowsApi.SupportedDisplayModes(d.DeviceName);
        if (modes.Count == 0) return "Supported modes unavailable";
        var distinct = modes
            .Where(m => m.Width >= 640)
            .GroupBy(m => (m.Width, m.Height))
            .Select(g => (Width: g.Key.Width, Height: g.Key.Height, RefreshHz: g.Max(m => m.RefreshHz)))
            .OrderByDescending(m => m.Width * m.Height)
            .ThenByDescending(m => m.RefreshHz)
            .Take(10)
            .ToList();
        return string.Join("\n", distinct.Select(m =>
            $"{m.Width} x {m.Height} @ {m.RefreshHz} Hz"));
    }
}
