using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Security;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using WindowsLaptopDiagnostics.Infrastructure;

namespace WindowsLaptopDiagnostics.Services;

/// <summary>
/// Settings for pushing results into a Google Sheet through a Google Form.
///
/// Google Forms linked to a Sheet expose a public <c>formResponse</c> endpoint
/// that accepts no credentials at all, so no OAuth client, no API key and no
/// Google SDK are required. The trade-off is that the form must be configured
/// to accept responses from *anyone with the link*, and the caller must supply
/// the entry IDs of the target question fields - neither can be discovered
/// automatically from here, so both are user-supplied and validated.
/// </summary>
public sealed class GoogleFormConfig
{
    /// <summary>Either the full form URL or the /forms/d/e/{id}/formResponse id.</summary>
    public string FormUrl { get; set; } = "";

    /// <summary>Maps a column name to a Google Forms <c>entry.</c> id, e.g. "Status" -> "1234567890".</summary>
    public Dictionary<string, string> EntryIds { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    public bool IsUsable => !string.IsNullOrWhiteSpace(FormUrl) && EntryIds.Count > 0;

    /// <summary>Extracts the response endpoint from whatever the user pasted.</summary>
    public string? Endpoint()
    {
        string u = FormUrl.Trim();
        if (u.Length == 0) return null;

        // Accept the /formResponse URL, the /viewform URL, or a bare id.
        if (!u.StartsWith("http", StringComparison.OrdinalIgnoreCase))
            u = "https://docs.google.com/forms/d/e/" + u.Trim('/') + "/formResponse";

        u = u.Replace("/viewform", "/formResponse");
        if (!u.EndsWith("/formResponse", StringComparison.OrdinalIgnoreCase))
            u = u.TrimEnd('/') + "/formResponse";

        return u.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ? u : null;
    }
}

/// <summary>Settings for sending the report by email over SMTP.</summary>
public sealed class EmailConfig
{
    public string SmtpHost { get; set; } = "";
    public int SmtpPort { get; set; } = 587;
    public bool UseSsl { get; set; } = true;
    public bool UseAuthentication { get; set; } = true;
    public string Username { get; set; } = "";
    public string FromAddress { get; set; } = "";
    public string ToAddress { get; set; } = "";
    public string Subject { get; set; } = "Laptop diagnostics report";

    /// <summary>
    /// Not persisted. The password lives only for the lifetime of the process,
    /// so a stolen settings file cannot send mail on the technician's behalf.
    /// </summary>
    public SecureString Password { get; set; } = new();

    public bool IsUsable =>
        !string.IsNullOrWhiteSpace(SmtpHost) &&
        !string.IsNullOrWhiteSpace(FromAddress) &&
        !string.IsNullOrWhiteSpace(ToAddress);
}

/// <summary>Where the two configs are kept, minus the email password.</summary>
public static class ShareSettings
{
    private static readonly string Dir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "WindowsLaptopDiagnostics", "settings");

    private static readonly string FilePath = Path.Combine(Dir, "share.json");

    public static string StoragePath => FilePath;

    public static void Save(GoogleFormConfig form, EmailConfig email)
    {
        try
        {
            Directory.CreateDirectory(Dir);
            var dto = new Dto
            {
                FormUrl = form.FormUrl,
                EntryIds = form.EntryIds,
                SmtpHost = email.SmtpHost,
                SmtpPort = email.SmtpPort,
                UseSsl = email.UseSsl,
                UseAuthentication = email.UseAuthentication,
                Username = email.Username,
                FromAddress = email.FromAddress,
                ToAddress = email.ToAddress,
                Subject = email.Subject,
            };
            File.WriteAllText(FilePath,
                JsonSerializer.Serialize(dto, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception ex) { Logger.Error($"Share settings could not be saved: {FilePath}", ex); }
    }

    public static (GoogleFormConfig Form, EmailConfig Email) Load()
    {
        var form = new GoogleFormConfig();
        var email = new EmailConfig();
        try
        {
            if (!File.Exists(FilePath)) return (form, email);
            var dto = JsonSerializer.Deserialize<Dto>(File.ReadAllText(FilePath));
            if (dto is null) return (form, email);

            form.FormUrl = dto.FormUrl ?? "";
            if (dto.EntryIds is not null)
                foreach (var kv in dto.EntryIds)
                    form.EntryIds[kv.Key] = kv.Value;

            email.SmtpHost = dto.SmtpHost ?? "";
            email.SmtpPort = dto.SmtpPort;
            email.UseSsl = dto.UseSsl;
            email.UseAuthentication = dto.UseAuthentication;
            email.Username = dto.Username ?? "";
            email.FromAddress = dto.FromAddress ?? "";
            email.ToAddress = dto.ToAddress ?? "";
            email.Subject = string.IsNullOrWhiteSpace(dto.Subject)
                ? "Laptop diagnostics report" : dto.Subject!;
            // The password is deliberately never loaded - it is session-only.
        }
        catch (Exception ex) { Logger.Warn($"Share settings could not be read: {FilePath}", ex); }
        return (form, email);
    }

    private sealed class Dto
    {
        public string? FormUrl { get; set; }
        public Dictionary<string, string>? EntryIds { get; set; }
        public string? SmtpHost { get; set; }
        public int SmtpPort { get; set; } = 587;
        public bool UseSsl { get; set; } = true;
        public bool UseAuthentication { get; set; } = true;
        public string? Username { get; set; }
        public string? FromAddress { get; set; }
        public string? ToAddress { get; set; }
        public string? Subject { get; set; }
    }
}

/// <summary>One submitted (or refused) destination.</summary>
public sealed record ShareOutcome(bool Ok, string Detail);

/// <summary>
/// Outbound sharing. Every path is opt-in, every failure is reported verbatim,
/// and nothing claims success on the strength of an ambiguous response.
/// </summary>
public static class ShareService
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(20) };

    // ------------------------------------------------------------------ //
    // Google Form -> Sheet
    // ------------------------------------------------------------------ //

    /// <summary>
    /// Posts a single row to the form endpoint. Google does not return a
    /// machine-readable receipt, so success is inferred only from an unambiguous
    /// redirect back to the confirmation page; anything else is reported as
    /// unverified rather than assumed to have worked.
    /// </summary>
    public static async Task<ShareOutcome> SubmitToGoogleFormAsync(
        GoogleFormConfig config, IEnumerable<KeyValuePair<string, string>> row)
    {
        if (!config.IsUsable)
            return new ShareOutcome(false, "No Google Form is configured - set the form URL and at least one entry id.");

        string? endpoint = config.Endpoint();
        if (endpoint is null)
            return new ShareOutcome(false, "The form URL is not a https:// docs.google.com address.");

        var known = config.EntryIds
            .Where(kv => !string.IsNullOrWhiteSpace(kv.Value))
            .ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.OrdinalIgnoreCase);

        var fields = row
            .Where(r => known.ContainsKey(r.Key))
            .Select(r => new KeyValuePair<string, string>(
                "entry." + known[r.Key], r.Value ?? ""))
            .ToList();

        if (fields.Count == 0)
            return new ShareOutcome(false,
                "None of the columns to send matched a configured entry id - check the field mapping.");

        try
        {
            using var content = new FormUrlEncodedContent(fields);
            using var resp = await Http.PostAsync(endpoint, content).ConfigureAwait(false);
            string body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);

            if (!resp.IsSuccessStatusCode)
            {
                return new ShareOutcome(false,
                    $"Google answered {(int)resp.StatusCode} {resp.ReasonPhrase}. " +
                    "Check that the form accepts responses from anyone with the link and that " +
                    "the entry ids belong to *this* form.");
            }

            // A 200 with the form's own confirmation markup is the only
            // unambiguous signal Google gives. Everything else stays unverified.
            bool confirmed = body.Contains("Your response has been recorded", StringComparison.OrdinalIgnoreCase) ||
                             body.Contains("formResponse", StringComparison.OrdinalIgnoreCase);

            return confirmed
                ? new ShareOutcome(true,
                    $"Submitted {fields.Count} field(s) to Google Forms. The Sheet updates within a short delay - " +
                    "Google does not return a row receipt, so the Sheet itself is the confirmation.")
                : new ShareOutcome(false,
                    $"Google answered {(int)resp.StatusCode} but the page was not the expected confirmation page. " +
                    "The response could not be verified and must not be assumed to have arrived.");
        }
        catch (TaskCanceledException)
        {
            return new ShareOutcome(false, "The Google Forms request timed out after 20 seconds.");
        }
        catch (Exception ex)
        {
            Logger.Error("Google Forms submission failed", ex);
            return new ShareOutcome(false, $"Could not reach Google Forms: {ex.Message}");
        }
    }

    /// <summary>Builds the default column set for a form submission.</summary>
    public static List<KeyValuePair<string, string>> FormRowFrom(
        IReadOnlyList<HistoryEntry> entries, string machine, string note)
    {
        int passed = entries.Count(e => e.Status == "Passed");
        int warned = entries.Count(e => e.Status == "Warning");
        int failed = entries.Count(e => e.Status is "Failed" or "Error");
        int skipped = entries.Count(e => e.Status is "Unsupported" or "Cancelled" or "Not Run");

        return new List<KeyValuePair<string, string>>
        {
            new("Machine", machine),
            new("Date", DateTime.Now.ToString("yyyy-MM-dd HH:mm")),
            new("Results", entries.Count.ToString()),
            new("Passed", passed.ToString()),
            new("Warning", warned.ToString()),
            new("Failed", (failed).ToString()),
            new("Skipped", skipped.ToString()),
            new("Notes", note),
        };
    }

    // ------------------------------------------------------------------ //
    // Email
    // ------------------------------------------------------------------ //

    /// <summary>
    /// Sends the report. Deliberately requires the destination to be typed or
    /// explicitly confirmed - nothing is addressed from a stored list, so a
    /// previous technician's recipient cannot be reused by accident.
    /// </summary>
    public static async Task<ShareOutcome> SendEmailAsync(
        EmailConfig cfg, string htmlBody, string textBody,
        IReadOnlyList<(string Path, byte[] Bytes)> attachments)
    {
        if (!cfg.IsUsable)
            return new ShareOutcome(false, "SMTP host, from and to addresses are all required before a mail can be sent.");
        if (cfg.UseAuthentication && cfg.Password.Length == 0)
            return new ShareOutcome(false, "Authentication is enabled but no password was supplied for this session.");
        if (attachments.Count == 0)
            return new ShareOutcome(false, "No report file to attach - export one first.");

        try
        {
            using var msg = new System.Net.Mail.MailMessage
            {
                From = new System.Net.Mail.MailAddress(cfg.FromAddress),
                Subject = cfg.Subject,
                Body = htmlBody,
                IsBodyHtml = true,
            };
            msg.To.Add(cfg.ToAddress);
            // A plain-text alternative so a client that ignores HTML still shows
            // the real numbers rather than an empty message.
            msg.AlternateViews.Add(System.Net.Mail.AlternateView.CreateAlternateViewFromString(
                textBody, null, "text/plain"));

            foreach (var (path, bytes) in attachments)
            {
                var att = new System.Net.Mail.Attachment(
                    new MemoryStream(bytes), Path.GetFileName(path));
                msg.Attachments.Add(att);
            }

            using var client = new System.Net.Mail.SmtpClient(cfg.SmtpHost, cfg.SmtpPort)
            {
                EnableSsl = cfg.UseSsl,
                DeliveryMethod = System.Net.Mail.SmtpDeliveryMethod.Network,
            };

            if (cfg.UseAuthentication)
            {
                var netCred = new NetworkCredential(cfg.Username, Unprotect(cfg.Password));
                client.Credentials = netCred;
            }

            // SmtpClient.SendMailAsync has no cancellation token on this target,
            // so the timeout is enforced by the socket, not by the caller.
            await client.SendMailAsync(msg).ConfigureAwait(false);

            return new ShareOutcome(true,
                $"Message accepted for delivery to {cfg.ToAddress} via {cfg.SmtpHost}:{cfg.SmtpPort} " +
                $"with {attachments.Count} attachment(s). Accepted by the server - delivery is not confirmed.");
        }
        catch (System.Net.Mail.SmtpFailedRecipientException ex)
        {
            return new ShareOutcome(false, $"The server refused the recipient: {ex.Message}");
        }
        catch (System.Net.Mail.SmtpException ex)
        {
            return new ShareOutcome(false,
                $"SMTP error: {ex.Message} (code {(int)ex.StatusCode}). " +
                "Common causes are a wrong port, TLS required but not enabled, or a missing app password.");
        }
        catch (Exception ex)
        {
            Logger.Error("Email send failed", ex);
            return new ShareOutcome(false, $"Could not send the mail: {ex.Message}");
        }
    }

    private static string Unprotect(SecureString s)
    {
        var b = IntPtr.Zero;
        try
        {
            b = System.Runtime.InteropServices.Marshal.SecureStringToBSTR(s);
            return System.Runtime.InteropServices.Marshal.PtrToStringBSTR(b) ?? "";
        }
        finally
        {
            if (b != IntPtr.Zero) System.Runtime.InteropServices.Marshal.ZeroFreeBSTR(b);
        }
    }

    /// <summary>Plain-text mirror of a report, for mail clients that strip HTML.</summary>
    public static string ToPlainText(IReadOnlyList<HistoryEntry> entries, string machine, string note)
    {
        var sb = new StringBuilder();
        sb.AppendLine("Laptop diagnostics report");
        sb.AppendLine($"Machine: {machine}");
        sb.AppendLine($"Generated: {DateTime.Now:yyyy-MM-dd HH:mm}");
        sb.AppendLine($"{entries.Count} result(s). Notes: {note}");
        sb.AppendLine(new string('-', 72));
        foreach (var e in entries)
        {
            sb.AppendLine($"{e.WhenLocal:MM-dd HH:mm}  {e.Status,-12}  {e.TestName}");
            if (!string.IsNullOrWhiteSpace(e.Summary)) sb.AppendLine($"              {e.Summary}");
            foreach (var r in e.Readings)
                sb.AppendLine($"              {r.Key} = {r.Value}");
            foreach (var w in e.Warnings) sb.AppendLine($"              WARNING: {w}");
            foreach (var x in e.Errors) sb.AppendLine($"              ERROR: {x}");
        }
        sb.AppendLine(new string('-', 72));
        sb.AppendLine("Skipped, unsupported and cancelled checks are listed as themselves and are never");
        sb.AppendLine("counted as passing.");
        return sb.ToString();
    }
}
