export type DiagnosticStatus = 'PASS' | 'FAIL' | 'WARNING' | 'NOT_SUPPORTED' | 'NOT_TESTED';

export type DiagnosticCategory = 'hardware' | 'sensors' | 'connectivity' | 'performance' | 'software' | 'security';

export type PlatformType = 'android' | 'ios';

export interface DiagnosticCapability {
  id: string;
  name: string;
  category: DiagnosticCategory;
  supported: boolean;
  platform: PlatformType;
  reason?: string;
}

export interface DiagnosticResult {
  testId: string;
  testName: string;
  category: DiagnosticCategory;
  status: DiagnosticStatus;
  score?: number;
  message: string;
  details: Record<string, string | number | boolean>;
  timestamp: string;
  duration?: number;
  supported: boolean;
}

export interface DiagnosticTest {
  id: string;
  name: string;
  category: DiagnosticCategory;
  description: string;
  icon: string;
  isSupported(): Promise<boolean>;
  run(onProgress?: (msg: string) => void): Promise<DiagnosticResult>;
}

export interface DiagnosticSession {
  id: string;
  deviceId: string;
  deviceModel: string;
  deviceManufacturer: string;
  osVersion: string;
  androidSdkVersion?: number;
  results: DiagnosticResult[];
  healthScore: number;
  timestamp: string;
  duration: number;
}

export interface DeviceInfo {
  model: string;
  manufacturer: string;
  osName: string;
  osVersion: string;
  platform: PlatformType;
  androidSdkVersion?: number;
  deviceName: string;
  totalStorage: number;
  totalMemory: number;
  cpuCores: number;
}

export interface ThresholdConfig {
  storageWarning: number;
  storageCritical: number;
  batteryTemperatureWarning: number;
  batteryTemperatureCritical: number;
  memoryWarning: number;
  memoryCritical: number;
}

export interface AppConfig {
  thresholds: ThresholdConfig;
  performance: {
    defaultDurationSeconds: number;
  };
  scoring: {
    passWeight: number;
    warningWeight: number;
    failWeight: number;
  };
}
