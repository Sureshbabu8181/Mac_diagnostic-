using System;
using System.Runtime.InteropServices;
using System.Threading;
using OpenCvSharp;
using WindowsLaptopDiagnostics.Infrastructure;

namespace WindowsLaptopDiagnostics.Services;

/// <summary>A camera found by probing the Windows imaging stack.</summary>
public sealed record CameraProbe(int Index, string Backend, int Width, int Height, double ReportedFps, string? Error);

/// <summary>
/// Camera access: probes real devices with OpenCV, streams frames on a
/// background thread, and reports measured FPS rather than trusting the
/// advertised value. Disposal always releases the device.
/// </summary>
public sealed class CameraSession : IDisposable
{
    private readonly VideoCapture _capture;
    private readonly CancellationTokenSource _cts = new();
    private Thread? _loop;
    private volatile bool _disposed;

    public int Index { get; }
    public string Backend { get; private set; } = "";
    public int Width { get; private set; }
    public int Height { get; private set; }
    public double ReportedFps { get; private set; }
    public long FrameCount { get; private set; }
    public string? LastError { get; private set; }

    /// <summary>Raised from the capture thread with a BGRA frame ready for display.</summary>
    public event Action<byte[], int, int, int>? FrameAvailable;

    public CameraSession(int index)
    {
        Index = index;
        _capture = new VideoCapture(index, VideoCaptureAPIs.MSMF);
        if (!_capture.IsOpened())
        {
            _capture.Release();
            _capture.Dispose();
            _capture = new VideoCapture(index, VideoCaptureAPIs.DSHOW);
        }

        if (!_capture.IsOpened())
            throw new InvalidOperationException($"Camera {index} did not open with MSMF or DirectShow. The device may be in use by another application.");

        Backend = _capture.GetBackendName() ?? "unknown";
        Width = (int)_capture.Get(VideoCaptureProperties.FrameWidth);
        Height = (int)_capture.Get(VideoCaptureProperties.FrameHeight);
        ReportedFps = _capture.Get(VideoCaptureProperties.Fps);
    }

    /// <summary>Starts the background read loop. Call after subscribing so no frame is missed.</summary>
    public void Start()
    {
        if (_loop is { IsAlive: true }) return;
        _loop = new Thread(ReadLoop) { IsBackground = true, Name = "camera-read" };
        _loop.Start();
    }

    private void ReadLoop()
    {
        using var frame = new Mat();
        using var bgra = new Mat();
        long windowStart = Environment.TickCount64;
        long windowFrames = 0;
        long emptyStreak = 0;

        while (!_cts.IsCancellationRequested && !_disposed)
        {
            bool ok;
            try { ok = _capture.Read(frame); }
            catch (Exception ex)
            {
                LastError = ex.Message;
                Logger.Warn("Camera read failed", ex);
                break;
            }

            if (!ok || frame.Empty())
            {
                // A transient empty frame is normal; sustained failure is not.
                if (++emptyStreak > 120)
                {
                    LastError = "The camera stopped delivering frames.";
                    break;
                }
                Thread.Sleep(15);
                continue;
            }
            emptyStreak = 0;

            try
            {
                if (frame.Channels() == 1) Cv2.CvtColor(frame, bgra, ColorConversionCodes.GRAY2BGRA);
                else if (frame.Channels() == 3) Cv2.CvtColor(frame, bgra, ColorConversionCodes.BGR2BGRA);
                else frame.CopyTo(bgra); // already BGRA-family

                int w = bgra.Cols, h = bgra.Rows, stride = w * 4;
                var pixels = new byte[stride * h];
                Marshal.Copy(bgra.Data, pixels, 0, pixels.Length);

                FrameCount++;
                FrameAvailable?.Invoke(pixels, w, h, stride);

                windowFrames++;
                long now = Environment.TickCount64;
                long elapsed = now - windowStart;
                if (elapsed >= 2000)
                {
                    MeasuredFps = windowFrames * 1000.0 / elapsed;
                    FPSUpdated?.Invoke(MeasuredFps);
                    windowFrames = 0;
                    windowStart = now;
                }
            }
            catch (Exception ex)
            {
                LastError = ex.Message;
                Logger.Warn("Camera frame conversion failed", ex);
                break;
            }
        }
    }

    /// <summary>Frames per second measured over the most recent 2-second window.</summary>
    public double MeasuredFps { get; private set; }

    /// <summary>Raised from the capture thread whenever a fresh FPS window closes.</summary>
    public event Action<double>? FPSUpdated;

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        try { _cts.Cancel(); } catch { /* already cancelled */ }
        try
        {
            if (_loop is { IsAlive: true } && _loop != Thread.CurrentThread) _loop.Join(2000);
        }
        catch { /* join interrupted */ }
        try { _capture.Release(); } catch { /* already released */ }
        try { _capture.Dispose(); } catch { /* already disposed */ }
        try { _cts.Dispose(); } catch { /* already disposed */ }
    }
}
