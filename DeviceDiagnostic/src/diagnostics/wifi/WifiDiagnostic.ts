import { DiagnosticTest, DiagnosticResult } from '../../types';
import NetInfo from '@react-native-community/netinfo';

export class WifiDiagnostic implements DiagnosticTest {
  id = 'wifi';
  name = 'Wi-Fi';
  category: 'connectivity' = 'connectivity';
  description = 'Tests Wi-Fi connectivity and network information';
  icon = 'wifi';

  async isSupported(): Promise<boolean> {
    try {
      const state = await NetInfo.fetch();
      return state.type === 'wifi' || state.type === 'unknown';
    } catch {
      return false;
    }
  }

  async run(onProgress?: (msg: string) => void): Promise<DiagnosticResult> {
    try {
      onProgress?.('Checking network state...');

      const state = await NetInfo.fetch();
      const isConnected = state.isConnected ?? false;
      const isWifi = state.type === 'wifi';
      const details = state.details as Record<string, unknown> | undefined;

      let status: DiagnosticResult['status'] = 'PASS';
      let message = '';

      if (!isConnected) {
        status = 'FAIL';
        message = 'No network connection detected';
      } else if (isWifi) {
        message = 'Connected via Wi-Fi';
      } else {
        status = 'WARNING';
        message = `Connected via ${state.type} (not Wi-Fi)`;
      }

      return {
        testId: this.id,
        testName: this.name,
        category: this.category,
        status,
        score: status === 'PASS' ? 100 : status === 'WARNING' ? 60 : 0,
        message,
        details: {
          'Connected': isConnected ? 'Yes' : 'No',
          'Connection Type': state.type,
          'Wi-Fi': isWifi ? 'Yes' : 'No',
          'SSID': (details?.ssid as string) ?? 'N/A',
          'BSSID': (details?.bssid as string) ?? 'N/A',
          'Signal Strength': (details?.strength as number)
            ? `${(details!.strength as number) * 100}%`
            : 'N/A',
          'IP Address': (details?.ipAddress as string) ?? 'N/A',
          'Frequency': (details?.frequency as number)
            ? `${(details!.frequency as number)} MHz`
            : 'N/A',
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
        message: `Wi-Fi test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {},
        timestamp: new Date().toISOString(),
        supported: true,
      };
    }
  }
}
