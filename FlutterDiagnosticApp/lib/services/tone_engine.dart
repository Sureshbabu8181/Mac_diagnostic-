import 'dart:math';
import 'dart:typed_data';
import 'package:audioplayers/audioplayers.dart';

/// Synthesizes short sine-wave tones locally (no audio assets) and plays them
/// through left / right / stereo / mono. Volume is fixed at a safe level.
class ToneEngine {
  final AudioPlayer _player = AudioPlayer();

  bool get isPlaying => _player.state == PlayerState.playing;

  Future<void> play({
    double frequency = 440,
    double seconds = 0.8,
    double volume = 0.25,
    double? balance,
  }) async {
    final wav = _sineWav(frequency: frequency, seconds: seconds, volume: volume);
    await _player.stop();
    await _player.setPlayerMode(PlayerMode.mediaPlayer);
    await _player.setBalance(balance ?? 0.0);
    await _player.play(BytesSource(wav));
  }

  Future<void> stop() async => _player.stop();

  static Uint8List _sineWav({required double frequency, required double seconds, required double volume}) {
    const rate = 44100;
    final count = (rate * seconds).round();
    final dataBytes = count * 2;
    final bytes = BytesBuilder(copy: false);

    void writeString(String s) {
      for (final c in s.codeUnits) {
        bytes.addByte(c);
      }
    }

    void writeInt(int v) {
      for (final s in [24, 16, 8, 0]) {
        bytes.addByte((v >> s) & 0xFF);
      }
    }

    void writeShort(int v) {
      bytes.addByte(v & 0xFF);
      bytes.addByte((v >> 8) & 0xFF);
    }

    writeString('RIFF');
    writeInt(36 + dataBytes);
    writeString('WAVE');
    writeString('fmt ');
    writeInt(16);
    writeShort(1); // PCM
    writeShort(1); // mono
    writeInt(rate);
    writeInt(rate * 2);
    writeShort(2);
    writeShort(16);
    writeString('data');
    writeInt(dataBytes);

    for (var i = 0; i < count; i++) {
      final t = i / rate;
      final envelope = (1.0 - (i / count)).clamp(0.0, 1.0);
      final sample = (sin(2 * pi * frequency * t) * volume * envelope * 32767).round().clamp(-32768, 32767);
      writeShort(sample);
    }
    return bytes.toBytes();
  }
}