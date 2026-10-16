using System;
using System.Globalization;
using System.Windows.Data;

namespace WindowsLaptopDiagnostics.Infrastructure;

/// <summary>
/// Converts a relative key width (1.0 = one standard unit, 2.0 = double) into
/// device-independent pixels for the on-screen keyboard layout.
/// </summary>
public sealed class KeyWidthConverter : IValueConverter
{
    private const double UnitWidth = 36.0;

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        double w = value is double d ? d : 1.0;
        return UnitWidth * Math.Max(0.4, w);
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        Binding.DoNothing;
}
