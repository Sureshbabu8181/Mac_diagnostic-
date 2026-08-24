import { DiagnosticTest, DiagnosticResult } from '../../types';

export class ProximityDiagnostic implements DiagnosticTest {
  id = 'proximity';
  name = 'Proximity Sensor';
  category: 'sensors' = 'sensors';
  description = 'Tests proximity sensor for object detection near the screen';
  icon = 'scan';

  async isSupported(): Promise<boolean> {
    return false;
  }

  async run(): Promise<DiagnosticResult> {
    return {
      testId: this.id,
      testName: this.name,
      category: this.category,
      status: 'NOT_SUPPORTED',
      message: 'Proximity sensor is not available via Expo APIs',
      details: {
        'Reason': 'No Expo module exposes proximity sensor data',
        'Alternative': 'Use a native module or device-specific library',
      },
      timestamp: new Date().toISOString(),
      supported: false,
    };
  }
}
