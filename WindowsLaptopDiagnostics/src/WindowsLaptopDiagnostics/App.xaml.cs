using System;
using System.Windows;
using System.Windows.Threading;
using WindowsLaptopDiagnostics.Infrastructure;

namespace WindowsLaptopDiagnostics;

/// <summary>Application entry point.</summary>
public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        // Log-and-continue: an unexpected UI exception must not silently kill the
        // process (a hard crash loses unsaved results). The user is told, and
        // diagnostics that are not running are left untouched.
        DispatcherUnhandledException += OnDispatcherUnhandledException;
        AppDomain.CurrentDomain.UnhandledException += OnDomainUnhandledException;
        base.OnStartup(e);
    }

    private void OnDispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        try
        {
            Logger.Error("Unhandled UI exception", e.Exception);
            var message = e.Exception is null
                ? "An unexpected error occurred."
                : $"An unexpected error occurred:\n\n{e.Exception.Message}";
            MessageBox.Show(
                message,
                "Windows Laptop Diagnostics",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
            e.Handled = true;
        }
        catch
        {
            // Never let the error reporter itself crash the app.
        }
    }

    private static void OnDomainUnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        try
        {
            if (e.ExceptionObject is Exception ex) Logger.Error("Unhandled domain exception", ex);
        }
        catch { /* best effort */ }
    }
}
