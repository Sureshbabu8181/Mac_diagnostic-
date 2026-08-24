import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Battery from 'expo-battery';
import * as Sensors from 'expo-sensors';
import * as Location from 'expo-location';
import { Camera } from 'expo-camera';
import NetInfo from '@react-native-community/netinfo';
import * as LocalAuthentication from 'expo-local-authentication';
import { DiagnosticCapability, PlatformType } from '../types';

export class CapabilityManager {
  private static instance: CapabilityManager;
  private capabilities: DiagnosticCapability[] = [];

  static getInstance(): CapabilityManager {
    if (!CapabilityManager.instance) {
      CapabilityManager.instance = new CapabilityManager();
    }
    return CapabilityManager.instance;
  }

  get platform(): PlatformType {
    return Platform.OS === 'android' ? 'android' : 'ios';
  }

  async detectCapabilities(): Promise<DiagnosticCapability[]> {
    this.capabilities = [];

    await this.checkBattery();
    await this.checkDisplay();
    await this.checkCamera();
    await this.checkSensors();
    await this.checkLocation();
    await this.checkNetwork();
    await this.checkBiometric();
    await this.checkStorage();
    await this.checkVibration();

    return this.capabilities;
  }

  isSupported(capabilityId: string): boolean {
    return this.capabilities.find(c => c.id === capabilityId)?.supported ?? false;
  }

  getSupportedCapabilities(): DiagnosticCapability[] {
    return this.capabilities.filter(c => c.supported);
  }

  getUnsupportedCapabilities(): DiagnosticCapability[] {
    return this.capabilities.filter(c => !c.supported);
  }

  private addCapability(cap: DiagnosticCapability): void {
    this.capabilities.push(cap);
  }

  private async checkBattery(): Promise<void> {
    try {
      const level = await Battery.getBatteryLevelAsync();
      const state = await Battery.getBatteryStateAsync();
      this.addCapability({ id: 'battery', name: 'Battery', category: 'hardware', supported: true, platform: this.platform });
      this.addCapability({ id: 'battery_level', name: 'Battery Level', category: 'hardware', supported: true, platform: this.platform });
      this.addCapability({ id: 'battery_state', name: 'Battery State', category: 'hardware', supported: state !== Battery.BatteryState.UNKNOWN, platform: this.platform });
      this.addCapability({ id: 'battery_temperature', name: 'Battery Temperature', category: 'hardware', supported: false, platform: this.platform, reason: 'Temperature API not available in Expo' });
    } catch {
      this.addCapability({ id: 'battery', name: 'Battery', category: 'hardware', supported: false, platform: this.platform });
    }
  }

  private async checkDisplay(): Promise<void> {
    this.addCapability({ id: 'display', name: 'Display Test', category: 'hardware', supported: true, platform: this.platform });
    this.addCapability({ id: 'touch', name: 'Touch Test', category: 'hardware', supported: true, platform: this.platform });
  }

  private async checkCamera(): Promise<void> {
    try {
      const { status } = await Camera.getCameraPermissionsAsync();
      this.addCapability({ id: 'camera', name: 'Camera', category: 'hardware', supported: true, platform: this.platform });
    } catch {
      this.addCapability({ id: 'camera', name: 'Camera', category: 'hardware', supported: false, platform: this.platform });
    }
  }

  private async checkSensors(): Promise<void> {
    const checks = [
      { id: 'accelerometer', name: 'Accelerometer', sensor: Sensors.Accelerometer },
      { id: 'gyroscope', name: 'Gyroscope', sensor: Sensors.Gyroscope },
      { id: 'magnetometer', name: 'Magnetometer', sensor: Sensors.Magnetometer },
      { id: 'barometer', name: 'Barometer', sensor: Sensors.Barometer },
    ];

    for (const check of checks) {
      try {
        const available = await check.sensor.isAvailableAsync();
        this.addCapability({ id: check.id, name: check.name, category: 'sensors', supported: available, platform: this.platform });
      } catch {
        this.addCapability({ id: check.id, name: check.name, category: 'sensors', supported: false, platform: this.platform });
      }
    }

    this.addCapability({ id: 'proximity', name: 'Proximity Sensor', category: 'sensors', supported: false, platform: this.platform, reason: 'Not available in Expo SDK' });
    this.addCapability({ id: 'light', name: 'Ambient Light Sensor', category: 'sensors', supported: false, platform: this.platform, reason: 'Not available in Expo SDK' });
    this.addCapability({ id: 'step_counter', name: 'Step Counter', category: 'sensors', supported: false, platform: this.platform, reason: 'Not available in Expo SDK' });
  }

  private async checkLocation(): Promise<void> {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      this.addCapability({ id: 'gps', name: 'GPS/Location', category: 'connectivity', supported: true, platform: this.platform });
    } catch {
      this.addCapability({ id: 'gps', name: 'GPS/Location', category: 'connectivity', supported: false, platform: this.platform });
    }
  }

  private async checkNetwork(): Promise<void> {
    try {
      const state = await NetInfo.fetch();
      this.addCapability({ id: 'wifi', name: 'Wi-Fi', category: 'connectivity', supported: true, platform: this.platform });
      this.addCapability({ id: 'bluetooth', name: 'Bluetooth', category: 'connectivity', supported: false, platform: this.platform, reason: 'Requires native module' });
      this.addCapability({ id: 'cellular', name: 'Cellular Network', category: 'connectivity', supported: state.type !== 'unknown', platform: this.platform });
    } catch {
      this.addCapability({ id: 'wifi', name: 'Wi-Fi', category: 'connectivity', supported: false, platform: this.platform });
    }
  }

  private async checkBiometric(): Promise<void> {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      this.addCapability({ id: 'fingerprint', name: 'Biometric Auth', category: 'security', supported: hasHardware, platform: this.platform });
    } catch {
      this.addCapability({ id: 'fingerprint', name: 'Biometric Auth', category: 'security', supported: false, platform: this.platform });
    }
  }

  private async checkStorage(): Promise<void> {
    this.addCapability({ id: 'storage', name: 'Storage', category: 'hardware', supported: true, platform: this.platform });
    this.addCapability({ id: 'ram', name: 'Memory (RAM)', category: 'hardware', supported: true, platform: this.platform });
  }

  private async checkVibration(): Promise<void> {
    this.addCapability({ id: 'vibration', name: 'Vibration', category: 'hardware', supported: Platform.OS === 'android', platform: this.platform });
  }
}
