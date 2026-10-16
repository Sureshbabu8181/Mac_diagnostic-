using System.Windows.Controls;

namespace WindowsLaptopDiagnostics.Views;

/// <summary>Battery view; readings and the wear-availability logic live in the view model.</summary>
public partial class BatteryView : UserControl
{
    public BatteryView() => InitializeComponent();
}
