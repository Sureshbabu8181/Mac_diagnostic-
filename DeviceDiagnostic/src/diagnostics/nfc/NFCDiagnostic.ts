import { DiagnosticTest, DiagnosticResult } from '../../types';

export class NFCDiagnostic implements DiagnosticTest {
  id = 'nfc';
  name = 'NFC';
  category: 'connectivity' = 'connectivity';
  description = 'Tests NFC reader/writer and tag detection';
  icon = 'radio';

  async isSupported(): Promise<boolean> {
    return false;
  }

  async run(): Promise<DiagnosticResult> {
    return {
      testId: this.id,
      testName: this.name,
      category: this.category,
      status: 'NOT_SUPPORTED',
      message: 'NFC is not available in Expo managed workflow',
      details: {
        'Reason': 'No Expo module provides NFC APIs',
        'Alternative': 'Use react-native-nfc-manager on ejected builds',
      },
      timestamp: new Date().toISOString(),
      supported: false,
    };
  }
}
