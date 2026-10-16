using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Input;
using WindowsLaptopDiagnostics.Core;
using WindowsLaptopDiagnostics.Infrastructure;
using WindowsLaptopDiagnostics.Services;

namespace WindowsLaptopDiagnostics.ViewModels;

/// <summary>One selectable step in the run list.</summary>
public sealed class AutoStepViewModel : ObservableObject
{
    private bool _selected;
    public AutoStep Step { get; }
    public AutoStepViewModel(AutoStep step) => Step = step;

    public string Name => Step.Name;
    public string Purpose => Step.Purpose;
    public string Category => Step.Category.Label();

    /// <summary>Interactive steps stay selected so their reason is visible in the run list.</summary>
    public string Availability => Step.Automatable ? "" : Step.SkipReason;

    public bool Selected
    {
        get => _selected;
        set => SetProperty(ref _selected, value);
    }
}

/// <summary>One row in the live run list.</summary>
public sealed class AutoRunRow : ObservableObject
{
    private TestStatus _status = TestStatus.NotRun;
    private string _detail = "";

    public string Key { get; init; } = "";
    public string Name { get; init; } = "";

    public TestStatus Status { get => _status; set { if (SetProperty(ref _status, value)) Raise(nameof(StatusText), nameof(StatusColor)); } }
    public string Detail { get => _detail; set => SetProperty(ref _detail, value); }

    public string StatusText => Status.Label();
    public string StatusColor => Status.ColorHex();

    private void Raise(params string[] names)
    {
        foreach (var n in names) OnPropertyChanged(n);
    }
}

/// <summary>
/// Automatic diagnostics. Runs only the checks that can genuinely be automated,
/// records every outcome to history, and reports skipped/unsupported/cancelled
/// as themselves rather than folding them into a pass count.
/// </summary>
public sealed class AutoViewModel : PageViewModelBase
{
    private CancellationTokenSource? _cts;

    public AutoViewModel()
    {
        foreach (var s in AutoDiagnosticsService.Catalogue)
            Steps.Add(new AutoStepViewModel(s) { Selected = s.Automatable });

        // Everything automatable is on by default; nothing interactive is.
        RunCommand = new AsyncRelayCommand(RunAsync, () => !IsRunning);
        CancelCommand = new RelayCommand(() => _cts?.Cancel(), () => IsRunning);
        SelectAllCommand = new RelayCommand(() => SetAll(true));
        SelectNoneCommand = new RelayCommand(() => SetAll(false));
        SelectAutomatableCommand = new RelayCommand(() =>
        {
            foreach (var s in Steps) s.Selected = s.Step.Automatable;
        });
    }

    public override string Title => "Automatic Diagnostics";

    public ObservableCollection<AutoStepViewModel> Steps { get; } = new();
    public ObservableCollection<AutoRunRow> Rows { get; } = new();

    private bool _isRunning;
    public bool IsRunning
    {
        get => _isRunning;
        private set { if (SetProperty(ref _isRunning, value)) RaiseCommands(); }
    }

    public int AutomatableCount => Steps.Count(s => s.Step.Automatable);
    public int SelectedCount => Steps.Count(s => s.Selected);

    private int _completed;
    public int Completed { get => _completed; private set { if (SetProperty(ref _completed, value)) OnPropertyChanged(nameof(ProgressText)); } }

    private int _total;
    public int Total { get => _total; private set { if (SetProperty(ref _total, value)) OnPropertyChanged(nameof(ProgressText)); } }

    public string ProgressText => Total > 0 ? $"{Completed} of {Total}" : "";

    private string _summaryText = "Select checks and start a run.";
    public string SummaryText { get => _summaryText; private set => SetProperty(ref _summaryText, value); }

    private string _summaryDetail = "";
    public string SummaryDetail { get => _summaryDetail; private set => SetProperty(ref _summaryDetail, value); }

    private string _summaryColor = "#38bdf8";
    public string SummaryColor { get => _summaryColor; private set => SetProperty(ref _summaryColor, value); }

    private string _error = "";
    public string Error { get => _error; private set => SetProperty(ref _error, value); }

    private bool _includeNetworkProbe;
    /// <summary>Off by default: even a local gateway ping is opt-in.</summary>
    public bool IncludeNetworkProbe
    {
        get => _includeNetworkProbe;
        set => SetProperty(ref _includeNetworkProbe, value);
    }

    public ICommand RunCommand { get; }
    public ICommand CancelCommand { get; }
    public ICommand SelectAllCommand { get; }
    public ICommand SelectNoneCommand { get; }
    public ICommand SelectAutomatableCommand { get; }

    public override void OnActivated()
    {
        OnPropertyChanged(nameof(AutomatableCount));
        OnPropertyChanged(nameof(SelectedCount));
    }

    public override void OnDeactivated()
    {
        // Leaving the page must not leave a workload running behind the UI.
        _cts?.Cancel();
    }

    private void SetAll(bool v)
    {
        foreach (var s in Steps) s.Selected = v;
        OnPropertyChanged(nameof(SelectedCount));
    }

    private void RaiseCommands()
    {
        // Both RelayCommand and AsyncRelayCommand hook CanExecuteChanged to
        // CommandManager.RequerySuggested, so invalidating the requery refreshes
        // all of them at once (AsyncRelayCommand has no raise method of its own).
        CommandManager.InvalidateRequerySuggested();
    }

    private async Task RunAsync()
    {
        if (IsRunning) return;

        var chosen = Steps.Where(s => s.Selected).Select(s => s.Step).ToList();
        if (chosen.Count == 0)
        {
            Error = "Nothing is selected - tick at least one check.";
            return;
        }

        Rows.Clear();
        foreach (var s in chosen)
            Rows.Add(new AutoRunRow { Key = s.Key, Name = s.Name });

        Error = "";
        SummaryText = "Running…";
        SummaryDetail = "";
        SummaryColor = "#38bdf8";
        Total = chosen.Count;
        Completed = 0;
        IsRunning = true;
        _cts = new CancellationTokenSource();

        try
        {
            var progress = new Progress<AutoProgress>(p =>
            {
                var row = Rows.FirstOrDefault(r => r.Key == p.Key);
                if (row is null) return;
                row.Status = p.Status;
                row.Detail = p.Detail;
                Completed = p.Completed;
                Total = p.Total;
            });

            var (entries, summary, cancelled) = await AutoDiagnosticsService.RunAsync(
                chosen, IncludeNetworkProbe, progress, _cts.Token);

            SummaryText = cancelled ? "Run cancelled." : "Run complete.";
            SummaryDetail = summary.OneLine +
                $". {summary.Executed} of {summary.Total} checks actually executed.";
            SummaryColor = cancelled ? "#94a3b8"
                : summary.Failed + summary.Error > 0 ? "#ef4444"
                : summary.Warning > 0 ? "#f59e0b"
                : "#22c55e";

            Completed = chosen.Count;
        }
        catch (Exception ex)
        {
            Logger.Error("Automatic diagnostics failed", ex);
            Error = ex.Message;
            SummaryText = "The run failed before it could finish.";
            SummaryColor = "#ef4444";
        }
        finally
        {
            _cts.Dispose();
            _cts = null;
            IsRunning = false;
        }
    }
}
