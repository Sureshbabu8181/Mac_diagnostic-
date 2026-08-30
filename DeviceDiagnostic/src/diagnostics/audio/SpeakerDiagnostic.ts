import { DiagnosticTest, DiagnosticResult } from '../../types';

export class SpeakerDiagnostic implements DiagnosticTest {
  id = 'speaker';
  name = 'Speaker';
  category: 'hardware' = 'hardware';
  description = 'Plays test tones to verify loud speaker and earpiece output';
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
      message: 'Use the Speaker test tones to verify loud speaker and earpiece output',
      details: {
        'Test Type': 'Manual verification required',
        'Note': 'Open the speaker test to play tones and confirm each speaker.',
      },
      timestamp: new Date().toISOString(),
      supported: true,
    };
  }
}
