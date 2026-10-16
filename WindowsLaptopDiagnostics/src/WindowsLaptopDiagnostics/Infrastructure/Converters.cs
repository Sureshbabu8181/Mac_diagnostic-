using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using WindowsLaptopDiagnostics.Core;

namespace WindowsLaptopDiagnostics.Infrastructure;

/// <summary>Converts a TestStatus to a status-colored SolidColorBrush.</summary>
public sealed class StatusToBrushConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is not TestStatus status)
            return new SolidColorBrush(Color.FromRgb(0x64, 0x74, 0x8b));
        var hex = status.ColorHex().TrimStart('#');
        var color = (Color)ColorConverter.ConvertFromString("#" + hex);
        return new SolidColorBrush(color);
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        Binding.DoNothing;
}

/// <summary>
/// Converts a status *label string* (what history stores) to a status-colored
/// brush. Unknown labels fall back to neutral grey rather than throwing, so a
/// malformed row can never crash a list render.
/// </summary>
public sealed class StatusTextToBrushConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var status = (value as string) switch
        {
            "Passed" => TestStatus.Passed,
            "Warning" => TestStatus.Warning,
            "Failed" => TestStatus.Failed,
            "Error" => TestStatus.Error,
            "Unsupported" => TestStatus.Unsupported,
            "Cancelled" => TestStatus.Cancelled,
            "Running" => TestStatus.Running,
            "Ready" => TestStatus.Ready,
            _ => TestStatus.NotRun,
        };
        var color = (Color)ColorConverter.ConvertFromString(status.ColorHex());
        return new SolidColorBrush(color);
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        Binding.DoNothing;
}

/// <summary>Converts a TestStatus to its display label string.</summary>
public sealed class StatusToLabelConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is TestStatus s ? s.Label() : TestStatus.NotRun.Label();

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        Binding.DoNothing;
}

/// <summary>Inverts a boolean (e.g. IsRunning -> controls enabled).</summary>
public sealed class InverseBoolConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is bool b ? !b : true;

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is bool b ? !b : false;
}

/// <summary>Collapses an element when the bound value is false; visible when true.</summary>
public sealed class BoolToVisibilityConverter : IValueConverter
{
    public bool Invert { get; set; }

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        bool b = value is bool x && x;
        if (Invert) b = !b;
        return b ? Visibility.Visible : Visibility.Collapsed;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        Binding.DoNothing;
}

/// <summary>Visible when the bound string is non-empty; collapsed when null or empty.</summary>
public sealed class EmptyToVisibilityConverter : IValueConverter
{
    public bool Invert { get; set; }

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        bool hasText = value is string s && !string.IsNullOrWhiteSpace(s);
        if (Invert) hasText = !hasText;
        return hasText ? Visibility.Visible : Visibility.Collapsed;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        Binding.DoNothing;
}

/// <summary>
/// Compares a selected value against an item's own value so a list can show
/// which item is current. One-way only — WPF does not allow a Binding inside
/// ConverterParameter, and ConvertBack cannot identify which item reported the
/// change, so selection is driven from the view's Checked handler instead.
/// </summary>
public sealed class ValueEqualsConverter : IMultiValueConverter
{
    public object Convert(object?[] values, Type targetType, object? parameter, CultureInfo culture)
    {
        if (values.Length < 2 || values[0] is null || values[1] is null) return false;
        return Equals(values[0], values[1]);
    }

    public object?[] ConvertBack(object value, Type[] targetTypes, object? parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}
