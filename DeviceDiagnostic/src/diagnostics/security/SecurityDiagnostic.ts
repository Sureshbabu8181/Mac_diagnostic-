import { DiagnosticTest, DiagnosticResult } from '../../types';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export class SecurityDiagnostic implements DiagnosticTest {
  id = 'security';
  name = 'Security';
  category: 'security' = 'security';
  description = 'Checks OS version, device security features, and encryption status';
  icon = 'shield';

  async isSupported(): Promise<boolean> {
    return true;
  }

  async run(): Promise<DiagnosticResult> {
    try {
      const osVersion = Platform.Version;
      const deviceName = Device.deviceName ?? 'Unknown';
      const modelName = Device.modelName ?? 'Unknown';
      const brand = Device.brand ?? 'Unknown';
      const manufacturer = Device.manufacturer ?? 'Unknown';
      const totalMemory = Device.totalMemory ?? 0;
      const isRooted = await Device.isRootedExperimentalAsync();

      let status: DiagnosticResult['status'] = 'PASS';
      const issues: string[] = [];

      if (isRooted) {
        status = 'FAIL';
        issues.push('Device is rooted');
      }

      if (Platform.OS === 'android' && typeof osVersion === 'number' && osVersion < 28) {
        status = 'WARNING';
        issues.push('Android version may lack encryption by default');
      }

      return {
        testId: this.id,
        testName: this.name,
        category: this.category,
        status,
        score: status === 'PASS' ? 100 : status === 'WARNING' ? 70 : 0,
        message: issues.length > 0 ? issues.join('; ') : 'No security issues detected',
        details: {
          'Device': deviceName,
          'Model': modelName,
          'Brand': brand,
          'Manufacturer': manufacturer,
          'OS': Platform.OS,
          'OS Version': `${osVersion}`,
          'Rooted/Jailbroken': isRooted ? 'Yes' : 'No',
          'Total Memory': totalMemory ? `${Math.round(totalMemory / 1024 / 1024)} MB` : 'N/A',
          'Screen Lock': 'Requires native check',
          'Encryption': Platform.OS === 'ios' ? 'Enabled by default' : 'Requires Android API check',
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
        message: `Security check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {},
        timestamp: new Date().toISOString(),
        supported: true,
      };
    }
  }
}
