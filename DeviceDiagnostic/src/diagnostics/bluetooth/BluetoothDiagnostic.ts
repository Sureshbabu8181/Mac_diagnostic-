import { DiagnosticTest, DiagnosticResult } from '../../types';
import { BleManager, State } from 'react-native-ble-plx';

let managerInstance: BleManager | null = null;

function getManager(): BleManager {
  if (!managerInstance) {
    managerInstance = new BleManager();
  }
  return managerInstance;
}

export class BluetoothDiagnostic implements DiagnosticTest {
  id = 'bluetooth';
  name = 'Bluetooth';
  category: 'connectivity' = 'connectivity';
  description = 'Checks Bluetooth availability, permission and nearby devices';
  icon = 'bluetooth';

  async isSupported(): Promise<boolean> {
    try {
      const state = await getManager().state();
      return state !== State.Unsupported && state !== State.Unknown;
    } catch {
      return false;
    }
  }

  async run(onProgress?: (msg: string) => void): Promise<DiagnosticResult> {
    const manager = getManager();
    try {
      onProgress?.('Reading Bluetooth adapter state...');

      const state = await manager.state();

      if (state === State.Unsupported) {
        return {
          testId: this.id,
          testName: this.name,
          category: this.category,
          status: 'NOT_SUPPORTED',
          message: 'This device does not support Bluetooth.',
          details: { 'Bluetooth State': state, 'Presence': 'Adapter not present' },
          timestamp: new Date().toISOString(),
          supported: false,
        };
      }

      if (state === State.Unauthorized) {
        return {
          testId: this.id,
          testName: this.name,
          category: this.category,
          status: 'FAIL',
          message: 'Bluetooth permission not granted',
          details: {
            'Bluetooth State': state,
            'Presence': 'Adapter present, permission required',
            'Guidance': 'Grant Bluetooth permission in device settings',
          },
          timestamp: new Date().toISOString(),
          supported: true,
        };
      }

      if (state !== State.PoweredOn) {
        return {
          testId: this.id,
          testName: this.name,
          category: this.category,
          status: 'FAIL',
          message: `Bluetooth is ${state === State.PoweredOff ? 'powered off' : 'not ready'}`,
          details: {
            'Bluetooth State': state,
            'Presence': 'Adapter present',
            'Guidance': 'Turn on Bluetooth and re-run this test',
          },
          timestamp: new Date().toISOString(),
          supported: true,
        };
      }

      onProgress?.('Scanning for nearby Bluetooth devices...');

      const devicesFound = await new Promise<number>((resolve, reject) => {
        let count = 0;
        manager.startDeviceScan(null, null, (error, device) => {
          if (error) {
            reject(error);
            return;
          }
          if (device) {
            count += 1;
          }
        });

        setTimeout(() => {
          manager.stopDeviceScan().catch(() => {});
          resolve(count);
        }, 3000);
      });

      return {
        testId: this.id,
        testName: this.name,
        category: this.category,
        status: 'PASS',
        score: 100,
        message: devicesFound > 0
          ? `Bluetooth radio works (${devicesFound} nearby device${devicesFound === 1 ? '' : 's'} found)`
          : 'Bluetooth adapter is present and powered on',
        details: {
          'Bluetooth State': state,
          'Presence': 'Adapter present',
          'Access': 'Permission granted',
          'Nearby Devices': String(devicesFound),
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
        message: `Bluetooth test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { 'Presence': 'Error during check' },
        timestamp: new Date().toISOString(),
        supported: true,
      };
    }
  }
}
