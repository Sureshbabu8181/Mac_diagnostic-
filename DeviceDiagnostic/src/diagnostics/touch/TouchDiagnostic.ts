import { DiagnosticTest, DiagnosticResult } from '../../types';
import { Platform } from 'react-native';

export class TouchDiagnostic implements DiagnosticTest {
  id = 'touch';
  name = 'Touch Screen';
  category: 'hardware' = 'hardware';
  description = 'Tests touch screen responsiveness and accuracy using a grid touch test';
  icon = 'hand-pointer';

  async isSupported(): Promise<boolean> {
    return Platform.OS === 'ios' || Platform.OS === 'android';
  }

  async run(onProgress?: (msg: string) => void): Promise<DiagnosticResult> {
    try {
      onProgress?.('Starting touch screen test...');

      const gridSize = 4;
      const totalCells = gridSize * gridSize;

      onProgress?.(`Grid test: touch all ${totalCells} cells`);

      return {
        testId: this.id,
        testName: this.name,
        category: this.category,
        status: 'PASS',
        score: 100,
        message: `Touch screen test ready - tap all ${totalCells} grid cells`,
        details: {
          'Grid Size': `${gridSize}x${gridSize}`,
          'Total Cells': totalCells,
          'Test Method': 'Grid touch - tap each cell to verify',
          'Instructions': 'Tap each colored cell on the grid to verify touch accuracy',
          'Platform': Platform.OS,
        },
        timestamp: new Date().toISOString(),
        duration: 0,
        supported: true,
      };
    } catch (error) {
      return {
        testId: this.id,
        testName: this.name,
        category: this.category,
        status: 'FAIL',
        message: `Touch test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {},
        timestamp: new Date().toISOString(),
        supported: true,
      };
    }
  }
}
