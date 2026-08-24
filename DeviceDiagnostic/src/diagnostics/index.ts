import { DiagnosticTest } from '../types';

import { BatteryDiagnostic } from './battery/BatteryDiagnostic';
import { DisplayDiagnostic } from './display/DisplayDiagnostic';
import { TouchDiagnostic } from './touch/TouchDiagnostic';
import { CameraDiagnostic } from './camera/CameraDiagnostic';
import { SpeakerDiagnostic } from './audio/SpeakerDiagnostic';
import { MicrophoneDiagnostic } from './audio/MicrophoneDiagnostic';
import { VibrationDiagnostic } from './vibration/VibrationDiagnostic';
import { AccelerometerDiagnostic } from './sensors/AccelerometerDiagnostic';
import { GyroscopeDiagnostic } from './sensors/GyroscopeDiagnostic';
import { MagnetometerDiagnostic } from './sensors/MagnetometerDiagnostic';
import { ProximityDiagnostic } from './sensors/ProximityDiagnostic';
import { LightDiagnostic } from './sensors/LightDiagnostic';
import { GPSDiagnostic } from './location/GPSDiagnostic';
import { WifiDiagnostic } from './wifi/WifiDiagnostic';
import { BluetoothDiagnostic } from './bluetooth/BluetoothDiagnostic';
import { SIMDiagnostic } from './sim/SIMDiagnostic';
import { StorageDiagnostic } from './storage/StorageDiagnostic';
import { MemoryDiagnostic } from './memory/MemoryDiagnostic';
import { PerformanceDiagnostic } from './performance/PerformanceDiagnostic';
import { ThermalDiagnostic } from './thermal/ThermalDiagnostic';
import { SecurityDiagnostic } from './security/SecurityDiagnostic';
import { BiometricDiagnostic } from './biometric/BiometricDiagnostic';
import { USBDiagnostic } from './usb/USBDiagnostic';
import { NFCDiagnostic } from './nfc/NFCDiagnostic';
import { SoftwareDiagnostic } from './software/SoftwareDiagnostic';

export const allDiagnostics: DiagnosticTest[] = [
  new BatteryDiagnostic(),
  new DisplayDiagnostic(),
  new TouchDiagnostic(),
  new CameraDiagnostic(),
  new SpeakerDiagnostic(),
  new MicrophoneDiagnostic(),
  new VibrationDiagnostic(),
  new AccelerometerDiagnostic(),
  new GyroscopeDiagnostic(),
  new MagnetometerDiagnostic(),
  new ProximityDiagnostic(),
  new LightDiagnostic(),
  new GPSDiagnostic(),
  new WifiDiagnostic(),
  new BluetoothDiagnostic(),
  new SIMDiagnostic(),
  new StorageDiagnostic(),
  new MemoryDiagnostic(),
  new PerformanceDiagnostic(),
  new ThermalDiagnostic(),
  new SecurityDiagnostic(),
  new BiometricDiagnostic(),
  new USBDiagnostic(),
  new NFCDiagnostic(),
  new SoftwareDiagnostic(),
];

export {
  BatteryDiagnostic,
  DisplayDiagnostic,
  TouchDiagnostic,
  CameraDiagnostic,
  SpeakerDiagnostic,
  MicrophoneDiagnostic,
  VibrationDiagnostic,
  AccelerometerDiagnostic,
  GyroscopeDiagnostic,
  MagnetometerDiagnostic,
  ProximityDiagnostic,
  LightDiagnostic,
  GPSDiagnostic,
  WifiDiagnostic,
  BluetoothDiagnostic,
  SIMDiagnostic,
  StorageDiagnostic,
  MemoryDiagnostic,
  PerformanceDiagnostic,
  ThermalDiagnostic,
  SecurityDiagnostic,
  BiometricDiagnostic,
  USBDiagnostic,
  NFCDiagnostic,
  SoftwareDiagnostic,
};
