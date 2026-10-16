using System;
using System.Diagnostics;
using System.IO;

namespace WindowsLaptopDiagnostics.Infrastructure;

/// <summary>
/// Minimal file logger for unexpected errors.
///
/// Writes to %LOCALAPPDATA%\WindowsLaptopDiagnostics\logs and keeps the log
/// bounded (rotated at a fixed size) so it can never fill the disk. No
/// diagnostic data or hardware identifiers are uploaded — this is a local file
/// only. Logging failures are swallowed so a full disk or locked file can never
/// crash the application.
/// </summary>
public static class Logger
{
    private static readonly object Sync = new();
    private const long MaxBytes = 2 * 1024 * 1024; // rotate at 2 MB
    private const string FileName = "app.log";

    public static string LogDirectory =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "WindowsLaptopDiagnostics", "logs");

    public static string LogFilePath => Path.Combine(LogDirectory, FileName);

    public static void Error(string message, Exception? ex = null)
    {
        Write("ERROR", message, ex);
    }

    public static void Info(string message)
    {
        Write("INFO", message, null);
    }

    public static void Warn(string message, Exception? ex = null)
    {
        Write("WARN", message, ex);
    }

    private static void Write(string level, string message, Exception? ex)
    {
        try
        {
            lock (Sync)
            {
                Directory.CreateDirectory(LogDirectory);
                RotateIfNeeded();

                using var writer = new StreamWriter(LogFilePath, append: true);
                writer.WriteLine($"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} [{level}] {message}");
                if (ex is not null)
                {
                    writer.WriteLine($"    {ex.GetType().FullName}: {ex.Message}");
                    if (!string.IsNullOrWhiteSpace(ex.StackTrace))
                        writer.WriteLine("    " + ex.StackTrace.Replace("\n", "\n    ").TrimEnd());
                }
            }
        }
        catch
        {
            // Logging must never throw into the caller.
        }
    }

    private static void RotateIfNeeded()
    {
        try
        {
            var info = new FileInfo(LogFilePath);
            if (!info.Exists || info.Length < MaxBytes) return;

            var rotated = LogFilePath + ".1";
            if (File.Exists(rotated)) File.Delete(rotated);
            File.Move(LogFilePath, rotated);
        }
        catch
        {
            // If rotation fails, keep appending rather than failing the write.
        }
    }
}
