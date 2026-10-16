using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Input;
using WindowsLaptopDiagnostics.Core;
using WindowsLaptopDiagnostics.Infrastructure;
using WindowsLaptopDiagnostics.Services;

namespace WindowsLaptopDiagnostics.ViewModels;

/// <summary>
/// Session history, filtering, export and outbound sharing.
///
/// Exports are written from what was actually recorded. Sharing is opt-in and
/// never auto-addressed: the Google Form endpoint and the SMTP destination must
/// both be supplied, and every transport answer is reported verbatim.
/// </summary>
public sealed class HistoryViewModel : PageViewModelBase
{
    public HistoryViewModel()
    {
        (FormConfig, EmailConfig) = ShareSettings.Load();

        RefreshCommand = new RelayCommand(Refresh);
        ClearCommand = new RelayCommand(Clear, () => !IsBusy);
        ExportCsvCommand = new AsyncRelayCommand(() => ExportAsync("csv"), () => !IsBusy);
        ExportHtmlCommand = new AsyncRelayCommand(() => ExportAsync("html"), () => !IsBusy);
        ExportPdfCommand = new AsyncRelayCommand(() => ExportAsync("pdf"), () => !IsBusy);
        SendFormCommand = new AsyncRelayCommand(SendToFormAsync, () => !IsBusy);
        SendEmailCommand = new AsyncRelayCommand(SendEmailAsync, () => !IsBusy);
        SaveSettingsCommand = new RelayCommand(SaveSettings);
    }

    public override string Title => "Test History & Reports";

    public ObservableCollection<HistoryEntry> Entries { get; } = new();

    private readonly GoogleFormConfig FormConfig;
    private readonly EmailConfig EmailConfig;

    // ---- filtering -------------------------------------------------- //

    private string _search = "";
    public string Search
    {
        get => _search;
        set { if (SetProperty(ref _search, value)) Refresh(); }
    }

    private string _statusFilter = "";
    public string StatusFilter
    {
        get => _statusFilter;
        set { if (SetProperty(ref _statusFilter, value)) Refresh(); }
    }

    private string _categoryFilter = "";
    public string CategoryFilter
    {
        get => _categoryFilter;
        set { if (SetProperty(ref _categoryFilter, value)) Refresh(); }
    }

    private int _windowHours;
    /// <summary>0 = everything, otherwise only results from the last N hours.</summary>
    public int WindowHours
    {
        get => _windowHours;
        set { if (SetProperty(ref _windowHours, value)) Refresh(); }
    }

    public IReadOnlyList<string> StatusOptions { get; } = new[]
    {
        "", "Passed", "Warning", "Failed", "Error", "Unsupported", "Cancelled", "Not Run",
    };

    public IReadOnlyList<string> CategoryOptions { get; } = new[]
    {
        "", "Interactive Tests", "Performance & Stress", "Hardware Health",
        "System & Connectivity", "Workflow & Reports",
    };

    public IReadOnlyList<string> WindowOptions { get; } = new[] { "All time", "Last hour", "Last 24 hours", "Last 7 days" };

    private int _windowIndex;
    public int WindowIndex
    {
        get => _windowIndex;
        set { if (SetProperty(ref _windowIndex, value)) { WindowHours = value switch { 1 => 1, 2 => 24, 3 => 168, _ => 0 }; } }
    }

    // ---- state ------------------------------------------------------ //

    private string _statusText = "";
    public string StatusText { get => _statusText; private set => SetProperty(ref _statusText, value); }

    private string _error = "";
    public string Error { get => _error; private set => SetProperty(ref _error, value); }

    private bool _isBusy;
    public bool IsBusy
    {
        get => _isBusy;
        private set { if (SetProperty(ref _isBusy, value)) RaiseCommands(); }
    }

    public string StoragePath => HistoryService.StoragePath;

    // ---- Google Form settings ---------------------------------------- //

    private string _formUrl = "";
    public string FormUrl
    {
        get => _formUrl;
        set { if (SetProperty(ref _formUrl, value)) FormConfig.FormUrl = value; }
    }

    private string _formMapping = "";
    /// <summary>Newline-separated <c>Column=entryId</c> pairs.</summary>
    public string FormMapping
    {
        get => _formMapping;
        set { if (SetProperty(ref _formMapping, value)) ParseMapping(value); }
    }

    // ---- SMTP settings ------------------------------------------------ //

    private string _smtpHost = "";
    public string SmtpHost { get => _smtpHost; set { if (SetProperty(ref _smtpHost, value)) EmailConfig.SmtpHost = value; } }

    private int _smtpPort;
    public int SmtpPort { get => _smtpPort; set { if (SetProperty(ref _smtpPort, value)) EmailConfig.SmtpPort = value; } }

    private bool _smtpSsl;
    public bool SmtpSsl { get => _smtpSsl; set { if (SetProperty(ref _smtpSsl, value)) EmailConfig.UseSsl = value; } }

    private string _smtpUser = "";
    public string SmtpUser { get => _smtpUser; set { if (SetProperty(ref _smtpUser, value)) EmailConfig.Username = value; } }

    private string _smtpFrom = "";
    public string SmtpFrom { get => _smtpFrom; set { if (SetProperty(ref _smtpFrom, value)) EmailConfig.FromAddress = value; } }

    private string _smtpTo = "";
    public string SmtpTo { get => _smtpTo; set { if (SetProperty(ref _smtpTo, value)) EmailConfig.ToAddress = value; } }

    private string _smtpSubject = "";
    public string SmtpSubject { get => _smtpSubject; set { if (SetProperty(ref _smtpSubject, value)) EmailConfig.Subject = value; } }

    private string _smtpPassword = "";
    /// <summary>Session-only; never written to disk.</summary>
    public string SmtpPassword
    {
        get => _smtpPassword;
        set
        {
            if (!SetProperty(ref _smtpPassword, value)) return;
            EmailConfig.Password.Clear();
            foreach (char c in value) EmailConfig.Password.AppendChar(c);
        }
    }

    public ICommand RefreshCommand { get; }
    public ICommand ClearCommand { get; }
    public ICommand ExportCsvCommand { get; }
    public ICommand ExportHtmlCommand { get; }
    public ICommand ExportPdfCommand { get; }
    public ICommand SendFormCommand { get; }
    public ICommand SendEmailCommand { get; }
    public ICommand SaveSettingsCommand { get; }

    public override void OnActivated()
    {
        _formUrl = FormConfig.FormUrl;
        OnPropertyChanged(nameof(FormUrl));
        _formMapping = string.Join("\n", FormConfig.EntryIds.Select(kv => $"{kv.Key}={kv.Value}"));
        OnPropertyChanged(nameof(FormMapping));

        _smtpHost = EmailConfig.SmtpHost;
        _smtpPort = EmailConfig.SmtpPort;
        _smtpSsl = EmailConfig.UseSsl;
        _smtpUser = EmailConfig.Username;
        _smtpFrom = EmailConfig.FromAddress;
        _smtpTo = EmailConfig.ToAddress;
        _smtpSubject = EmailConfig.Subject;
        foreach (var n in new[]
        {
            nameof(SmtpHost), nameof(SmtpPort), nameof(SmtpSsl), nameof(SmtpUser),
            nameof(SmtpFrom), nameof(SmtpTo), nameof(SmtpSubject),
        }) OnPropertyChanged(n);

        Refresh();
    }

    public override void OnDeactivated() { }

    private void ParseMapping(string text)
    {
        FormConfig.EntryIds.Clear();
        foreach (var line in text.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries))
        {
            int i = line.IndexOf('=');
            if (i <= 0) continue;
            string key = line[..i].Trim();
            string val = line[(i + 1)..].Trim();
            if (key.Length > 0 && val.Length > 0) FormConfig.EntryIds[key] = val;
        }
    }

    private void Refresh()
    {
        Error = "";
        var list = HistoryService.Query(
            string.IsNullOrWhiteSpace(Search) ? null : Search,
            string.IsNullOrWhiteSpace(StatusFilter) ? null : StatusFilter,
            string.IsNullOrWhiteSpace(CategoryFilter) ? null : CategoryFilter,
            WindowHours == 0 ? null : WindowHours);

        Entries.Clear();
        foreach (var e in list) Entries.Add(e);

        StatusText = list.Count == 0
            ? "No results match. Results appear here after a check actually runs."
            : $"{list.Count} result(s) · stored at {HistoryService.StoragePath}";
    }

    private void Clear()
    {
        HistoryService.Clear();
        Refresh();
    }

    private void SaveSettings()
    {
        ShareSettings.Save(FormConfig, EmailConfig);
        StatusText = $"Settings saved to {ShareSettings.StoragePath}. The email password was NOT saved.";
    }

    private void RaiseCommands() =>
        // AsyncRelayCommand has no raise method; both types listen to
        // CommandManager.RequerySuggested, so one invalidation covers them all.
        System.Windows.Input.CommandManager.InvalidateRequerySuggested();

    private static string MachineName()
    {
        string name = WindowsApi.Model() ?? "";
        string host = Environment.MachineName;
        return string.IsNullOrWhiteSpace(name) ? host : $"{name} ({host})";
    }

    // ---- export -------------------------------------------------------- //

    private async Task ExportAsync(string kind)
    {
        var snapshot = HistoryService.Query(
            string.IsNullOrWhiteSpace(Search) ? null : Search,
            string.IsNullOrWhiteSpace(StatusFilter) ? null : StatusFilter,
            string.IsNullOrWhiteSpace(CategoryFilter) ? null : CategoryFilter,
            WindowHours == 0 ? null : WindowHours);

        if (snapshot.Count == 0)
        {
            Error = "There is nothing to export - no results match the current filter.";
            return;
        }

        IsBusy = true;
        Error = "";
        try
        {
            string stamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            string dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                "WindowsLaptopDiagnostics");

            if (kind == "pdf")
            {
                // PDF goes through the Windows print pipeline, so it runs on
                // the UI thread (PrintDialog is not free-threaded).
                var (ok, path, detail) = ReportService.ExportPdf(snapshot, $"Diagnostics {stamp}");
                StatusText = detail;
                if (!ok) Error = detail;
                return;
            }

            string file = kind == "csv"
                ? Path.Combine(dir, $"diagnostics_{stamp}.csv")
                : Path.Combine(dir, $"diagnostics_{stamp}.html");

            string written = await Task.Run(() => kind == "csv"
                ? ReportService.ExportCsv(snapshot, file)
                : ReportService.ExportHtml(snapshot, file, $"Laptop diagnostics report - {MachineName()}"));

            StatusText = $"Wrote {written} · {snapshot.Count} result(s). Open it to confirm it renders.";
            TryReveal(written);
        }
        catch (Exception ex)
        {
            Logger.Error($"Export ({kind}) failed", ex);
            Error = ex.Message;
        }
        finally
        {
            IsBusy = false;
        }
    }

    private static void TryReveal(string path)
    {
        try
        {
            if (!File.Exists(path)) return;
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = $"/select,\"{path}\"",
                UseShellExecute = true,
            });
        }
        catch (Exception ex) { Logger.Warn("Could not reveal the exported file", ex); }
    }

    // ---- share ---------------------------------------------------------- //

    private async Task SendToFormAsync()
    {
        if (!FormConfig.IsUsable)
        {
            Error = "Set the Google Form URL and at least one Column=entryId line first.";
            return;
        }

        var snapshot = HistoryService.Query();
        IsBusy = true;
        Error = "";
        try
        {
            var row = ShareService.FormRowFrom(snapshot, MachineName(),
                "Submitted from Windows Laptop Diagnostics.");

            var outcome = await ShareService.SubmitToGoogleFormAsync(FormConfig, row);
            StatusText = outcome.Detail;
            if (!outcome.Ok) Error = outcome.Detail;
        }
        catch (Exception ex)
        {
            Logger.Error("Google Forms share failed", ex);
            Error = ex.Message;
        }
        finally { IsBusy = false; }
    }

    private async Task SendEmailAsync()
    {
        if (!EmailConfig.IsUsable)
        {
            Error = "Set the SMTP host, from address and to address first.";
            return;
        }

        var snapshot = HistoryService.Query();
        IsBusy = true;
        Error = "";
        try
        {
            // The attachment is exported to a temp file so the recipient gets
            // the same CSV the on-screen table shows.
            string dir = Path.Combine(Path.GetTempPath(), "WindowsLaptopDiagnostics");
            Directory.CreateDirectory(dir);
            string csv = Path.Combine(dir, $"diagnostics_{DateTime.Now:yyyyMMdd_HHmmss}.csv");
            await Task.Run(() => ReportService.ExportCsv(snapshot, csv));
            var bytes = await File.ReadAllBytesAsync(csv);

            string title = $"Laptop diagnostics report - {MachineName()}";
            string html = await Task.Run(() =>
                ReportService.ExportHtml(snapshot, csv + ".html", title));
            string htmlBody = await File.ReadAllTextAsync(html);

            string text = ShareService.ToPlainText(snapshot, MachineName(),
                "Sent from Windows Laptop Diagnostics.");

            var outcome = await ShareService.SendEmailAsync(
                EmailConfig, htmlBody, text, new[] { (csv, bytes) });

            StatusText = outcome.Detail;
            if (!outcome.Ok) Error = outcome.Detail;
        }
        catch (Exception ex)
        {
            Logger.Error("Email share failed", ex);
            Error = ex.Message;
        }
        finally { IsBusy = false; }
    }
}
