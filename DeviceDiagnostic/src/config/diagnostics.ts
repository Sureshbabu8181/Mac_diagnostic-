import { AppConfig } from '../types';

export const DEFAULT_CONFIG: AppConfig = {
  thresholds: {
    storageWarning: 80,
    storageCritical: 95,
    batteryTemperatureWarning: 45,
    batteryTemperatureCritical: 50,
    memoryWarning: 20,
    memoryCritical: 10,
  },
  performance: {
    defaultDurationSeconds: 30,
  },
  scoring: {
    passWeight: 1.0,
    warningWeight: 0.7,
    failWeight: 0.0,
  },
};

export const CATEGORIES = [
  { id: 'hardware', name: 'Hardware', icon: 'hardware-chip-outline', description: 'Battery, Display, Camera, Speakers, etc.' },
  { id: 'sensors', name: 'Sensors', icon: 'compass-outline', description: 'Accelerometer, Gyroscope, Magnetometer, etc.' },
  { id: 'connectivity', name: 'Connectivity', icon: 'wifi-outline', description: 'GPS, Wi-Fi, Bluetooth, SIM' },
  { id: 'performance', name: 'Performance', icon: 'speedometer-outline', description: 'CPU, Memory, Storage benchmarks' },
  { id: 'software', name: 'Software', icon: 'phone-portrait-outline', description: 'OS, Apps, System info' },
  { id: 'security', name: 'Security', icon: 'shield-checkmark-outline', description: 'Lock screen, Encryption, Biometrics' },
] as const;
