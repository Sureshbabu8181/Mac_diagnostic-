import { DiagnosticTest, DiagnosticResult } from '../../types';
import { Platform } from 'react-native';

export class SIMDiagnostic implements DiagnosticTest {
  id = 'sim';
  name = 'SIM Card';
  category: 'connectivity' = 'connectivity';
  description = 'Checks SIM card presence and carrier information';
  icon = 'smartphone';

  async isSupported(): Promise<boolean> {
    return false;
  }

  async run(): Promise<DiagnosticResult> {
    const platformName = Platform.OS === 'android' ? 'Android' : 'iOS';
    return {
      testId: this.id,
      testName: this.name,
      category: this.category,
      status: 'NOT_SUPPORTED',
      message: 'SIM presence detection is not available in this build',
      details: {
        'Platform': platformName,
        'Presence': 'Requires native TelephonyManager access',
        'Reason': 'No Expo managed API for SIM card status (Android TelephonyManager / iOS CoreTelephony)',
        'Workflow': 'Eject to a native build or use a SIM-info native module to check SIM presence',
      },
      timestamp: new Date().toISOString(),
      supported: false,
    };
  }
}
