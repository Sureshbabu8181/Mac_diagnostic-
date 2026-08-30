import { DiagnosticTest, DiagnosticResult } from '../../types';

export class MicrophoneDiagnostic implements DiagnosticTest {
  id = 'microphone';
  name = 'Microphone';
  category: 'hardware' = 'hardware';
  description = 'Records audio and plays it back to verify microphone input';
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
      message: 'Use the Record & Play option in the Microphone test to verify audio input',
      details: {
        'Test Type': 'Manual verification required',
        'Note': 'Open the microphone test to record and play back your voice.',
      },
      timestamp: new Date().toISOString(),
      supported: true,
    };
  }
}
