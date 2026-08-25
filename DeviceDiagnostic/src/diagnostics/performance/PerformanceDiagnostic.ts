import { DiagnosticTest, DiagnosticResult } from '../../types';

export class PerformanceDiagnostic implements DiagnosticTest {
  id = 'performance';
  name = 'CPU Performance';
  category: 'performance' = 'performance';
  description = 'Runs a CPU benchmark by executing compute-intensive operations';
  icon = 'zap';

  async isSupported(): Promise<boolean> {
    return true;
  }

  async run(onProgress?: (msg: string) => void): Promise<DiagnosticResult> {
    try {
      onProgress?.('Running CPU benchmark...');

      const iterations = 5000000;
      const start = Date.now();

      let result = 0;
      for (let i = 0; i < iterations; i++) {
        result += Math.sqrt(i) * Math.sin(i);
      }

      const elapsed = Date.now() - start;
      const opsPerSecond = Math.round(iterations / (elapsed / 1000));

      onProgress?.('Running floating-point benchmark...');

      const fpStart = Date.now();
      let fpResult = 0;
      for (let i = 0; i < 1000000; i++) {
        fpResult += Math.log(i + 1) * Math.cos(i);
      }
      const fpElapsed = Date.now() - fpStart;

      let status: DiagnosticResult['status'] = 'PASS';
      let message = `CPU benchmark completed in ${elapsed}ms`;

      if (elapsed > 10000) {
        status = 'FAIL';
        message = `Very slow CPU: ${elapsed}ms`;
      } else if (elapsed > 5000) {
        status = 'WARNING';
        message = `Slow CPU performance: ${elapsed}ms`;
      }

      return {
        testId: this.id,
        testName: this.name,
        category: this.category,
        status,
        score: Math.max(0, Math.min(100, Math.round(100 - (elapsed / 100)))),
        message,
        details: {
          'Math Benchmark': `${elapsed}ms`,
          'FP Benchmark': `${fpElapsed}ms`,
          'Operations/sec': opsPerSecond.toLocaleString(),
          'Test Size': `${iterations.toLocaleString()} iterations`,
          'Checksum': result.toFixed(2),
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
        message: `Performance test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {},
        timestamp: new Date().toISOString(),
        supported: true,
      };
    }
  }
}
