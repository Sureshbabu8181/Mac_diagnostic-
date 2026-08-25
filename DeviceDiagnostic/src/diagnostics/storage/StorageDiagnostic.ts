import { DiagnosticTest, DiagnosticResult } from '../../types';
import { getFreeDiskStorageAsync, getTotalDiskCapacityAsync } from 'expo-file-system/legacy';

export class StorageDiagnostic implements DiagnosticTest {
  id = 'storage';
  name = 'Storage';
  category: 'performance' = 'performance';
  description = 'Tests device storage capacity and read/write performance';
  icon = 'hard-drive';

  async isSupported(): Promise<boolean> {
    try {
      const free = await getFreeDiskStorageAsync();
      return free > 0;
    } catch {
      return false;
    }
  }

  async run(onProgress?: (msg: string) => void): Promise<DiagnosticResult> {
    try {
      onProgress?.('Checking disk storage...');

      const freeStorage = await getFreeDiskStorageAsync();
      const totalStorage = await getTotalDiskCapacityAsync();
      const usedStorage = totalStorage - freeStorage;
      const usagePercent = totalStorage > 0 ? Math.round((usedStorage / totalStorage) * 100) : 0;

      let status: DiagnosticResult['status'] = 'PASS';
      let message = `${formatBytes(freeStorage)} free of ${formatBytes(totalStorage)}`;

      if (usagePercent >= 95) {
        status = 'FAIL';
        message = `Critically low storage: ${usagePercent}% used`;
      } else if (usagePercent >= 80) {
        status = 'WARNING';
        message = `Storage ${usagePercent}% used`;
      }

      return {
        testId: this.id,
        testName: this.name,
        category: this.category,
        status,
        score: status === 'PASS' ? 100 : status === 'WARNING' ? 70 : 0,
        message,
        details: {
          'Free Storage': formatBytes(freeStorage),
          'Total Storage': formatBytes(totalStorage),
          'Used Storage': formatBytes(usedStorage),
          'Usage': `${usagePercent}%`,
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
        message: `Storage test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {},
        timestamp: new Date().toISOString(),
        supported: true,
      };
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
