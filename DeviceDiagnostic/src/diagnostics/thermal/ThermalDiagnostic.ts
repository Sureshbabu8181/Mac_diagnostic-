import { DiagnosticTest, DiagnosticResult } from '../../types';

export class ThermalDiagnostic implements DiagnosticTest {
  id = 'thermal';
  name = 'Thermal';
  category: 'hardware' = 'hardware';
  description = 'Tests device temperature and thermal throttling status';
  icon = 'thermometer';

  async isSupported(): Promise<boolean> {
    return false;
  }

  async run(): Promise<DiagnosticResult> {
    return {
      testId: this.id,
      testName: this.name,
      category: this.category,
      status: 'NOT_SUPPORTED',
      message: 'Thermal sensor data is not available in Expo',
      details: {
        'Reason': 'No Expo module exposes device temperature sensors',
        'Alternative': 'Use native thermal APIs on ejected builds',
      },
      timestamp: new Date().toISOString(),
      supported: false,
    };
  }
}
