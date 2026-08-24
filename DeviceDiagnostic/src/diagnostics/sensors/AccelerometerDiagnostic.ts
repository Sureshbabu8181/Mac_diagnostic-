import { DiagnosticTest, DiagnosticResult } from '../../types';
import { Accelerometer } from 'expo-sensors';

export class AccelerometerDiagnostic implements DiagnosticTest {
  id = 'accelerometer';
  name = 'Accelerometer';
  category: 'sensors' = 'sensors';
  description = 'Tests accelerometer sensor for motion detection and orientation';
  icon = 'move';

  async isSupported(): Promise<boolean> {
    try {
      const available = await Accelerometer.isAvailableAsync();
      return available;
    } catch {
      return false;
    }
  }

  async run(onProgress?: (msg: string) => void): Promise<DiagnosticResult> {
    return new Promise((resolve) => {
      let resolved = false;

      const cleanup = () => {
        Accelerometer.removeAllListeners();
        Accelerometer.setUpdateInterval(1000);
      };

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({
            testId: this.id,
            testName: this.name,
            category: this.category,
            status: 'WARNING',
            message: 'Accelerometer did not return data within timeout',
            details: {},
            timestamp: new Date().toISOString(),
            supported: true,
          });
        }
      }, 3000);

      onProgress?.('Subscribing to accelerometer data...');

      Accelerometer.setUpdateInterval(100);
      const subscription = Accelerometer.addListener(({ x, y, z }) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        cleanup();
        if (subscription) subscription.remove();

        const magnitude = Math.sqrt(x * x + y * y + z * z);
        const hasVariation = Math.abs(x) > 0.01 || Math.abs(y) > 0.01 || Math.abs(z - 1) > 0.01;

        resolve({
          testId: this.id,
          testName: this.name,
          category: this.category,
          status: hasVariation ? 'PASS' : 'WARNING',
          score: hasVariation ? 100 : 60,
          message: hasVariation
            ? 'Accelerometer is detecting motion'
            : 'Accelerometer returned static values - device may be stationary',
          details: {
            'X': x.toFixed(4),
            'Y': y.toFixed(4),
            'Z': z.toFixed(4),
            'Magnitude': magnitude.toFixed(4),
            'Unit': 'g (gravity)',
          },
          timestamp: new Date().toISOString(),
          supported: true,
        });
      });
    });
  }
}
