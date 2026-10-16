using System.Windows.Controls;

namespace WindowsLaptopDiagnostics.Views;

/// <summary>Temperature/sensor view; all polling and provenance lives in the view model.</summary>
public partial class ThermalView : UserControl
{
    public ThermalView() => InitializeComponent();
}
