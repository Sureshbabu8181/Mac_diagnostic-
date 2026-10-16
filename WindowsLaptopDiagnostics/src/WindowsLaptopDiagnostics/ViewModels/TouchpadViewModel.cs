using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using WindowsLaptopDiagnostics.Core;
using WindowsLaptopDiagnostics.Infrastructure;
using WindowsLaptopDiagnostics.Services;

namespace WindowsLaptopDiagnostics.ViewModels;

/// <summary>
/// Pointer-input diagnostic: live X/Y over a defined test surface, movement
/// trail, left/right click counts, drag and wheel checks.
///
/// Honesty: a moving pointer proves *pointer* input. Touchpad-specific
/// attribution is only claimed when Windows reports a touchpad device and the
/// source can be identified; otherwise the result is labelled general
/// mouse/pointer input.
/// </summary>
public sealed class TouchpadViewModel : PageViewModelBase
{
    private const int MaxTrailPoints = 240;

    private readonly List<Point> _trail = new();

    public TouchpadViewModel()
    {
        ResetCommand = new RelayCommand(Reset);
        ClearTrailCommand = new RelayCommand(() => { _trail.Clear(); RedrawTrailRequested?.Invoke(); });
        ConfirmCommand = new RelayCommand(() => TouchpadConfirmed = true);
        UnconfirmCommand = new RelayCommand(() => TouchpadConfirmed = false);
        LoadDevices();
    }

    public override string Title => "Touchpad & Mouse";

    // ---- live coordinates ----
    private double _x;
    public double X { get => _x; set => SetProperty(ref _x, value); }

    private double _y;
    public double Y { get => _y; set => SetProperty(ref _y, value); }

    private string _coordsText = "Move the pointer inside the test surface";
    public string CoordsText { get => _coordsText; private set => SetProperty(ref _coordsText, value); }

    // ---- counters ----
    private int _leftClicks;
    public int LeftClicks { get => _leftClicks; private set => SetProperty(ref _leftClicks, value); }

    private int _rightClicks;
    public int RightClicks { get => _rightClicks; private set => SetProperty(ref _rightClicks, value); }

    private int _moves;
    public int MoveEvents { get => _moves; private set => SetProperty(ref _moves, value); }

    private int _wheelNotches;
    public int WheelNotches { get => _wheelNotches; private set => SetProperty(ref _wheelNotches, value); }

    private int _dragOperations;
    public int DragOperations { get => _dragOperations; private set => SetProperty(ref _dragOperations, value); }

    private bool _isDragging;
    public bool IsDragging
    {
        get => _isDragging;
        private set
        {
            if (SetProperty(ref _isDragging, value))
                OnPropertyChanged(nameof(DragStateText));
        }
    }

    public string DragStateText => IsDragging ? "Dragging…" : (DragOperations > 0 ? "Drag completed" : "Not dragging");

    private double _pathLength;
    public double PathLength
    {
        get => _pathLength;
        private set
        {
            if (SetProperty(ref _pathLength, value))
                OnPropertyChanged(nameof(PathText));
        }
    }

    public string PathText => $"{PathLength:0} px travelled";

    // ---- coverage / checks ----
    private bool _movedHorizontally;
    private bool _movedVertically;

    public bool HasMovedBothAxes => _movedHorizontally && _movedVertically;

    private bool _boundsReached;
    public bool BoundsReached
    {
        get => _boundsReached;
        private set
        {
            if (SetProperty(ref _boundsReached, value))
                OnPropertyChanged(nameof(Checklist));
        }
    }

    private bool _leftConfirmed;

    public bool TouchpadConfirmed
    {
        get => _leftConfirmed;
        set
        {
            if (SetProperty(ref _leftConfirmed, value))
                OnPropertyChanged(nameof(Checklist));
        }
    }

    /// <summary>Live checklist; every row is a real observation, never assumed.</summary>
    public IReadOnlyList<string> Checklist
    {
        get
        {
            var rows = new List<string>
            {
                Mark(_moves > 0, "Pointer movement received"),
                Mark(_movedHorizontally && _movedVertically, "Movement on both X and Y axes"),
                Mark(LeftClicks > 0, $"Left click received ({LeftClicks})"),
                Mark(RightClicks > 0, $"Right click received ({RightClicks})"),
                Mark(WheelNotches > 0, $"Scroll wheel/notch received ({WheelNotches})"),
                Mark(DragOperations > 0, $"Drag performed ({DragOperations})"),
                Mark(_boundsReached, "Pointer reached the test surface edges"),
            };
            return rows;
        }
    }

    private static string Mark(bool ok, string text) => (ok ? "✓  " : "○  ") + text;

    // ---- source attribution (honest) ----
    private string _pointerSource = "Unknown";
    public string PointerSource
    {
        get => _pointerSource;
        private set
        {
            if (SetProperty(ref _pointerSource, value))
                OnPropertyChanged(nameof(SourceExplanation));
        }
    }

    private string _sourceExplanation = "";
    public string SourceExplanation { get => _sourceExplanation; private set => SetProperty(ref _sourceExplanation, value); }

    private List<string> _pointingDevices = new();
    public List<string> PointingDevices
    {
        get => _pointingDevices;
        private set => SetProperty(ref _pointingDevices, value);
    }

    public ICommand ResetCommand { get; }
    public ICommand ClearTrailCommand { get; }
    public ICommand ConfirmCommand { get; }
    public ICommand UnconfirmCommand { get; }

    /// <summary>Raised when the trail needs repainting.</summary>
    public event Action? RedrawTrailRequested;
    public IReadOnlyList<Point> Trail => _trail;

    public override void OnActivated() => LoadDevices();

    public override void OnDeactivated()
    {
        // Stop tracking so no background observation continues after leaving.
        IsDragging = false;
    }

    private void LoadDevices()
    {
        _ = Task.Run(() =>
        {
            var rows = WindowsApi.PointingDevices();
            var names = rows
                .Select(r => r.GetValueOrDefault("Name")?.ToString())
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .Select(n => n!.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            PointingDevices = names.Count > 0 ? names : new List<string> { "No pointing device reported by Windows" };

            bool touchpadPresent = rows.Any(r =>
            {
                var id = r.GetValueOrDefault("PNPDeviceID")?.ToString() ?? "";
                var name = r.GetValueOrDefault("Name")?.ToString() ?? "";
                return id.Contains("HID", StringComparison.OrdinalIgnoreCase) &&
                       (name.Contains("touchpad", StringComparison.OrdinalIgnoreCase) ||
                        name.Contains("synaptics", StringComparison.OrdinalIgnoreCase) ||
                        name.Contains("elan", StringComparison.OrdinalIgnoreCase) ||
                        name.Contains("precision", StringComparison.OrdinalIgnoreCase));
            });

            PointerSource = touchpadPresent
                ? "Touchpad detected (attribution attempted)"
                : "General mouse/pointer input";

            SourceExplanation = touchpadPresent
                ? "Windows reports a touchpad-class pointing device. Movement seen here comes from the pointer stack; it cannot always be proven that a given event originated from the touchpad rather than an attached mouse. Treat confirmed touchpad hardware checks together with the manual step below."
                : "No touchpad-class device is reported by Windows, or its identity is not exposed. Any movement shown is general mouse/pointer input — this does NOT prove the built-in touchpad works.";
        });
    }

    // ------------------------------------------------------------------ //
    // Input handlers (called by the view)
    // ------------------------------------------------------------------ //

    public void OnPointerMove(Point p, Size surface)
    {
        X = p.X;
        Y = p.Y;
        MoveEvents = MoveEvents + 1;

        if (_trail.Count > 0)
        {
            var last = _trail[^1];
            PathLength = PathLength + Math.Sqrt(Math.Pow(p.X - last.X, 2) + Math.Pow(p.Y - last.Y, 2));
            if (Math.Abs(p.X - last.X) > 0.5 && !_movedHorizontally)
            {
                _movedHorizontally = true;
                OnPropertyChanged(nameof(Checklist));
            }
            if (Math.Abs(p.Y - last.Y) > 0.5 && !_movedVertically)
            {
                _movedVertically = true;
                OnPropertyChanged(nameof(Checklist));
            }
        }

        // Edge proximity counts as reaching the bounds.
        const double edge = 6;
        if (p.X <= edge || p.Y <= edge || p.X >= surface.Width - edge || p.Y >= surface.Height - edge)
        {
            if (!_boundsReached)
            {
                BoundsReached = true;
            }
        }

        _trail.Add(p);
        if (_trail.Count > MaxTrailPoints) _trail.RemoveRange(0, _trail.Count - MaxTrailPoints);

        RedrawTrailRequested?.Invoke();
    }

    public void OnLeftDown(Point p)
    {
        LeftClicks = LeftClicks + 1;
        _leftConfirmed = true;
        IsDragging = true;
        OnPropertyChanged(nameof(Checklist));
    }

    public void OnLeftUp(Point p)
    {
        if (IsDragging)
        {
            DragOperations = DragOperations + 1;
            IsDragging = false;
        }
        OnPropertyChanged(nameof(Checklist));
    }

    public void OnRightClick(Point p)
    {
        RightClicks = RightClicks + 1;
        OnPropertyChanged(nameof(Checklist));
    }

    public void OnWheel(int delta)
    {
        // Windows reports wheel delta in multiples of 120 per notch.
        int notches = (int)Math.Round(Math.Abs(delta) / 120.0, MidpointRounding.AwayFromZero);
        if (notches < 1) notches = 1;
        WheelNotches = WheelNotches + notches;
        OnPropertyChanged(nameof(Checklist));
    }

    public void OnPointerLeave()
    {
        if (IsDragging)
        {
            DragOperations = DragOperations + 1;
            IsDragging = false;
            OnPropertyChanged(nameof(Checklist));
        }
    }

    private void Reset()
    {
        _trail.Clear();
        X = 0; Y = 0;
        CoordsText = "Move the pointer inside the test surface";
        LeftClicks = 0; RightClicks = 0; MoveEvents = 0;
        WheelNotches = 0; DragOperations = 0;
        PathLength = 0;
        IsDragging = false;
        _movedHorizontally = _movedVertically = false;
        BoundsReached = false;
        OnPropertyChanged(nameof(Checklist));
        RedrawTrailRequested?.Invoke();
    }
}
