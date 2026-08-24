import { DiagnosticTest, DiagnosticResult } from '../../types';

export class SIMDiagnostic implements DiagnosticTest {
  id = 'sim';
  name = 'SIM Card';
  category: 'connectivity' = 'connectivity';
  description = 'Tests SIM card presence and carrier information';
  icon = 'smartphone';

  async isSupported(): Promise<boolean> {
    return false;
  }

  async run(): Promise<DiagnosticResult> {
    return {
      testId: this.id,
      testName: this.name,
      category: this.category,
      status: 'NOT_SUPPORTED',
      message: 'SIM card detection is not available in Expo managed workflow',
      details: {
        'Reason': 'Requires native telephony APIs (Android TelephonyManager / iOS CoreTelephony)',
        'Alternative': 'Use a native module for SIM info on ejected builds',
      },
      timestamp: new Date().toISOString(),
      supported: false,
    };
  }
}
