import { DiagnosticTest, DiagnosticResult } from '../../types';
import * as LocalAuthentication from 'expo-local-authentication';

export class BiometricDiagnostic implements DiagnosticTest {
  id = 'biometric';
  name = 'Biometric Authentication';
  category: 'security' = 'security';
  description = 'Tests biometric authentication availability and hardware';
  icon = 'fingerprint';

  async isSupported(): Promise<boolean> {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      return compatible;
    } catch {
      return false;
    }
  }

  async run(onProgress?: (msg: string) => void): Promise<DiagnosticResult> {
    try {
      onProgress?.('Checking biometric hardware...');

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

      const typeLabels: Record<number, string> = {
        [LocalAuthentication.AuthenticationType.FINGERPRINT]: 'Fingerprint',
        [LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION]: 'Face ID',
        [LocalAuthentication.AuthenticationType.IRIS]: 'Iris',
      };

      const biometricTypes = supportedTypes.map((t) => typeLabels[t] ?? 'Unknown');

      let status: DiagnosticResult['status'] = 'PASS';
      let message = '';

      if (!hasHardware) {
        status = 'NOT_SUPPORTED';
        message = 'No biometric hardware detected';
      } else if (!isEnrolled) {
        status = 'WARNING';
        message = 'Biometric hardware present but no credentials enrolled';
      } else {
        message = `Biometric available: ${biometricTypes.join(', ')}`;
      }

      return {
        testId: this.id,
        testName: this.name,
        category: this.category,
        status,
        score: status === 'PASS' ? 100 : status === 'WARNING' ? 60 : 0,
        message,
        details: {
          'Hardware Available': hasHardware ? 'Yes' : 'No',
          'Credentials Enrolled': isEnrolled ? 'Yes' : 'No',
          'Supported Types': biometricTypes.length > 0 ? biometricTypes.join(', ') : 'None',
          'Authentication Types': supportedTypes.length,
        },
        timestamp: new Date().toISOString(),
        supported: hasHardware,
      };
    } catch (error) {
      return {
        testId: this.id,
        testName: this.name,
        category: this.category,
        status: 'FAIL',
        message: `Biometric test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {},
        timestamp: new Date().toISOString(),
        supported: false,
      };
    }
  }
}
