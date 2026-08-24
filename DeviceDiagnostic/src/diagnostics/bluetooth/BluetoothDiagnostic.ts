import { DiagnosticTest, DiagnosticResult } from '../../types';

export class BluetoothDiagnostic implements DiagnosticTest {
  id = 'bluetooth';
  name = 'Bluetooth';
  category: 'connectivity' = 'connectivity';
  description = 'Tests Bluetooth connectivity and paired devices';
  icon = 'bluetooth';

  async isSupported(): Promise<boolean> {
    return false;
  }

  async run(): Promise<DiagnosticResult> {
    return {
      testId: this.id,
      testName: this.name,
      category: this.category,
      status: 'NOT_SUPPORTED',
      message: 'Bluetooth requires a native module not available in Expo',
      details: {
        'Reason': 'No Expo module provides Bluetooth API access',
        'Alternative': 'Use react-native-bluetooth or a custom native module',
      },
      timestamp: new Date().toISOString(),
      supported: false,
    };
  }
}
