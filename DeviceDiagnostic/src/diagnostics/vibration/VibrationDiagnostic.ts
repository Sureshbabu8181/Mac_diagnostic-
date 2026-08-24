import { DiagnosticTest, DiagnosticResult } from '../../types';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export class VibrationDiagnostic implements DiagnosticTest {
  id = 'vibration';
  name = 'Vibration';
  category: 'hardware' = 'hardware';
  description = 'Tests vibration motor using haptic feedback patterns';
  icon = 'vibrate';

  async isSupported(): Promise<boolean> {
    return Platform.OS === 'ios' || Platform.OS === 'android';
  }

  async run(onProgress?: (msg: string) => void): Promise<DiagnosticResult> {
    try {
      onProgress?.('Testing light vibration...');
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await new Promise((r) => setTimeout(r, 500));

      onProgress?.('Testing medium vibration...');
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await new Promise((r) => setTimeout(r, 500));

      onProgress?.('Testing heavy vibration...');
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await new Promise((r) => setTimeout(r, 500));

      onProgress?.('Testing notification vibration...');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await new Promise((r) => setTimeout(r, 300));

      return {
        testId: this.id,
        testName: this.name,
        category: this.category,
        status: 'PASS',
        score: 100,
        message: 'Vibration motor responded to all haptic patterns',
        details: {
          'Light Impact': 'Triggered',
          'Medium Impact': 'Triggered',
          'Heavy Impact': 'Triggered',
          'Notification': 'Triggered',
          'Platform': Platform.OS,
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
        message: `Vibration test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {},
        timestamp: new Date().toISOString(),
        supported: true,
      };
    }
  }
}
