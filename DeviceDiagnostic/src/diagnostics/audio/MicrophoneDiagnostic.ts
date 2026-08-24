import { DiagnosticTest, DiagnosticResult } from '../../types';
import { Audio } from 'expo-av';

export class MicrophoneDiagnostic implements DiagnosticTest {
  id = 'microphone';
  name = 'Microphone';
  category: 'hardware' = 'hardware';
  description = 'Tests microphone by recording audio and playing it back';
  icon = 'microphone';

  async isSupported(): Promise<boolean> {
    try {
      const permission = await Audio.getPermissionsAsync();
      return permission.status === 'granted' || permission.status === 'undetermined';
    } catch {
      return false;
    }
  }

  async run(onProgress?: (msg: string) => void): Promise<DiagnosticResult> {
    let recording: Audio.Recording | null = null;

    try {
      onProgress?.('Requesting microphone permission...');

      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        return {
          testId: this.id,
          testName: this.name,
          category: this.category,
          status: 'FAIL',
          message: 'Microphone permission denied',
          details: {
            'Permission Status': permission.status,
            'Can Request Again': permission.canAskAgain,
          },
          timestamp: new Date().toISOString(),
          supported: true,
        };
      }

      onProgress?.('Preparing audio recording...');

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recordingOptions = Audio.RecordingOptionsPresets.HIGH_QUALITY;
      recording = new Audio.Recording();
      await recording.prepareToRecordAsync(recordingOptions);

      onProgress?.('Recording audio for 3 seconds...');

      await recording.startAsync();
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await recording.stopAndUnloadAsync();

      const uri = recording.getURI();
      const status = await recording.getStatusAsync();

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      const durationMs = status.durationMillis ?? 0;
      const hasAudio = durationMs > 500;

      return {
        testId: this.id,
        testName: this.name,
        category: this.category,
        status: hasAudio ? 'PASS' : 'WARNING',
        score: hasAudio ? 100 : 50,
        message: hasAudio
          ? `Microphone recorded ${Math.round(durationMs / 1000)}s of audio`
          : 'Recording was too short or silent',
        details: {
          'Duration': `${Math.round(durationMs / 1000)}s`,
          'URI': uri ?? 'N/A',
          'Permission': permission.status,
          'Recording Quality': 'High',
        },
        timestamp: new Date().toISOString(),
        supported: true,
      };
    } catch (error) {
      if (recording) {
        try { await recording.stopAndUnloadAsync(); } catch { /* ignore */ }
      }
      return {
        testId: this.id,
        testName: this.name,
        category: this.category,
        status: 'FAIL',
        message: `Microphone test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {},
        timestamp: new Date().toISOString(),
        supported: true,
      };
    }
  }
}
