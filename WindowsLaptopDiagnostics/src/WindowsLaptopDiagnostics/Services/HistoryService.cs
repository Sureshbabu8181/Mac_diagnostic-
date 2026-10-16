using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using WindowsLaptopDiagnostics.Core;
using WindowsLaptopDiagnostics.Infrastructure;

namespace WindowsLaptopDiagnostics.Services;

/// <summary>One archived result. Serializable so history survives a restart.</summary>
public sealed class HistoryEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTime WhenUtc { get; set; } = DateTime.UtcNow;
    public string TestKey { get; set; } = "";
    public string TestName { get; set; } = "";
    public string Category { get; set; } = "";
    public string Status { get; set; } = nameof(TestStatus.NotRun);
    public string Summary { get; set; } = "";
    public double? DurationSeconds { get; set; }
    public bool UserConfirmed { get; set; }
    public List<KeyValuePair<string, string>> Readings { get; set; } = new();
    public List<string> Errors { get; set; } = new();
    public List<string> Warnings { get; set; } = new();

    public DateTime WhenLocal => WhenLocalFromUtc(WhenUtc);

    private static DateTime WhenLocalFromUtc(DateTime utc) =>
        utc == DateTime.MinValue ? DateTime.MinValue : utc.ToLocalTime();

    /// <summary>
    /// Converts a live outcome into an archived entry. Readings, errors and
    /// warnings are copied by value so a later mutation of the live object
    /// cannot silently rewrite what was already recorded.
    /// </summary>
    public static HistoryEntry From(TestOutcome o, string testKey, string testName, string category)
    {
        var e = new HistoryEntry
        {
            TestKey = testKey,
            TestName = testName,
            Category = category,
            Status = o.Status.Label(),
            Summary = o.Summary,
            DurationSeconds = o.DurationSeconds,
            UserConfirmed = o.UserConfirmed,
            WhenUtc = o.EndedAt ?? DateTime.UtcNow,
        };
        foreach (var r in o.Readings)
            e.Readings.Add(new KeyValuePair<string, string>(
                r.Name, string.IsNullOrEmpty(r.Unit) ? r.Value : $"{r.Value} {r.Unit}"));
        e.Errors.AddRange(o.Errors);
        e.Warnings.AddRange(o.Warnings);
        return e;
    }
}

/// <summary>
/// Append-only session history with JSON persistence. Results are written to
/// disk as they are recorded, so a crash cannot lose what was already measured.
/// Nothing here is ever fabricated: an entry exists only because a test ran.
/// </summary>
public static class HistoryService
{
    private static readonly string Dir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "WindowsLaptopDiagnostics", "history");

    private static readonly string FilePath = Path.Combine(Dir, "history.json");
    private static readonly object Gate = new();

    private static readonly JsonSerializerOptions Json = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private static readonly List<HistoryEntry> _entries = new();
    private static bool _loaded;

    public static string StoragePath => FilePath;

    /// <summary>Maximum entries kept on disk; oldest are dropped past this.</summary>
    public const int MaxEntries = 500;

    public static IReadOnlyList<HistoryEntry> Entries
    {
        get
        {
            lock (Gate)
            {
                EnsureLoaded();
                return _entries.ToArray();
            }
        }
    }

    public static void EnsureLoaded()
    {
        if (_loaded) return;
        _loaded = true;
        try
        {
            if (!File.Exists(FilePath)) return;
            var json = File.ReadAllText(FilePath);
            var list = JsonSerializer.Deserialize<List<HistoryEntry>>(json, Json);
            if (list is null) return;
            _entries.AddRange(list.OrderByDescending(e => e.WhenUtc));
        }
        catch (Exception ex)
        {
            // A corrupt file must not stop the app; report it and start empty.
            Logger.Warn($"History file unreadable, starting empty: {FilePath}", ex);
        }
    }

    public static HistoryEntry Record(TestOutcome outcome, string testKey, string testName, string category)
    {
        var entry = HistoryEntry.From(outcome, testKey, testName, category);
        lock (Gate)
        {
            EnsureLoaded();
            _entries.Insert(0, entry);
            if (_entries.Count > MaxEntries)
                _entries.RemoveRange(MaxEntries, _entries.Count - MaxEntries);
            SaveUnsafe();
        }
        return entry;
    }

    public static void Clear()
    {
        lock (Gate)
        {
            EnsureLoaded();
            _entries.Clear();
            SaveUnsafe();
        }
    }

    private static void SaveUnsafe()
    {
        try
        {
            Directory.CreateDirectory(Dir);
            // Write to a temp file then replace, so an interrupted write cannot
            // truncate the only copy of the history.
            var tmp = FilePath + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(_entries, Json));
            File.Copy(tmp, FilePath, overwrite: true);
            File.Delete(tmp);
        }
        catch (Exception ex)
        {
            Logger.Error($"History could not be written: {FilePath}", ex);
        }
    }

    /// <summary>Case-insensitive search across name, status, summary and readings.</summary>
    public static List<HistoryEntry> Query(
        string? text = null, string? status = null, string? category = null,
        int? lastHours = null, bool sortNewestFirst = true)
    {
        IEnumerable<HistoryEntry> q = Entries;

        if (!string.IsNullOrWhiteSpace(text))
        {
            string t = text.Trim();
            q = q.Where(e =>
                e.TestName.Contains(t, StringComparison.OrdinalIgnoreCase) ||
                e.Summary.Contains(t, StringComparison.OrdinalIgnoreCase) ||
                e.Status.Contains(t, StringComparison.OrdinalIgnoreCase) ||
                e.Category.Contains(t, StringComparison.OrdinalIgnoreCase) ||
                e.Readings.Any(r => r.Value.Contains(t, StringComparison.OrdinalIgnoreCase) ||
                                    r.Key.Contains(t, StringComparison.OrdinalIgnoreCase)));
        }

        if (!string.IsNullOrWhiteSpace(status))
            q = q.Where(e => e.Status.Equals(status, StringComparison.OrdinalIgnoreCase));

        if (!string.IsNullOrWhiteSpace(category))
            q = q.Where(e => e.Category.Equals(category, StringComparison.OrdinalIgnoreCase));

        if (lastHours is { } h && h > 0)
        {
            var cut = DateTime.UtcNow.AddHours(-h);
            q = q.Where(e => e.WhenUtc >= cut);
        }

        return sortNewestFirst
            ? q.OrderByDescending(e => e.WhenUtc).ToList()
            : q.OrderBy(e => e.WhenUtc).ToList();
    }
}
