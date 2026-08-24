import { DiagnosticResult, AppConfig } from '../types';
import { DEFAULT_CONFIG } from '../config/diagnostics';

export class ScoringEngine {
  private config: AppConfig;

  constructor(config?: Partial<AppConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  calculateScore(results: DiagnosticResult[]): number {
    const scored = results.filter(r => r.status !== 'NOT_SUPPORTED' && r.status !== 'NOT_TESTED');

    if (scored.length === 0) return 0;

    let totalWeight = 0;
    let earnedWeight = 0;

    for (const result of scored) {
      totalWeight += 1;
      switch (result.status) {
        case 'PASS':
          earnedWeight += this.config.scoring.passWeight;
          break;
        case 'WARNING':
          earnedWeight += this.config.scoring.warningWeight;
          break;
        case 'FAIL':
          earnedWeight += this.config.scoring.failWeight;
          break;
      }
    }

    const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
    return Math.max(0, Math.min(100, score));
  }

  getScoreLabel(score: number): string {
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 50) return 'Fair';
    if (score >= 25) return 'Poor';
    return 'Critical';
  }

  getScoreColor(score: number): string {
    if (score >= 90) return '#4CAF50';
    if (score >= 75) return '#8BC34A';
    if (score >= 50) return '#FFC107';
    if (score >= 25) return '#FF9800';
    return '#F44336';
  }

  getCategoryScore(results: DiagnosticResult[], category: string): number {
    const categoryResults = results.filter(r => r.category === category);
    return this.calculateScore(categoryResults);
  }

  getStatusCounts(results: DiagnosticResult[]) {
    return {
      pass: results.filter(r => r.status === 'PASS').length,
      warning: results.filter(r => r.status === 'WARNING').length,
      fail: results.filter(r => r.status === 'FAIL').length,
      notSupported: results.filter(r => r.status === 'NOT_SUPPORTED').length,
      notTested: results.filter(r => r.status === 'NOT_TESTED').length,
    };
  }
}
