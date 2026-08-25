import { DiagnosticTest, DiagnosticResult } from '../../types';
import * as Sensors from 'expo-sensors';

export class MagnetometerDiagnostic implements DiagnosticTest {
  id = 'magnetometer';
  name = 'Magnetometer';
  category: 'sensors' = 'sensors';
  description = 'Tests magnetometer sensor for magnetic field detection and compass functionality';
  icon = 'compass';

  async isSupported(): Promise<boolean> {
    try {
      const available = await Sensors.Magnetometer.isAvailableAsync();
      return available;
    } catch {
      return false;
    }
  }

  async run(onProgress?: (msg: string) => void): Promise<DiagnosticResult> {
    return new Promise((resolve) => {
      let resolved = false;

      const cleanup = () => {
        Sensors.Magnetometer.removeAllListeners();
        Sensors.Magnetometer.setUpdateInterval(1000);
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
            message: 'Magnetometer did not return data within timeout',
            details: {},
            timestamp: new Date().toISOString(),
            supported: true,
          });
        }
      }, 3000);

      onProgress?.('Subscribing to magnetometer data...');

      Sensors.Magnetometer.setUpdateInterval(100);
      const subscription = Sensors.Magnetometer.addListener(({ x, y, z }) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        cleanup();
        if (subscription) subscription.remove();

        const magnitude = Math.sqrt(x * x + y * y + z * z);
        const heading = (Math.atan2(y, x) * 180) / Math.PI;
        const normalizedHeading = ((heading + 360) % 360).toFixed(1);

        resolve({
          testId: this.id,
          testName: this.name,
          category: this.category,
          status: 'PASS',
          score: 100,
          message: `Magnetometer active - heading: ${normalizedHeading}°`,
          details: {
            'X': `${x.toFixed(2)} µT`,
            'Y': `${y.toFixed(2)} µT`,
            'Z': `${z.toFixed(2)} µT`,
            'Magnitude': `${magnitude.toFixed(2)} µT`,
            'Heading': `${normalizedHeading}°`,
            'Unit': 'microtesla (µT)',
          },
          timestamp: new Date().toISOString(),
          supported: true,
        });
      });
    });
  }
}
