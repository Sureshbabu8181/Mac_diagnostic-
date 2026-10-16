using System.Windows.Controls;

namespace WindowsLaptopDiagnostics.Views;

/// <summary>Reusable diagnostic card. Bound to a CardViewModel-like shape
/// (Title, optional StatusLabel/StatusBrush, Body content).</summary>
public partial class CardView : UserControl
{
    public CardView() => InitializeComponent();
}
