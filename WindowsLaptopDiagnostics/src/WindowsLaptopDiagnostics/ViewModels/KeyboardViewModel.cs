using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows.Input;
using WindowsLaptopDiagnostics.Infrastructure;

namespace WindowsLaptopDiagnostics.ViewModels;

public enum KeyState
{
    Untested,
    Pressed,
    Tested,
}

/// <summary>A single on-screen key with live state and press count.</summary>
public sealed class KeyModel : ObservableObject
{
    private KeyState _state = KeyState.Untested;
    private int _pressCount;
    private int _repeatCount;

    public KeyModel(string label, Key key, double width = 1.0)
    {
        Label = label;
        Key = key;
        Width = width;
    }

    public string Label { get; }
    public Key Key { get; }

    /// <summary>Relative width for layout (1.0 = standard unit key).</summary>
    public double Width { get; }

    public KeyState State
    {
        get => _state;
        set => SetProperty(ref _state, value);
    }

    public int PressCount
    {
        get => _pressCount;
        set => SetProperty(ref _pressCount, value);
    }

    public int RepeatCount
    {
        get => _repeatCount;
        set => SetProperty(ref _repeatCount, value);
    }

    public bool IsTested => State != KeyState.Untested;
}

/// <summary>
/// Interactive keyboard diagnostic.
///
/// Listens ONLY while this page is active, and records key identity (Key enum)
/// — never characters, never typed text, so no password or text can leak.
/// Coverage is measured honestly: a partial pass is reported as coverage %,
/// not as "Passed".
/// </summary>
public sealed class KeyboardViewModel : PageViewModelBase
{
    private readonly Dictionary<Key, KeyModel> _byKey = new();
    private bool _isMonitoring;

    public KeyboardViewModel()
    {
        Rows = BuildLayout();
        foreach (var row in Rows)
            foreach (var k in row)
                _byKey[k.Key] = k;

        ResetCommand = new RelayCommand(Reset);
        StartCommand = new RelayCommand(() => IsMonitoring = true, () => !IsMonitoring);
        StopCommand = new RelayCommand(() => IsMonitoring = false, () => IsMonitoring);
    }

    public override string Title => "Keyboard Test";

    /// <summary>Rows of keys as laid out on a standard ANSI keyboard.</summary>
    public IReadOnlyList<IReadOnlyList<KeyModel>> Rows { get; }

    public int TotalKeys => _byKey.Count;

    private int _testedCount;
    public int TestedCount
    {
        get => _testedCount;
        private set
        {
            if (SetProperty(ref _testedCount, value))
            {
                OnPropertyChanged(nameof(CoveragePercent));
                OnPropertyChanged(nameof(CoverageText));
            }
        }
    }

    public double CoveragePercent => TotalKeys == 0 ? 0 : TestedCount * 100.0 / TotalKeys;

    public string CoverageText => $"{TestedCount} / {TotalKeys} keys  ·  {CoveragePercent:0.0}% tested";

    private KeyModel? _lastKey;
    public KeyModel? LastKey
    {
        get => _lastKey;
        private set
        {
            if (SetProperty(ref _lastKey, value))
                OnPropertyChanged(nameof(LastKeyText));
        }
    }

    public string LastKeyText => LastKey is { } k
        ? $"{k.Label}  (Key.{k.Key}, {k.PressCount} press(es){(k.RepeatCount > 0 ? $", {k.RepeatCount} repeat(s)" : "")})"
        : "Press any key to begin";

    private bool _focusWarning;
    public bool FocusWarning
    {
        get => _focusWarning;
        set => SetProperty(ref _focusWarning, value);
    }

    /// <summary>Live monitoring only runs while the test page is active.</summary>
    public bool IsMonitoring
    {
        get => _isMonitoring;
        set
        {
            if (SetProperty(ref _isMonitoring, value))
            {
                OnPropertyChanged(nameof(StatusText));
                if (!value) ReleaseAll();
            }
        }
    }

    public string StatusText => IsMonitoring
        ? "Monitoring key events — focus this window and press keys"
        : "Monitoring stopped";

    private int _repeats;
    public int RepeatEvents
    {
        get => _repeats;
        private set => SetProperty(ref _repeats, value);
    }

    private int _totalPressesObserved;
    public int TotalPressesObserved
    {
        get => _totalPressesObserved;
        private set => SetProperty(ref _totalPressesObserved, value);
    }

    public ICommand ResetCommand { get; }
    public ICommand StartCommand { get; }
    public ICommand StopCommand { get; }

    /// <summary>
    /// Keys Windows/driver/firmware typically consumes before an application
    /// sees them. Shown so the user knows these cannot be verified here.
    /// </summary>
    public static IReadOnlyList<string> UncapturableKeys { get; } = new[]
    {
        "Win (Windows logo) combos — intercepted by the shell",
        "Ctrl + Alt + Del — handled by the secure desktop, never reaches apps",
        "Alt + Tab / Alt + F4 window switching — shell-owned",
        "Fn + brightness / media / vendor hotkeys — often handled in EC/firmware",
        "Some laptop special keys report no keycode through the standard stack",
        "Key identity only is recorded; typed characters and text are never captured",
    };

    // ------------------------------------------------------------------ //
    // Event handlers (called by the view while this page is active)
    // ------------------------------------------------------------------ //

    public void OnKeyDown(Key key, bool isRepeat)
    {
        if (!IsMonitoring) return;

        if (isRepeat)
        {
            // Auto-repeat is tracked separately and never re-marks coverage.
            RepeatEvents++;
            if (_byKey.TryGetValue(key, out var held))
                held.RepeatCount++;
            return;
        }

        TotalPressesObserved++;
        if (!_byKey.TryGetValue(key, out var model)) return;

        model.State = KeyState.Pressed;
        model.PressCount++;
        LastKey = model;
        RecalculateCoverage();
    }

    public void OnKeyUp(Key key)
    {
        if (!_byKey.TryGetValue(key, out var model)) return;
        // Released: the key is now fully covered (down observed + up observed).
        if (model.State == KeyState.Pressed)
        {
            model.State = KeyState.Tested;
            RecalculateCoverage();
        }
    }

    /// <summary>
    /// Focus was lost: Windows will not deliver the matching KeyUp, so any key
    /// left Pressed must be released to avoid a visually stuck key.
    /// </summary>
    public void ReleaseAll()
    {
        bool changed = false;
        foreach (var k in _byKey.Values)
        {
            if (k.State != KeyState.Pressed) continue;
            k.State = KeyState.Tested;
            changed = true;
        }
        if (changed) RecalculateCoverage();
    }

    private void RecalculateCoverage()
    {
        TestedCount = _byKey.Values.Count(k => k.State != KeyState.Untested);
    }

    private void Reset()
    {
        foreach (var k in _byKey.Values)
        {
            k.State = KeyState.Untested;
            k.PressCount = 0;
            k.RepeatCount = 0;
        }
        TestedCount = 0;
        RepeatEvents = 0;
        TotalPressesObserved = 0;
        LastKey = null;
    }

    public override void OnDeactivated()
    {
        // Stop monitoring and clear any stuck visuals when leaving the page.
        IsMonitoring = false;
        FocusWarning = false;
    }

    // ------------------------------------------------------------------ //
    // Layout
    // ------------------------------------------------------------------ //

    private static KeyModel K(string label, Key key, double w = 1.0) => new(label, key, w);

    private static IReadOnlyList<IReadOnlyList<KeyModel>> BuildLayout()
    {
        var rows = new List<IReadOnlyList<KeyModel>>
        {
            new[]
            {
                K("Esc", Key.Escape, 1.4),
                K("F1", Key.F1), K("F2", Key.F2), K("F3", Key.F3), K("F4", Key.F4),
                K("F5", Key.F5), K("F6", Key.F6), K("F7", Key.F7), K("F8", Key.F8),
                K("F9", Key.F9), K("F10", Key.F10), K("F11", Key.F11), K("F12", Key.F12),
                K("PrtSc", Key.PrintScreen), K("ScrLk", Key.Scroll), K("Pause", Key.Pause),
            },
            new[]
            {
                K("`", Key.OemTilde),
                K("1", Key.D1), K("2", Key.D2), K("3", Key.D3), K("4", Key.D4),
                K("5", Key.D5), K("6", Key.D6), K("7", Key.D7), K("8", Key.D8),
                K("9", Key.D9), K("0", Key.D0),
                K("-", Key.OemMinus), K("=", Key.OemPlus),
                K("Backspace", Key.Back, 2.0),
                K("Ins", Key.Insert), K("Home", Key.Home), K("PgUp", Key.PageUp),
                K("Num", Key.NumLock),
                K("/", Key.Divide), K("*", Key.Multiply), K("-", Key.Subtract),
            },
            new[]
            {
                K("Tab", Key.Tab, 1.5),
                K("Q", Key.Q), K("W", Key.W), K("E", Key.E), K("R", Key.R), K("T", Key.T),
                K("Y", Key.Y), K("U", Key.U), K("I", Key.I), K("O", Key.O), K("P", Key.P),
                K("[", Key.OemOpenBrackets), K("]", Key.OemCloseBrackets),
                K("\\", Key.Oem5, 1.5),
                K("Del", Key.Delete), K("End", Key.End), K("PgDn", Key.PageDown),
                K("7", Key.NumPad7), K("8", Key.NumPad8), K("9", Key.NumPad9),
                K("+", Key.Add, 1.4),
            },
            new[]
            {
                K("Caps", Key.CapsLock, 1.8),
                K("A", Key.A), K("S", Key.S), K("D", Key.D), K("F", Key.F), K("G", Key.G),
                K("H", Key.H), K("J", Key.J), K("K", Key.K), K("L", Key.L),
                K(";", Key.Oem1), K("'", Key.Oem7), K("Enter", Key.Enter, 2.2),
                K("4", Key.NumPad4), K("5", Key.NumPad5), K("6", Key.NumPad6),
            },
            new[]
            {
                K("Shift", Key.LeftShift, 2.3),
                K("Z", Key.Z), K("X", Key.X), K("C", Key.C), K("V", Key.V), K("B", Key.B),
                K("N", Key.N), K("M", Key.M),
                K(",", Key.OemComma), K(".", Key.OemPeriod), K("/", Key.Oem2),
                K("Shift", Key.RightShift, 2.7),
                K("▲", Key.Up),
                K("1", Key.NumPad1), K("2", Key.NumPad2), K("3", Key.NumPad3),
                K("Enter", Key.Return, 1.4),
            },
            new[]
            {
                K("Ctrl", Key.LeftCtrl, 1.4),
                K("Win", Key.LWin, 1.2),
                K("Alt", Key.LeftAlt, 1.2),
                K("Space", Key.Space, 6.5),
                K("Alt", Key.RightAlt, 1.2),
                K("Win", Key.RWin, 1.2),
                K("Menu", Key.Apps, 1.2),
                K("Ctrl", Key.RightCtrl, 1.4),
                K("◀", Key.Left), K("▼", Key.Down), K("▶", Key.Right),
                K("0", Key.NumPad0, 2.2), K(".", Key.Decimal),
            },
        };
        return rows;
    }
}
