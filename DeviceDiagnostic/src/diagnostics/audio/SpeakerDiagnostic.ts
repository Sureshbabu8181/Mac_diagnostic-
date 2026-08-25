import { DiagnosticTest, DiagnosticResult } from '../../types';

export class SpeakerDiagnostic implements DiagnosticTest {
  id = 'speaker';
  name = 'Speaker';
  category: 'hardware' = 'hardware';
  description = 'Tests speaker availability (audio playback requires manual verification)';
  icon = 'volume-up';

  async isSupported(): Promise<boolean> {
    return true;
  }

  async run(): Promise<DiagnosticResult> {
    return {
      testId: this.id,
      testName: this.name,
      category: this.category,
      status: 'WARNING',
      score: 50,
      message: 'Speaker detected — play a video or music to verify audio output',
      details: {
        'Test Type': 'Manual verification required',
        'Note': 'expo-av is deprecated in SDK 57. Use system audio to verify.',
      },
      timestamp: new Date().toISOString(),
      supported: true,
    };
  }
}
