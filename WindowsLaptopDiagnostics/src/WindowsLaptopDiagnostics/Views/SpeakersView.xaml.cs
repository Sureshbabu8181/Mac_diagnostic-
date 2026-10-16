using System.Windows;
using System.Windows.Controls;
using WindowsLaptopDiagnostics.Core;
using WindowsLaptopDiagnostics.Services;
using WindowsLaptopDiagnostics.ViewModels;

namespace WindowsLaptopDiagnostics.Views;

/// <summary>Speakers/headphones test view; behaviour lives in the view model.</summary>
public partial class SpeakersView : UserControl
{
    public SpeakersView() => InitializeComponent();

    /// <summary>
    /// The checked state itself is computed one-way, so selection is pushed
    /// here — the multi-binding converter cannot identify the reporting item.
    /// </summary>
    private void OnRouteChecked(object sender, RoutedEventArgs e)
    {
        if (sender is RadioButton { DataContext: ToneRoute route } &&
            DataContext is SpeakersViewModel vm)
        {
            vm.SelectedRoute = route;
        }
    }
}
