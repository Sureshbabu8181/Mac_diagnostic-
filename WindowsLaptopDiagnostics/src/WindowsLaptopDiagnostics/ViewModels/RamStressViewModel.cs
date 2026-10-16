using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Windows.Input;
using WindowsLaptopDiagnostics.Core;
using WindowsLaptopDiagnostics.Infrastructure;
using WindowsLaptopDiagnostics.Services;

namespace WindowsLaptopDiagnostics.ViewModels;

/// <summary>
/// Bounded RAM pattern test: allocate, fill, read back, verify, release.
///
/// Honesty: this tests only the memory the app itself allocates and can address.
/// It is documented as not equivalent to a bootable memory diagnostic, and a
/// mismatch is reported as a fault candidate rather than a confirmed dead DIMM.
/// </summary>
public sealed class RamStressViewModel : PageViewModelBase
{
    private RamStress? _stress;

    public RamStressViewModel()
    {
        StartCommand = new RelayCommand(Start, () => !IsRunning && CanAllocate);
        CancelCommand = new RelayCommand(Cancel, () => IsRunning);
        ResetCommand = new RelayCommand(Reset, () => !IsRunning);
    }

    public override string Title => "RAM Stress Test";

    public static readonly int[] SizeOptionsMb = { 64, 128, 256, 512, 1024, 2048 };
    public static readonly int[] PassOptions = { 1, 2, 4, 8 };

    private int _megabytes = 256;
    public int Megabytes
    {
        get => _megabytes;
        set { if (SetProperty(ref _megabytes, value)) { OnPropertyChanged(nameof(CanAllocate)); RaiseCommands(); } }
    }

    private int _passes = 2;
    public int Passes
    {
        get => _passes;
        set { if (SetProperty(ref _passes, value)) RaiseCommands(); }
    }

    /// <summary>Available physical memory, read live so the cap is real.</summary>
    private double _availableGb;
    public double AvailableGb { get => _availableGb; private set => SetProperty(ref _availableGb, value); }

    /// <summary>Refuses sizes that would push the machine into paging.</summary>
    public bool CanAllocate => Megabytes <= AvailableGb * 1024 * 0.5;

    public string SizeHint
    {
        get
        {
            if (AvailableGb <= 0) return "Reading available memory…";
            double capMb = AvailableGb * 1024 * 0.5;
            return Megabytes <= capMb
                ? $"{AvailableGb:0.0} GB available; this allocation is within the safe half."
                : $"{AvailableGb:0.0} GB available; pick a size at or below {capMb:0} MB so the machine does not page.";
        }
    }

    private bool _isRunning;
    public bool IsRunning
    {
        get => _isRunning;
        private set
        {
            if (!SetProperty(ref _isRunning, value)) return;
            OnPropertyChanged(nameof(StatusText));
            RaiseCommands();
        }
    }

    private double _progressPercent;
    public double ProgressPercent { get => _progressPercent; private set => SetProperty(ref _progressPercent, value); }

    private string _elapsedText = "00:00";
    public string ElapsedText { get => _elapsedText; private set => SetProperty(ref _elapsedText, value); }

    private string _resultText = "";
    public string ResultText { get => _resultText; private set => SetProperty(ref _resultText, value); }

    private string _statusText = "Choose a size and pass count, then start.";
    public string StatusText { get => _statusText; private set => SetProperty(ref _statusText, value); }

    private string _error = "";
    public string Error { get => _error; private set => SetProperty(ref _error, value); }

    public ICommand StartCommand { get; }
    public ICommand CancelCommand { get; }
    public ICommand ResetCommand { get; }

    public override void OnActivated() => RefreshMemory();

    public override void OnDeactivated() => Cancel();

    private void RefreshMemory()
    {
        _ = Task.Run(() =>
        {
            var status = WindowsApi.MemoryStatus();
            double available = status?.AvailableGb ?? 0;
            System.Windows.Application.Current?.Dispatcher.Invoke(() =>
            {
                AvailableGb = available;
                OnPropertyChanged(nameof(SizeHint));
                OnPropertyChanged(nameof(CanAllocate));
                RaiseCommands();
            });
        });
    }

    private void Start()
    {
        _stress?.Dispose();
        _stress = new RamStress();
        _stress.Progress += OnProgress;
        _stress.Completed += OnCompleted;

        Error = "";
        ResultText = "";
        ProgressPercent = 0;
        ElapsedText = "00:00";

        try { _stress.Start(Megabytes, Passes); }
        catch (Exception ex)
        {
            Error = ex.Message;
            StatusText = "The memory test could not start.";
            IsRunning = false;
            return;
        }

        IsRunning = true;
        StatusText = $"Filling and verifying {Megabytes} MB, {Passes} pass(es). The block is always released, even on cancel.";
    }

    private void OnProgress(StressProgress p)
    {
        System.Windows.Application.Current?.Dispatcher.BeginInvoke(() =>
        {
            ProgressPercent = Math.Min(100, p.LoadPercent);
            ElapsedText = $"{(int)(p.ElapsedSeconds / 60):00}:{(int)p.ElapsedSeconds % 60:00}";
        });
    }

    private void OnCompleted(RamResult r)
    {
        System.Windows.Application.Current?.Dispatcher.BeginInvoke(() =>
        {
            IsRunning = false;
            ProgressPercent = 100;
            ElapsedText = $"{(int)(r.Seconds / 60):00}:{(int)r.Seconds % 60:00}";
            StatusText = r.EndedReason switch
            {
                var s when s.StartsWith("cancelled") => "Stopped on request. The allocated block has been released.",
                var s when s.StartsWith("error") || s.Contains("out of memory") => $"Ended early: {r.EndedReason}. The allocated block has been released.",
                _ => "Verification complete. The allocated block has been released.",
            };

            ResultText = r.Mismatches == 0
                ? $"All {r.Megabytes} MB verified correctly across {r.Passes} pass(es) in {r.Seconds:0.#} s. " +
                  "This covers only the memory this application allocated and addressed."
                : $"{r.Mismatches} byte(s) read back differently from what was written (first at offset " +
                  $"{r.FirstBadOffset:N0}). Treat this as a fault candidate — retest and, if it repeats, " +
                  "use a bootable memory diagnostic before condemning a module.";
        });
    }

    private void Cancel()
    {
        _stress?.RequestStop();
        IsRunning = false;
        StatusText = "Stopping. The allocated block is released when the worker unwinds.";
    }

    private void Reset()
    {
        _stress?.Dispose();
        _stress = null;
        ProgressPercent = 0;
        ElapsedText = "00:00";
        ResultText = "";
        Error = "";
        StatusText = "Cleared. Choose a size and pass count, then start.";
        RefreshMemory();
    }

    private void RaiseCommands()
    {
        (StartCommand as RelayCommand)?.RaiseCanExecuteChanged();
        (CancelCommand as RelayCommand)?.RaiseCanExecuteChanged();
        (ResetCommand as RelayCommand)?.RaiseCanExecuteChanged();
    }
}
