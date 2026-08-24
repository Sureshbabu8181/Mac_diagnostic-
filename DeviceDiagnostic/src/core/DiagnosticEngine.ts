import { DiagnosticTest, DiagnosticResult, DiagnosticSession, DiagnosticCategory } from '../types';
import { CapabilityManager } from './CapabilityManager';
import { ScoringEngine } from './ScoringEngine';
import { Database } from '../database/Database';

export class DiagnosticEngine {
  private tests: Map<string, DiagnosticTest> = new Map();
  private capabilityManager: CapabilityManager;
  private scoringEngine: ScoringEngine;
  private database: Database;

  constructor() {
    this.capabilityManager = new CapabilityManager();
    this.scoringEngine = new ScoringEngine();
    this.database = Database.getInstance();
  }

  registerTest(test: DiagnosticTest): void {
    this.tests.set(test.id, test);
  }

  registerTests(tests: DiagnosticTest[]): void {
    tests.forEach(t => this.tests.set(t.id, t));
  }

  getTests(): DiagnosticTest[] {
    return Array.from(this.tests.values());
  }

  getTestsByCategory(category: DiagnosticCategory): DiagnosticTest[] {
    return this.getTests().filter(t => t.category === category);
  }

  async getSupportedTests(): Promise<DiagnosticTest[]> {
    const supported: DiagnosticTest[] = [];
    for (const test of this.tests.values()) {
      try {
        if (await test.isSupported()) {
          supported.push(test);
        }
      } catch {
        // Test detection failed, skip
      }
    }
    return supported;
  }

  async runTest(testId: string, onProgress?: (msg: string) => void): Promise<DiagnosticResult> {
    const test = this.tests.get(testId);
    if (!test) {
      return this.createErrorResult(testId, 'Unknown', 'Test not found');
    }

    try {
      const supported = await test.isSupported();
      if (!supported) {
        return {
          testId: test.id,
          testName: test.name,
          category: test.category,
          status: 'NOT_SUPPORTED',
          message: `${test.name} is not supported on this device`,
          details: {},
          timestamp: new Date().toISOString(),
          supported: false,
        };
      }

      onProgress?.(`Running ${test.name}...`);
      const result = await this.runWithTimeout(test, 15000);
      return result;
    } catch (error) {
      return {
        testId: test.id,
        testName: test.name,
        category: test.category,
        status: 'FAIL',
        message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: String(error) },
        timestamp: new Date().toISOString(),
        supported: true,
      };
    }
  }

  async runAllTests(onProgress?: (current: number, total: number, testName: string) => void): Promise<DiagnosticSession> {
    const startTime = Date.now();
    const results: DiagnosticResult[] = [];
    const allTests = Array.from(this.tests.values());
    const total = allTests.length;

    for (let i = 0; i < allTests.length; i++) {
      const test = allTests[i];
      onProgress?.(i + 1, total, test.name);
      const result = await this.runTest(test.id);
      results.push(result);
    }

    const healthScore = this.scoringEngine.calculateScore(results);
    const session: DiagnosticSession = {
      id: `session-${Date.now()}`,
      deviceId: '',
      deviceModel: '',
      deviceManufacturer: '',
      osVersion: '',
      results,
      healthScore,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
    };

    await this.database.saveSession(session);
    return session;
  }

  async runCategoryTests(category: DiagnosticCategory, onProgress?: (current: number, total: number, testName: string) => void): Promise<DiagnosticResult[]> {
    const categoryTests = this.getTestsByCategory(category);
    const results: DiagnosticResult[] = [];
    const total = categoryTests.length;

    for (let i = 0; i < categoryTests.length; i++) {
      const test = categoryTests[i];
      onProgress?.(i + 1, total, test.name);
      const result = await this.runTest(test.id);
      results.push(result);
    }

    return results;
  }

  private async runWithTimeout(test: DiagnosticTest, timeoutMs: number): Promise<DiagnosticResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve({
          testId: test.id,
          testName: test.name,
          category: test.category,
          status: 'WARNING',
          message: 'Test timed out',
          details: {},
          timestamp: new Date().toISOString(),
          supported: true,
        });
      }, timeoutMs);

      test.run()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private createErrorResult(testId: string, testName: string, message: string): DiagnosticResult {
    return {
      testId,
      testName,
      category: 'software',
      status: 'FAIL',
      message,
      details: {},
      timestamp: new Date().toISOString(),
      supported: false,
    };
  }
}
