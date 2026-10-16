using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.IO;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using WindowsLaptopDiagnostics.Infrastructure;

namespace WindowsLaptopDiagnostics.Services;

/// <summary>A real Windows render endpoint, read from the Core Audio API.</summary>
public sealed record AudioEndpoint(string Id, string Name, bool IsDefault, float VolumeScalar, bool Muted, int Channels);

/// <summary>Which channels the speaker test drives. Each maps to a real routed signal.</summary>
public enum ToneRoute
{
    Left,
    Right,
    Stereo,
    Mono,
}

/// <summary>A real Windows capture endpoint (microphone), read from the Core Audio API.</summary>
public sealed record AudioInputEndpoint(string Id, string Name, bool IsDefault, int Channels);

/// <summary>
/// Audio hardware access: endpoint/input enumeration, channel-routed tone
/// playback, and microphone capture. Everything here talks to Windows
/// directly; callers never get to invent a reading.
/// </summary>
public static class AudioService
{
    private static readonly Guid MfaudioFormatFloat = new("00000003-0000-0010-8000-00aa00389b71");

    /// <summary>All active speaker/headphone endpoints, with live volume and mute state.</summary>
    public static IReadOnlyList<AudioEndpoint> RenderEndpoints()
    {
        var list = new List<AudioEndpoint>();
        try
        {
            using var enumerator = new MMDeviceEnumerator();
            string defaultId = "";
            try
            {
                if (enumerator.HasDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia))
                    defaultId = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia).ID;
            }
            catch { /* no default endpoint reported */ }

            foreach (MMDevice device in enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
            {
                using (device)
                {
                    float volume = 0f;
                    bool muted = false;
                    int channels = 0;
                    try
                    {
                        var endpointVolume = device.AudioEndpointVolume;
                        volume = endpointVolume.MasterVolumeLevelScalar;
                        muted = endpointVolume.Mute;
                    }
                    catch { /* endpoint without volume control */ }

                    try
                    {
                        // Mix format of this endpoint - not a guess about the device.
                        using var audioClient = device.AudioClient;
                        channels = audioClient.MixFormat.Channels;
                    }
                    catch { /* audio client unavailable */ }

                    list.Add(new AudioEndpoint(device.ID, device.FriendlyName, device.ID == defaultId, volume, muted, channels));
                }
            }
        }
        catch (Exception ex)
        {
            Logger.Warn("Render endpoint enumeration failed", ex);
        }
        return list;
    }

    /// <summary>Capture endpoints as reported by WASAPI - the same API used to open them.</summary>
    public static IReadOnlyList<AudioInputEndpoint> CaptureEndpoints()
    {
        var list = new List<AudioInputEndpoint>();
        try
        {
            using var enumerator = new MMDeviceEnumerator();
            string defaultId = "";
            try
            {
                if (enumerator.HasDefaultAudioEndpoint(DataFlow.Capture, Role.Multimedia))
                    defaultId = enumerator.GetDefaultAudioEndpoint(DataFlow.Capture, Role.Multimedia).ID;
            }
            catch { /* no default capture endpoint */ }

            foreach (MMDevice device in enumerator.EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active))
            {
                using (device)
                {
                    int channels = 0;
                    try
                    {
                        using var audioClient = device.AudioClient;
                        channels = audioClient.MixFormat.Channels;
                    }
                    catch { /* client unavailable */ }

                    list.Add(new AudioInputEndpoint(device.ID, device.FriendlyName, device.ID == defaultId, channels));
                }
            }
        }
        catch (Exception ex)
        {
            Logger.Warn("Capture endpoint enumeration failed", ex);
        }
        return list;
    }

    /// <summary>Describes exactly what a route sends, so the user knows what to listen for.</summary>
    public static string DescribeRoute(ToneRoute route, int channels) => route switch
    {
        ToneRoute.Left => "440 Hz tone in the LEFT channel only; the right channel stays silent.",
        ToneRoute.Right => channels >= 2
            ? "440 Hz tone in the RIGHT channel only; the left channel stays silent."
            : "Not routable: this endpoint reports a single channel.",
        ToneRoute.Stereo => channels >= 2
            ? "440 Hz in the left channel and 880 Hz in the right - different pitches prove separation."
            : "Not routable: this endpoint reports a single channel.",
        ToneRoute.Mono => $"The same 660 Hz tone in every channel ({channels}).",
        _ => "",
    };

    /// <summary>Opens the device, confirms its mix format, and starts a routed tone.</summary>
    public static ToneSession StartTone(AudioEndpoint endpoint, ToneRoute route, out string? error)
    {
        var session = new ToneSession();
        try
        {
            using (var enumerator = new MMDeviceEnumerator())
                session.Device = enumerator.GetDevice(endpoint.Id);

            WaveFormat mix;
            using (var audioClient = session.Device.AudioClient)
                mix = audioClient.MixFormat;

            if (mix.Channels < 2 && route is ToneRoute.Right or ToneRoute.Stereo)
            {
                session.Dispose();
                error = "This endpoint reports a single channel, so right/stereo routing cannot be produced.";
                return session;
            }

            bool isFloat = mix.Encoding == WaveFormatEncoding.IeeeFloat ||
                           (mix is WaveFormatExtensible ext && ext.SubFormat == MfaudioFormatFloat);
            bool isPcm16 = !isFloat && mix.Encoding == WaveFormatEncoding.Pcm && mix.BitsPerSample == 16;
            if (!isFloat && !isPcm16)
            {
                session.Dispose();
                error = $"The device mix format ({mix.BitsPerSample}-bit {mix.Encoding}) is not supported by this tone generator.";
                return session;
            }

            session.Output = new WasapiOut(session.Device, AudioClientShareMode.Shared, true, 50);
            session.Output.Init(new ToneWaveProvider(mix, route, isFloat));
            session.Output.Play();
            error = null;
            return session;
        }
        catch (Exception ex)
        {
            Logger.Warn($"Tone playback failed on {endpoint.Name}", ex);
            session.Dispose();
            error = ex.Message;
            return session;
        }
    }
}

/// <summary>Generates a routed sine tone directly in the device mix format.</summary>
internal sealed class ToneWaveProvider : IWaveProvider
{
    private readonly WaveFormat _format;
    private readonly double[] _frequency;
    private readonly bool _float;
    private long _sampleIndex;

    public WaveFormat WaveFormat => _format;

    public ToneWaveProvider(WaveFormat format, ToneRoute route, bool isFloat)
    {
        _format = format;
        _float = isFloat;
        _frequency = new double[format.Channels];
        switch (route)
        {
            case ToneRoute.Left:
                _frequency[0] = 440;
                break;
            case ToneRoute.Right:
                _frequency[Math.Min(1, format.Channels - 1)] = 440;
                break;
            case ToneRoute.Stereo:
                _frequency[0] = 440;
                if (format.Channels > 1) _frequency[1] = 880;
                break;
            case ToneRoute.Mono:
                for (int i = 0; i < _frequency.Length; i++) _frequency[i] = 660;
                break;
        }
    }

    public int Read(byte[] buffer, int offset, int count)
    {
        int blockAlign = _format.BlockAlign;
        int bytesPerSample = _format.BitsPerSample / 8;
        int frames = count / blockAlign;
        if (frames <= 0) return 0;

        var span = buffer.AsSpan(offset, frames * blockAlign);
        double sampleRate = _format.SampleRate;

        for (int f = 0; f < frames; f++)
        {
            double t = _sampleIndex / sampleRate;
            int frameOffset = f * blockAlign;
            for (int c = 0; c < _format.Channels; c++)
            {
                double amplitude = _frequency[c] > 0
                    ? Math.Sin(2 * Math.PI * _frequency[c] * t) * 0.30
                    : 0.0;
                int sampleOffset = frameOffset + c * bytesPerSample;
                if (_float)
                    BinaryPrimitives.WriteSingleLittleEndian(span.Slice(sampleOffset, 4), (float)amplitude);
                else
                    BinaryPrimitives.WriteInt16LittleEndian(span.Slice(sampleOffset, 2), (short)(amplitude * short.MaxValue));
            }
            _sampleIndex++;
        }
        return frames * blockAlign;
    }
}

/// <summary>An active tone playback; disposing stops and releases the endpoint.</summary>
public sealed class ToneSession : IDisposable
{
    internal MMDevice? Device;
    internal WasapiOut? Output;

    public bool IsPlaying => Output?.PlaybackState == PlaybackState.Playing;

    public void Dispose()
    {
        try { Output?.Stop(); } catch { /* already stopped */ }
        try { Output?.Dispose(); } catch { /* already disposed */ }
        Output = null;
        try { Device?.Dispose(); } catch { /* already disposed */ }
        Device = null;
    }
}

/// <summary>A single microphone capture batch handed to the view model.</summary>
public sealed record MicFrame(float Rms, float Peak, bool Clipped, float[] Waveform);

/// <summary>
/// Microphone capture session over WASAPI: live level/waveform plus a WAV
/// recording in the user temp directory. The recording is always written as
/// 16-bit PCM so playback never depends on what the device format happened to
/// be; the file is left on stop and deleted by the view model.
/// </summary>
public sealed class MicSession : IDisposable
{
    private readonly WasapiCapture _capture;
    private readonly MMDevice _device;
    private readonly object _gate = new();
    private WaveFileWriter? _writer;
    private readonly float[] _waveform;
    private long _lastRaise;
    private bool _clipped;
    private volatile bool _disposed;

    /// <summary>Raised on a capture thread at most every 60 ms.</summary>
    public event Action<MicFrame>? FrameAvailable;

    public bool IsRecording => _writer is not null;
    public string? RecordingPath { get; private set; }
    public string DeviceName { get; }
    public int Channels { get; }
    public int SampleRate { get; }

    /// <summary>Format actually opened — never assumed to equal what was asked for.</summary>
    public string FormatInfo { get; }

    public MicSession(AudioInputEndpoint endpoint, int sampleRate, int channels)
    {
        DeviceName = endpoint.Name;
        using (var enumerator = new MMDeviceEnumerator())
            _device = enumerator.GetDevice(endpoint.Id);

        // Ask for 16-bit PCM at the requested rate, but accept whatever the
        // endpoint actually supports rather than failing or pretending.
        var requested = new WaveFormat(sampleRate, 16, channels);
        WaveFormat chosen;
        using (var probe = _device.AudioClient)
        {
            chosen = probe.IsFormatSupported(AudioClientShareMode.Shared, requested)
                ? requested
                : probe.MixFormat;
        }

        _capture = new WasapiCapture(_device) { WaveFormat = chosen };
        Channels = chosen.Channels;
        SampleRate = chosen.SampleRate;
        FormatInfo = $"{chosen.SampleRate} Hz · {chosen.Channels} ch · {chosen.BitsPerSample}-bit {chosen.Encoding}" +
                     (ReferenceEquals(chosen, requested) ? " (as requested)" : " (device format — requested rate unsupported)");

        _waveform = new float[160];
        _capture.DataAvailable += OnData;
        _capture.RecordingStopped += (_, ex) =>
        {
            if (ex.Exception is not null) Logger.Warn("Microphone capture stopped with an error", ex.Exception);
        };
    }

    public void Start() => _capture.StartRecording();

    public void Stop()
    {
        try { _capture.StopRecording(); } catch { /* already stopped */ }
    }

    /// <summary>Starts writing capture frames to a new temp WAV file (16-bit PCM).</summary>
    public void StartRecording(string path)
    {
        lock (_gate)
        {
            if (_writer is not null) return;
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            _writer = new WaveFileWriter(path, new WaveFormat(SampleRate, 16, Channels));
            RecordingPath = path;
        }
    }

    /// <summary>Finalises the WAV file so it can be played back.</summary>
    public void StopRecording()
    {
        lock (_gate)
        {
            try { _writer?.Dispose(); } catch { /* flush failure already logged */ }
            _writer = null;
        }
    }

    public void ResetClipFlag() => _clipped = false;

    /// <summary>Decodes one sample from the device buffer to a −1..1 float.</summary>
    private static float Decode(ReadOnlySpan<byte> bytes, WaveFormat format)
    {
        if (format.Encoding == WaveFormatEncoding.IeeeFloat && format.BitsPerSample == 32)
            return BitConverter.ToSingle(bytes);
        return format.BitsPerSample switch
        {
            16 => BinaryPrimitives.ReadInt16LittleEndian(bytes) / 32768f,
            32 => BinaryPrimitives.ReadInt32LittleEndian(bytes) / 2147483648f,
            8 => (bytes[0] - 128) / 128f,
            _ => 0f,
        };
    }

    private void OnData(object? sender, WaveInEventArgs e)
    {
        if (_disposed) return;
        var format = _capture.WaveFormat;
        int bytesPerSample = format.BitsPerSample / 8;
        int blockAlign = format.BlockAlign;
        if (bytesPerSample <= 0 || blockAlign <= 0) return;

        int totalSamples = e.BytesRecorded / bytesPerSample;
        int frames = totalSamples / format.Channels;
        if (frames <= 0) return;

        var raw = e.Buffer.AsSpan(0, frames * blockAlign);
        double sumSquares = 0;
        float peak = 0f;

        // Envelope bins over this batch.
        int bins = _waveform.Length;
        Span<float> binPeak = stackalloc float[bins];

        for (int f = 0; f < frames; f++)
        {
            int frameOffset = f * blockAlign;
            float framePeak = 0f;
            for (int c = 0; c < format.Channels; c++)
            {
                var slice = raw.Slice(frameOffset + c * bytesPerSample, bytesPerSample);
                float v = Decode(slice, format);
                sumSquares += (double)v * v;
                float av = Math.Abs(v);
                if (av > peak) peak = av;
                if (av > framePeak) framePeak = av;
                if (v >= 0.99f || v <= -0.99f) _clipped = true;
            }

            int bin = (int)((long)f * bins / frames);
            if (bin >= bins) bin = bins - 1;
            if (framePeak > binPeak[bin]) binPeak[bin] = framePeak;
        }

        // Always record 16-bit PCM regardless of the device format.
        lock (_gate)
        {
            if (_writer is not null)
            {
                try
                {
                    var pcm = new byte[frames * format.Channels * 2];
                    int w = 0;
                    for (int f = 0; f < frames; f++)
                    {
                        for (int c = 0; c < format.Channels; c++)
                        {
                            var slice = raw.Slice(f * blockAlign + c * bytesPerSample, bytesPerSample);
                            float v = Math.Clamp(Decode(slice, format), -1f, 1f);
                            short s = (short)(v * short.MaxValue);
                            pcm[w++] = (byte)s;
                            pcm[w++] = (byte)(s >> 8);
                        }
                    }
                    _writer.Write(pcm, 0, w);
                }
                catch (Exception ex) { Logger.Warn("Microphone file write failed", ex); }
            }
        }

        for (int b = 0; b < bins; b++) _waveform[b] = binPeak[b];

        float rms = (float)Math.Sqrt(sumSquares / (frames * format.Channels));
        long now = Environment.TickCount64;
        if (now - _lastRaise < 60) return;
        _lastRaise = now;
        FrameAvailable?.Invoke(new MicFrame(rms, peak, _clipped, (float[])_waveform.Clone()));
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        Stop();
        StopRecording();
        _capture.DataAvailable -= OnData;
        try { _capture.Dispose(); } catch { /* already disposed */ }
        try { _device.Dispose(); } catch { /* already disposed */ }
        // The WAV file is intentionally kept: stopping capture is not the same
        // as discarding the recording. The view model deletes it on Delete,
        // Reset, or when the page is left.
    }
}
