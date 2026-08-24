import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import { DiagnosticTest, DiagnosticResult } from '../../types';

export class BatteryDiagnostic implements DiagnosticTest {
  id = 'battery';
  name = 'Battery';
  category: 'hardware' = 'hardware';
  description = 'Tests battery level, state, and charging status';
  icon = 'battery-full';

  async isSupported(): Promise<boolean> {
    try {
      await Battery.getBatteryLevelAsync();
      return true;
    } catch {
      return false;
    }
  }

  async run(): Promise<DiagnosticResult> {
    try {
      const level = await Battery.getBatteryLevelAsync();
      const state = await Battery.getBatteryStateAsync();
      const levelPercent = Math.round(level * 100);

      const stateLabels: Record<number, string> = {
        [Battery.BatteryState.CHARGING]: 'Charging',
        [Battery.BatteryState.FULL]: 'Full',
        [Battery.BatteryState.UNPLUGGED]: 'Unplugged',
        [Battery.BatteryState.UNKNOWN]: 'Unknown',
      };

      let status: DiagnosticResult['status'] = 'PASS';
      let message = `Battery at ${levelPercent}%`;

      if (levelPercent <= 10) {
        status = 'FAIL';
        message = `Critical battery level: ${levelPercent}%`;
      } else if (levelPercent <= 20) {
        status = 'WARNING';
        message = `Low battery: ${levelPercent}%`;
      }

      return {
        testId: this.id,
        testName: this.name,
        category: this.category,
        status,
        score: status === 'PASS' ? 100 : status === 'WARNING' ? 70 : 0,
        message,
        details: {
          'Level': `${levelPercent}%`,
          'State': stateLabels[state] ?? 'Unknown',
          'Charging': state === Battery.BatteryState.CHARGING ? 'Yes' : 'No',
        },
        timestamp: new Date().toISOString(),
        supported: true,
      };
    } catch (error) {
      return {
        testId: this.id,
        testName: this.name,
        category: this.category,
        status: 'FAIL',
        message: `Battery test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {},
        timestamp: new Date().toISOString(),
        supported: true,
      };
    }
  }
}
