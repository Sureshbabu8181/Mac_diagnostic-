import { DiagnosticTest, DiagnosticResult } from '../../types';

export class LightDiagnostic implements DiagnosticTest {
  id = 'light';
  name = 'Ambient Light Sensor';
  category: 'sensors' = 'sensors';
  description = 'Tests ambient light sensor for brightness detection';
  icon = 'sun';

  async isSupported(): Promise<boolean> {
    return false;
  }

  async run(): Promise<DiagnosticResult> {
    return {
      testId: this.id,
      testName: this.name,
      category: this.category,
      status: 'NOT_SUPPORTED',
      message: 'Ambient light sensor is not available via Expo APIs',
      details: {
        'Reason': 'No Expo module exposes ambient light sensor data',
        'Alternative': 'Use a native module or device-specific library',
      },
      timestamp: new Date().toISOString(),
      supported: false,
    };
  }
}
