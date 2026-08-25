import { DiagnosticTest, DiagnosticResult } from '../../types';

export class MicrophoneDiagnostic implements DiagnosticTest {
  id = 'microphone';
  name = 'Microphone';
  category: 'hardware' = 'hardware';
  description = 'Tests microphone availability (recording requires manual verification)';
  icon = 'microphone';

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
      message: 'Microphone detected — use a voice recorder app to verify audio input',
      details: {
        'Test Type': 'Manual verification required',
        'Note': 'expo-av is deprecated in SDK 57. Use system recorder to verify.',
      },
      timestamp: new Date().toISOString(),
      supported: true,
    };
  }
}
