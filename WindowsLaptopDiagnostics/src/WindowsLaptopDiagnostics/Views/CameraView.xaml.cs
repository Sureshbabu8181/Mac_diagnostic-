using System.Windows;
using System.Windows.Controls;
using WindowsLaptopDiagnostics.ViewModels;

namespace WindowsLaptopDiagnostics.Views;

/// <summary>
/// Camera test view. Wires the preview bitmap into the Image element and
/// toggles the idle placeholder; lifecycle lives in the view model.
/// </summary>
public partial class CameraView : UserControl
{
    private CameraViewModel? _vm;

    public CameraView()
    {
        InitializeComponent();
        Loaded += OnLoadedUi;
        Unloaded += OnUnloadedUi;
    }

    private void OnLoadedUi(object sender, RoutedEventArgs e)
    {
        if (DataContext is not CameraViewModel vm || ReferenceEquals(_vm, vm)) return;
        if (_vm is not null) _vm.PropertyChanged -= OnVmPropertyChanged;
        _vm = vm;
        _vm.PropertyChanged += OnVmPropertyChanged;
        _vm.OnActivated();
        SyncPreview();
    }

    private void OnUnloadedUi(object sender, RoutedEventArgs e)
    {
        if (_vm is not null)
        {
            _vm.PropertyChanged -= OnVmPropertyChanged;
            _vm.OnDeactivated();
            _vm = null;
        }
        PreviewImage.Source = null;
        IdleText.Visibility = Visibility.Visible;
    }

    private void OnVmPropertyChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e)
    {
        if (e.PropertyName is nameof(CameraViewModel.Preview) or nameof(CameraViewModel.IsRunning))
            SyncPreview();
    }

    private void SyncPreview()
    {
        if (_vm is null) return;
        bool hasFrame = _vm.Preview is not null;
        PreviewImage.Source = _vm.Preview;
        IdleText.Visibility = hasFrame ? Visibility.Collapsed : Visibility.Visible;
    }
}
