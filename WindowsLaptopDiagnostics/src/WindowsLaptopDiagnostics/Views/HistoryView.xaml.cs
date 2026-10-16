using System.Windows;
using System.Windows.Controls;
using WindowsLaptopDiagnostics.ViewModels;

namespace WindowsLaptopDiagnostics.Views;

/// <summary>
/// History view.
///
/// PasswordBox.Password is a plain CLR property, not a dependency property, so
/// a WPF Binding on it silently does nothing. The password is therefore pushed
/// into the view model from the PasswordChanged event instead. It is never
/// written to disk - ShareSettings deliberately omits it.
/// </summary>
public partial class HistoryView : UserControl
{
    public HistoryView() => InitializeComponent();

    private void OnPasswordChanged(object sender, RoutedEventArgs e)
    {
        if (DataContext is HistoryViewModel vm && sender is PasswordBox pb)
            vm.SmtpPassword = pb.Password;
    }
}
