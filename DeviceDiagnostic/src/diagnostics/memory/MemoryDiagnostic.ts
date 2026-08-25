import { DiagnosticTest, DiagnosticResult } from '../../types';

export class MemoryDiagnostic implements DiagnosticTest {
  id = 'memory';
  name = 'Memory (RAM)';
  category: 'performance' = 'performance';
  description = 'Reports available RAM information';
  icon = 'database';

  async isSupported(): Promise<boolean> {
    return true;
  }

  async run(): Promise<DiagnosticResult> {
    try {
      let heapUsedMB: number | null = null;

      try {
        const g = globalThis as any;
        if (g.performance && g.performance.memory) {
          heapUsedMB = g.performance.memory.usedJSHeapSize / 1024 / 1024;
        }
      } catch {
        // performance.memory not available on all platforms
      }

      let status: DiagnosticResult['status'] = 'PASS';
      let message = 'Memory information collected';

      if (heapUsedMB !== null && heapUsedMB > 200) {
        status = 'WARNING';
        message = `High JS heap usage: ${heapUsedMB.toFixed(1)} MB`;
      }

      return {
        testId: this.id,
        testName: this.name,
        category: this.category,
        status,
        score: 100,
        message,
        details: {
          'JS Heap Used': heapUsedMB !== null ? `${heapUsedMB.toFixed(1)} MB` : 'N/A',
          'Note': 'Total device RAM is not directly accessible via JavaScript',
          'Platform Info': 'Use expo-device for total RAM info',
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
        message: `Memory test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {},
        timestamp: new Date().toISOString(),
        supported: true,
      };
    }
  }
}
