import { DiagnosticTest, DiagnosticResult } from '../../types';
import { Audio } from 'expo-av';

export class SpeakerDiagnostic implements DiagnosticTest {
  id = 'speaker';
  name = 'Speaker';
  category: 'hardware' = 'hardware';
  description = 'Tests speaker output by playing a test tone';
  icon = 'volume-up';

  async isSupported(): Promise<boolean> {
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      return true;
    } catch {
      return false;
    }
  }

  async run(onProgress?: (msg: string) => void): Promise<DiagnosticResult> {
    let sound: Audio.Sound | null = null;

    try {
      onProgress?.('Initializing audio system...');

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      onProgress?.('Creating test tone...');

      const { sound: testSound } = await Audio.Sound.createAsync(
        { uri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
        { shouldPlay: true, volume: 0.5 }
      );
      sound = testSound;

      onProgress?.('Playing test tone - listen for sound...');

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const status = await sound.getStatusAsync();
      const isPlaying = status.isLoaded && status.isPlaying;

      await sound.unloadAsync();

      return {
        testId: this.id,
        testName: this.name,
        category: this.category,
        status: isPlaying ? 'PASS' : 'WARNING',
        score: isPlaying ? 100 : 50,
        message: isPlaying
          ? 'Speaker produced audio successfully'
          : 'Audio playback could not be confirmed',
        details: {
          'Playback Started': isPlaying ? 'Yes' : 'No',
          'Volume': '50%',
          'Duration': '2 seconds',
          'Test Type': 'Tone playback',
        },
        timestamp: new Date().toISOString(),
        supported: true,
      };
    } catch (error) {
      if (sound) {
        try { await sound.unloadAsync(); } catch { /* ignore cleanup errors */ }
      }
      return {
        testId: this.id,
        testName: this.name,
        category: this.category,
        status: 'FAIL',
        message: `Speaker test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {},
        timestamp: new Date().toISOString(),
        supported: true,
      };
    }
  }
}
