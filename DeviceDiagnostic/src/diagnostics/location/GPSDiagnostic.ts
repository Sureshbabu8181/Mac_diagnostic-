import { DiagnosticTest, DiagnosticResult } from '../../types';
import * as Location from 'expo-location';

export class GPSDiagnostic implements DiagnosticTest {
  id = 'gps';
  name = 'GPS / Location';
  category: 'connectivity' = 'connectivity';
  description = 'Tests GPS accuracy and location services';
  icon = 'map-pin';

  async isSupported(): Promise<boolean> {
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      return servicesEnabled;
    } catch {
      return false;
    }
  }

  async run(onProgress?: (msg: string) => void): Promise<DiagnosticResult> {
    try {
      onProgress?.('Checking location permission and services...');

      let servicesEnabled = false;
      try {
        servicesEnabled = await Location.hasServicesEnabledAsync();
      } catch {
        servicesEnabled = false;
      }

      const permResult = await Location.requestForegroundPermissionsAsync();
      if (permResult.status !== 'granted') {
        return {
          testId: this.id,
          testName: this.name,
          category: this.category,
          status: 'FAIL',
          message: 'Location permission denied',
          details: {
            'Presence': 'GPS receiver present on device',
            'Location Services': servicesEnabled ? 'Enabled' : 'Disabled',
            'Permission Status': permResult.status,
            'Guidance': 'Grant location permission and run again',
          },
          timestamp: new Date().toISOString(),
          supported: true,
        };
      }

      if (!servicesEnabled) {
        return {
          testId: this.id,
          testName: this.name,
          category: this.category,
          status: 'FAIL',
          message: 'Location services are turned off',
          details: {
            'Presence': 'GPS receiver present on device',
            'Location Services': 'Disabled',
            'Permission Status': 'Granted',
            'Guidance': 'Enable location services and run again',
          },
          timestamp: new Date().toISOString(),
          supported: true,
        };
      }

      onProgress?.('Getting current location...');

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude, altitude, accuracy } = location.coords;

      onProgress?.('Fetching address from coordinates...');

      const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });

      const addrParts = [
        address?.name,
        address?.street,
        address?.city,
        address?.region,
        address?.country,
      ].filter(Boolean);

      let resultStatus: DiagnosticResult['status'] = 'PASS';
      let message = `Location acquired with ${accuracy?.toFixed(1)}m accuracy`;

      if (accuracy && accuracy > 100) {
        resultStatus = 'WARNING';
        message = `Low accuracy: ${accuracy.toFixed(1)}m`;
      }

      return {
        testId: this.id,
        testName: this.name,
        category: this.category,
        status: resultStatus,
        score: resultStatus === 'PASS' ? 100 : 70,
        message,
        details: {
          'Latitude': latitude.toFixed(6),
          'Longitude': longitude.toFixed(6),
          'Altitude': altitude ? `${altitude.toFixed(1)}m` : 'N/A',
          'Accuracy': accuracy ? `${accuracy.toFixed(1)}m` : 'N/A',
          'Address': addrParts.join(', ') || 'N/A',
          'Timestamp': new Date(location.timestamp).toISOString(),
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
        message: `GPS test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {},
        timestamp: new Date().toISOString(),
        supported: true,
      };
    }
  }
}
