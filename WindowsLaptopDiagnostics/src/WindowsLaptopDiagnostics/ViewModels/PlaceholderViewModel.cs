namespace WindowsLaptopDiagnostics.ViewModels;

/// <summary>
/// Honest placeholder for a sidebar module that has not been implemented yet.
/// It never claims to run a test or show fabricated results.
/// </summary>
public sealed class PlaceholderViewModel : PageViewModelBase
{
    public PlaceholderViewModel(string title, string description)
    {
        Title = title;
        Description = description;
    }

    public override string Title { get; }
    public string Description { get; }
    public string StatusLabel => "Not yet implemented";
}
