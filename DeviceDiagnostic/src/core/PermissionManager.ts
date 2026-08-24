import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import { Camera } from 'expo-camera';
import * as Device from 'expo-device';

export class PermissionManager {
  static async requestCamera(): Promise<boolean> {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  }

  static async requestMicrophone(): Promise<boolean> {
    try {
      const { status } = await Camera.requestMicrophonePermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  }

  static async requestLocation(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  }

  static async checkCameraPermission(): Promise<boolean> {
    try {
      const { status } = await Camera.getCameraPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  }

  static async checkMicrophonePermission(): Promise<boolean> {
    try {
      const { status } = await Camera.getMicrophonePermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  }

  static async checkLocationPermission(): Promise<boolean> {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  }

  static getDeviceModel(): string {
    return Device.modelName ?? 'Unknown';
  }

  static getDeviceManufacturer(): string {
    return Device.manufacturer ?? 'Unknown';
  }

  static getOSVersion(): string {
    return Device.osVersion ?? 'Unknown';
  }

  static getDeviceName(): string {
    return Device.deviceName ?? 'Unknown Device';
  }
}
