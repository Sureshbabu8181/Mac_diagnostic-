import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:camera/camera.dart';
import 'package:record/record.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:path_provider/path_provider.dart';
import '../models/diagnostics.dart';
import '../services/tone_engine.dart';
import '../widgets/common.dart';

bool get _isAndroid => Platform.isAndroid;

/// Ships a widget for each manual test kind. Each widget reports its outcome
/// through [onVerdict] so the host screen can record + save the result.
class ManualTestBody extends StatelessWidget {
  final DiagnosticKind kind;
  final bool accent;
  final void Function(DiagnosticStatus status, String notes) onVerdict;
  const ManualTestBody({super.key, required this.kind, required this.onVerdict, this.accent = true});

  @override
  Widget build(BuildContext context) {
    switch (kind) {
      case DiagnosticKind.display:
        return DisplayTestPanel(onVerdict: onVerdict);
      case DiagnosticKind.keyboard:
        return KeyboardTestPanel(onVerdict: onVerdict);
      case DiagnosticKind.trackpad:
        return TrackpadTestPanel(onVerdict: onVerdict);
      case DiagnosticKind.speakers:
        return SpeakersTestPanel(onVerdict: onVerdict, accent: accent);
      case DiagnosticKind.microphone:
        return MicrophoneTestPanel(onVerdict: onVerdict, accent: accent);
      case DiagnosticKind.camera:
        return CameraTestPanel(onVerdict: onVerdict, accent: accent);
      default:
        return PortsTestPanel(onVerdict: onVerdict);
    }
  }
}

// ---------------------------------------------------------------------------
// Display: full-screen colour patterns (tap to cycle, long-press to exit)
// ---------------------------------------------------------------------------

class DisplayTestPanel extends StatefulWidget {
  final void Function(DiagnosticStatus, String) onVerdict;
  const DisplayTestPanel({super.key, required this.onVerdict});

  @override
  State<DisplayTestPanel> createState() => _DisplayTestPanelState();
}

class _DisplayTestPanelState extends State<DisplayTestPanel> {
  static const _patterns = ['Checkerboard', 'Color Bars', 'Grey Ramp', 'Gradient', 'Solid White', 'Solid Black'];
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: Center(
            child: AspectRatio(
              aspectRatio: 16 / 9,
              child: GestureDetector(
                onTap: () => setState(() => _index = (_index + 1) % _patterns.length),
                onLongPress: () => Navigator.of(context).pop(),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: CustomPaint(
                    painter: _PatternPainter(index: _index),
                    child: const SizedBox.expand(),
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text('${_patterns[_index]}  —  tap to change  ·  long-press to exit'),
        const SizedBox(height: 12),
      ],
    );
  }
}

class _PatternPainter extends CustomPainter {
  final int index;
  _PatternPainter({required this.index});

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    switch (index) {
      case 0: // checkerboard
        final cells = 8, step = w / cells;
        for (var r = 0; r < cells; r++) {
          for (var c = 0; c < cells; c++) {
            final paint = Paint()..color = ((r + c).isEven) ? Colors.black : Colors.white;
            canvas.drawRect(Rect.fromLTWH(c * step, r * step, step + 1, h / cells + 1), paint);
          }
        }
      case 1: // colour bars
        const colors = [Color(0xFFFFFFFF), Color(0xFFFFFF00), Color(0xFF00FFFF), Color(0xFF00FF00),
          Color(0xFFFF00FF), Color(0xFFFF0000), Color(0xFF0000FF), Color(0xFF000000)];
        final w2 = w / colors.length;
        for (var i = 0; i < colors.length; i++) {
          canvas.drawRect(Rect.fromLTWH(i * w2, 0, w2 + 1, h), Paint()..color = colors[i]);
        }
      case 2: // grey ramp
        final steps = 16, w2 = w / steps;
        for (var i = 0; i < steps; i++) {
          final v = (i / (steps - 1) * 255).round();
          canvas.drawRect(Rect.fromLTWH(i * w2, 0, w2 + 1, h), Paint()..color = Color.fromARGB(255, v, v, v));
        }
      case 3: // gradient
        canvas.drawRect(Offset.zero & size, Paint()..shader = const LinearGradient(
          colors: [Colors.black, Colors.blue, Colors.cyan, Colors.white]).createShader(Offset.zero & size));
      case 4: // solid white
        canvas.drawRect(Offset.zero & size, Paint()..color = Colors.white);
      default: // solid black
        canvas.drawRect(Offset.zero & size, Paint()..color = Colors.black);
    }
  }

  @override
  bool shouldRepaint(covariant _PatternPainter oldDelegate) => oldDelegate.index != index;
}

// ---------------------------------------------------------------------------
// Keyboard: tap each key to confirm it works
// ---------------------------------------------------------------------------

class KeyboardTestPanel extends StatefulWidget {
  final void Function(DiagnosticStatus, String) onVerdict;
  const KeyboardTestPanel({super.key, required this.onVerdict});

  @override
  State<KeyboardTestPanel> createState() => _KeyboardTestPanelState();
}

class _KeyboardTestPanelState extends State<KeyboardTestPanel> {
  static const _rows = [
    ['ESC', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'DEL'],
    ['TAB', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['CAPS', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'ENTER'],
    ['SHIFT', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', 'SHIFT'],
    ['CTRL', 'OPT', 'WIN', 'SPACE', 'WIN', 'OPT', 'MENU'],
  ];
  final Set<String> _pressed = {};

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (final row in _rows) ...[
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: row.map((key) {
              final isWide = key == 'SPACE';
              return Padding(
                padding: const EdgeInsets.all(3),
                child: InkWell(
                  onTap: () => setState(() {
                    if (!_pressed.add(key)) _pressed.remove(key);
                  }),
                  borderRadius: BorderRadius.circular(6),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 120),
                    width: isWide ? 180 : 44,
                    height: 40,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: _pressed.contains(key) ? Colors.green.shade200 : Colors.grey.shade300,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(key, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                  ),
                ),
              );
            }).toList(),
          ),
        ],
        const SizedBox(height: 12),
        Text('Pressed ${_pressed.length} of ${_rows.fold<int>(0, (a, r) => a + r.length)} keys (tap to toggle)'),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Trackpad: manual gesture checklist
// ---------------------------------------------------------------------------

class TrackpadTestPanel extends StatefulWidget {
  final void Function(DiagnosticStatus, String) onVerdict;
  const TrackpadTestPanel({super.key, required this.onVerdict});

  @override
  State<TrackpadTestPanel> createState() => _TrackpadTestPanelState();
}

class _TrackpadTestPanelState extends State<TrackpadTestPanel> {
  final Map<String, bool> _checks = {
    'Cursor moves smoothly': false,
    'Tap-to-click registers': false,
    'Secondary / right click': false,
    'Two-finger scroll': false,
    'Pinch zoom gesture': false,
    'Three-finger gestures': false,
  };

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final e in _checks.entries)
          CheckboxListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: Text(e.key),
            value: e.value,
            onChanged: (v) => setState(() => _checks[e.key] = v ?? false),
          ),
        const SizedBox(height: 4),
        Text(_isAndroid
            ? 'Android note: most laptops/tablets use a touchscreen or mouse; verify with the connected input device.'
            : 'Repeating gestures on the trackpad.'),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Speakers: local tone playback, left / right / stereo / mono
// ---------------------------------------------------------------------------

class SpeakersTestPanel extends StatefulWidget {
  final void Function(DiagnosticStatus, String) onVerdict;
  final bool accent;
  const SpeakersTestPanel({super.key, required this.onVerdict, this.accent = true});

  @override
  State<SpeakersTestPanel> createState() => _SpeakersTestPanelState();
}

class _SpeakersTestPanelState extends State<SpeakersTestPanel> {
  final ToneEngine _tones = ToneEngine();
  final String _output = '—';

  Future<void> _play({double? balance, double frequency = 440}) async {
    setState(() {});
    await _tones.play(balance: balance, frequency: frequency);
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.output),
          title: const Text('Output'),
          subtitle: Text(_output),
        ),
        Wrap(
          spacing: 10,
          children: [
            _toneButton('Left', Icons.arrow_back, () => _play(balance: -1)),
            _toneButton('Right', Icons.arrow_forward, () => _play(balance: 1)),
            _toneButton('Stereo', Icons.volume_up, () => _play()),
            _toneButton('Mono', Icons.album, () => _play(frequency: 220)),
            OutlinedButton.icon(onPressed: _tones.isPlaying ? _tones.stop : null, icon: const Icon(Icons.stop), label: const Text('Stop')),
          ],
        ),
        const SizedBox(height: 8),
        const Text('Volume is fixed at a safe level. Listen for clarity on both channels.'),
      ],
    );
  }

  Widget _toneButton(String label, IconData icon, VoidCallback fn) {
    return AccentButton(label: label, icon: icon, onPressed: fn, accent: widget.accent);
  }
}

// ---------------------------------------------------------------------------
// Microphone: temporary recording + playback + live level
// ---------------------------------------------------------------------------

class MicrophoneTestPanel extends StatefulWidget {
  final void Function(DiagnosticStatus, String) onVerdict;
  final bool accent;
  const MicrophoneTestPanel({super.key, required this.onVerdict, this.accent = true});

  @override
  State<MicrophoneTestPanel> createState() => _MicrophoneTestPanelState();
}

class _MicrophoneTestPanelState extends State<MicrophoneTestPanel> {
  final AudioRecorder _recorder = AudioRecorder();
  final AudioPlayer _player = AudioPlayer();
  Timer? _ticker;
  double _level = 0;
  bool _recording = false;
  bool _playing = false;
  bool _permission = false;
  String? _lastPath;
  String _permissionMessage = 'Requesting microphone permission…';

  @override
  void initState() {
    super.initState();
    _request();
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _player.dispose();
    _delete();
    super.dispose();
  }

  Future<void> _request() async {
    if (!_isAndroid) {
      setState(() => _permissionMessage = 'Microphone recording is supported on Android; on Windows this test is not available.');
      return;
    }
    final status = await Permission.microphone.request();
    setState(() {
      _permission = status.isGranted;
      _permissionMessage = status.isGranted ? 'Ready. Press Record. Sample is deleted after the test.' : 'Permission denied. Enable it in system settings and reopen.';
    });
  }

  Future<void> _start() async {
    final dir = await getTemporaryDirectory();
    final path = '${dir.path}/mic_test.m4a';
    await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc, numChannels: 1), path: path);
    setState(() => _recording = true);
    _ticker = Timer.periodic(const Duration(milliseconds: 150), (_) async {
      try {
        final amp = await _recorder.getAmplitude();
        if (mounted) setState(() => _level = (0.4 + amp.current).clamp(0.0, 1.0));
      } catch (_) {}
    });
  }

  Future<void> _stop() async {
    _ticker?.cancel();
    final path = await _recorder.stop();
    setState(() {
      _recording = false;
      _lastPath = path;
      _level = 0;
    });
  }

  Future<void> _play() async {
    final path = _lastPath;
    if (path == null) return;
    await _player.stop();
    await _player.play(DeviceFileSource(path));
    setState(() => _playing = true);
    _player.onPlayerStateChanged.listen((s) {
      if (s == PlayerState.completed) setState(() => _playing = false);
    });
  }

  Future<void> _delete() async {
    _ticker?.cancel();
    try {
      await _recorder.dispose();
    } catch (_) {}
    final path = _lastPath;
    if (path != null) {
      final f = File(path);
      if (await f.exists()) await f.delete();
    }
    _lastPath = null;
  }

  @override
  Widget build(BuildContext context) {
    if (!_isAndroid) {
      return Text(_permissionMessage);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(_permissionMessage),
        const SizedBox(height: 14),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: LinearProgressIndicator(
            value: _level,
            minHeight: 12,
            backgroundColor: Colors.grey.shade300,
            color: Colors.green,
          ),
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 10,
          children: [
            if (!_recording)
              AccentButton(
                label: 'RECORD',
                onPressed: _permission ? _start : null,
                accent: widget.accent,
                icon: Icons.fiber_manual_record,
              )
            else
              AccentButton(
                label: 'Stop Recording',
                onPressed: _stop,
                accent: widget.accent,
                icon: Icons.stop,
              ),
            if (_lastPath != null)
              OutlinedButton.icon(
                onPressed: _playing ? null : _play,
                icon: Icon(_playing ? Icons.pause : Icons.play_arrow),
                label: Text(_playing ? 'Playing…' : 'PLAYBACK'),
              ),
            OutlinedButton.icon(onPressed: () { _delete(); setState(() {}); }, icon: const Icon(Icons.delete), label: const Text('Delete')),
          ],
        ),
        const SizedBox(height: 6),
        Text(_recording ? 'Recording… speak now. Live level shown above.' : 'Play back the recording to verify input.'),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Camera: live preview (Android)
// ---------------------------------------------------------------------------

class CameraTestPanel extends StatefulWidget {
  final void Function(DiagnosticStatus, String) onVerdict;
  final bool accent;
  const CameraTestPanel({super.key, required this.onVerdict, this.accent = true});

  @override
  State<CameraTestPanel> createState() => _CameraTestPanelState();
}

class _CameraTestPanelState extends State<CameraTestPanel> {
  CameraController? _controller;
  bool _initializing = false;
  String? _error;
  int _frames = 0;
  Timer? _frameTimer;

  @override
  void dispose() {
    _frameTimer?.cancel();
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _enable() async {
    if (!_isAndroid) {
      setState(() => _error = 'Camera preview is only available on Android.');
      return;
    }
    setState(() { _initializing = true; _error = null; });
    try {
      final granted = await Permission.camera.request();
      if (!granted.isGranted) {
        setState(() { _initializing = false; _error = 'Camera permission denied.'; });
        return;
      }
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        setState(() { _initializing = false; _error = 'No camera found.'; });
        return;
      }
      final controller = CameraController(cameras.first, ResolutionPreset.medium, enableAudio: false);
      await controller.initialize();
      if (!mounted) return;
      setState(() { _controller = controller; _initializing = false; });
      _frameTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() => _frames = _frames + 1);
      });
    } catch (e) {
      setState(() { _initializing = false; _error = e.toString(); });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_error!, style: const TextStyle(color: Colors.red)),
          const SizedBox(height: 10),
          AccentButton(label: 'Start Camera', onPressed: _enable, accent: widget.accent, icon: Icons.camera),
        ],
      );
    }
    final controller = _controller;
    if (controller != null && controller.value.isInitialized) {
      return Column(
        children: [
          AspectRatio(
            aspectRatio: controller.value.aspectRatio,
            child: ClipRRect(borderRadius: BorderRadius.circular(8), child: CameraPreview(controller)),
          ),
          const SizedBox(height: 8),
          Text('Live preview running.'),
        ],
      );
    }
    return Center(
      child: _initializing
          ? const CircularProgressIndicator()
          : AccentButton(label: 'Start Camera', onPressed: _enable, accent: widget.accent, icon: Icons.camera),
    );
  }
}

// ---------------------------------------------------------------------------
// Ports: manual checklist
// ---------------------------------------------------------------------------

class PortsTestPanel extends StatefulWidget {
  final void Function(DiagnosticStatus, String) onVerdict;
  const PortsTestPanel({super.key, required this.onVerdict});

  @override
  State<PortsTestPanel> createState() => _PortsTestPanelState();
}

class _PortsTestPanelState extends State<PortsTestPanel> {
  final Map<String, bool> _checks = {
    'USB-C / Thunderbolt': false,
    'USB-A': false,
    'HDMI / DisplayPort': false,
    'Audio jack': false,
    'Ethernet': false,
    'SD card reader': false,
  };

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final e in _checks.entries)
          CheckboxListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: Text(e.key),
            value: e.value,
            onChanged: (v) => setState(() => _checks[e.key] = v ?? false),
          ),
        const Text('Tick the ports present and working on this device.'),
      ],
    );
  }
}