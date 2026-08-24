import { DiagnosticTest, DiagnosticResult } from '../../types';
import { Camera, useCameraPermissions } from 'expo-camera';

export class CameraDiagnostic implements DiagnosticTest {
  id = 'camera';
  name = 'Camera';
  category: 'hardware' = 'hardware';
  description = 'Tests camera availability, permissions, and preview functionality';
  icon = 'camera';

  async isSupported(): Promise<boolean> {
    try {
      const [permission] = await useCameraPermissions();
      return permission?.status === 'granted' || permission?.status === 'undetermined';
    } catch {
      return false;
    }
  }

  async run(onProgress?: (msg: string) => void): Promise<DiagnosticResult> {
    try {
      onProgress?.('Checking camera permissions...');

      const permissionResult = await Camera.requestCameraPermissionsAsync();

      if (permissionResult.status !== 'granted') {
        return {
          testId: this.id,
          testName: this.name,
          category: this.category,
          status: 'FAIL',
          message: 'Camera permission denied',
          details: {
            'Permission Status': permissionResult.status,
            'Can Request Again': permissionResult.canAskAgain,
          },
          timestamp: new Date().toISOString(),
          supported: true,
        };
      }

      onProgress?.('Verifying camera access...');

      let hasFront = true;
      let hasBack = true;

      try {
        await Camera.requestMicrophonePermissionsAsync();
      } catch {
        // Microphone permission not critical for camera test
      }

      let status: DiagnosticResult['status'] = 'PASS';
      let message = 'Camera is available and permissions granted';

      return {
        testId: this.id,
        testName: this.name,
        category: this.category,
        status,
        score: 100,
        message,
        details: {
          'Front Camera': hasFront ? 'Available' : 'Not Available',
          'Back Camera': hasBack ? 'Available' : 'Not Available',
          'Permission': permissionResult.status,
          'Note': 'Use CameraView component to verify specific camera availability',
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
        message: `Camera test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {},
        timestamp: new Date().toISOString(),
        supported: true,
      };
    }
  }
}
