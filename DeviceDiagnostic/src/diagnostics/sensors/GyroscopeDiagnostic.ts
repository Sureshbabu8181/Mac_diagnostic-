import { DiagnosticTest, DiagnosticResult } from '../../types';
import { Gyroscope } from 'expo-sensors';

export class GyroscopeDiagnostic implements DiagnosticTest {
  id = 'gyroscope';
  name = 'Gyroscope';
  category: 'sensors' = 'sensors';
  description = 'Tests gyroscope sensor for angular velocity measurement';
  icon = 'refresh-cw';

  async isSupported(): Promise<boolean> {
    try {
      const available = await Gyroscope.isAvailableAsync();
      return available;
    } catch {
      return false;
    }
  }

  async run(onProgress?: (msg: string) => void): Promise<DiagnosticResult> {
    return new Promise((resolve) => {
      let resolved = false;

      const cleanup = () => {
        Gyroscope.removeAllListeners();
        Gyroscope.setUpdateInterval(1000);
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
            message: 'Gyroscope did not return data within timeout',
            details: {},
            timestamp: new Date().toISOString(),
            supported: true,
          });
        }
      }, 3000);

      onProgress?.('Subscribing to gyroscope data...');

      Gyroscope.setUpdateInterval(100);
      const subscription = Gyroscope.addListener(({ x, y, z }) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        cleanup();
        if (subscription) subscription.remove();

        const hasRotation = Math.abs(x) > 0.01 || Math.abs(y) > 0.01 || Math.abs(z) > 0.01;

        resolve({
          testId: this.id,
          testName: this.name,
          category: this.category,
          status: hasRotation ? 'PASS' : 'WARNING',
          score: hasRotation ? 100 : 60,
          message: hasRotation
            ? 'Gyroscope is detecting rotation'
            : 'Gyroscope returned zero values - device may be stationary',
          details: {
            'X': `${x.toFixed(4)} rad/s`,
            'Y': `${y.toFixed(4)} rad/s`,
            'Z': `${z.toFixed(4)} rad/s`,
            'Unit': 'radians/second',
          },
          timestamp: new Date().toISOString(),
          supported: true,
        });
      });
    });
  }
}
