import { DiagnosticTest, DiagnosticResult } from '../../types';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export class SoftwareDiagnostic implements DiagnosticTest {
  id = 'software';
  name = 'Software Information';
  category: 'software' = 'software';
  description = 'Reports OS version, device info, and system uptime';
  icon = 'monitor';

  async isSupported(): Promise<boolean> {
    return true;
  }

  async run(): Promise<DiagnosticResult> {
    try {
      const deviceName = Device.deviceName ?? 'Unknown';
      const modelName = Device.modelName ?? 'Unknown';
      const brand = Device.brand ?? 'Unknown';
      const manufacturer = Device.manufacturer ?? 'Unknown';
      const osVersion = Platform.Version;
      const totalMemory = Device.totalMemory ?? 0;

      const uptimeSeconds = Math.floor(Date.now() / 1000);
      const hours = Math.floor(uptimeSeconds / 3600);
      const minutes = Math.floor((uptimeSeconds % 3600) / 60);

      return {
        testId: this.id,
        testName: this.name,
        category: this.category,
        status: 'PASS',
        score: 100,
        message: `${Platform.OS} ${osVersion} on ${modelName}`,
        details: {
          'Device Name': deviceName,
          'Model': modelName,
          'Brand': brand,
          'Manufacturer': manufacturer,
          'OS': Platform.OS === 'ios' ? 'iOS' : 'Android',
          'OS Version': `${osVersion}`,
          'Total Memory': totalMemory ? `${Math.round(totalMemory / 1024 / 1024)} MB` : 'N/A',
          'App Uptime': `${hours}h ${minutes}m`,
          'SDK Version': Platform.Version.toString(),
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
        message: `Software info failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {},
        timestamp: new Date().toISOString(),
        supported: true,
      };
    }
  }
}
