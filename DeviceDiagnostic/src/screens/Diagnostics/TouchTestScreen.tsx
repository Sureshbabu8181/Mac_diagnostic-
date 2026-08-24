import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');
const GRID_COLS = 5;
const GRID_ROWS = 4;
const CELL_GAP = 4;
const PADDING = 16;
const CELL_SIZE = Math.floor((width - PADDING * 2 - CELL_GAP * (GRID_COLS - 1)) / GRID_COLS);

export default function TouchTestScreen() {
  const navigation = useNavigation();

  const [touched, setTouched] = useState<Set<string>>(new Set());
  const totalCells = GRID_COLS * GRID_ROWS;

  const toggleCell = useCallback((key: string) => {
    setTouched((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setTouched(new Set());
  }, []);

  const coverage = Math.round((touched.size / totalCells) * 100);
  const resultStatus =
    coverage >= 80 ? 'PASS' : coverage >= 40 ? 'WARNING' : 'FAIL';
  const resultColor =
    resultStatus === 'PASS'
      ? '#4CAF50'
      : resultStatus === 'WARNING'
      ? '#FF9800'
      : '#F44336';

  const handleComplete = () => {
    navigation.goBack();
  };

  const cells: React.ReactNode[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const key = `${row}-${col}`;
      const isTouched = touched.has(key);
      cells.push(
        <TouchableOpacity
          key={key}
          style={[styles.cell, isTouched && styles.cellTouched]}
          onPress={() => toggleCell(key)}
          activeOpacity={0.7}
        >
          {isTouched && <Ionicons name="checkmark" size={20} color="#FFF" />}
        </TouchableOpacity>
      );
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Touch Test</Text>
        <Text style={styles.subtitle}>Tap each cell to mark it as working</Text>
      </View>

      <View style={styles.gridContainer}>
        <View style={styles.grid}>{cells}</View>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{touched.size}</Text>
          <Text style={styles.statLabel}>Touched</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{totalCells}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: resultColor }]}>{coverage}%</Text>
          <Text style={styles.statLabel}>Coverage</Text>
        </View>
      </View>

      <View style={[styles.resultBanner, { backgroundColor: resultColor + '20' }]}>
        <Ionicons
          name={resultStatus === 'PASS' ? 'checkmark-circle' : resultStatus === 'WARNING' ? 'warning' : 'close-circle'}
          size={22}
          color={resultColor}
        />
        <Text style={[styles.resultText, { color: resultColor }]}>
          {resultStatus} — {coverage}% coverage
        </Text>
      </View>

      <View style={styles.footer}>
        <Button
          mode="outlined"
          onPress={reset}
          style={styles.resetButton}
          textColor="#AAA"
          icon="refresh"
        >
          Reset
        </Button>
        <Button
          mode="contained"
          onPress={handleComplete}
          style={styles.completeButton}
          buttonColor="#4CAF50"
          labelStyle={styles.completeButtonLabel}
        >
          Complete
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: PADDING },
  header: { alignItems: 'center', marginBottom: 24 },
  title: { color: '#FFF', fontSize: 22, fontWeight: '700' },
  subtitle: { color: '#888', fontSize: 13, marginTop: 4 },
  gridContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CELL_GAP,
    justifyContent: 'center',
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    backgroundColor: '#1E1E2E',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  cellTouched: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 20,
    gap: 24,
  },
  statItem: { alignItems: 'center' },
  statNumber: { color: '#FFF', fontSize: 24, fontWeight: '700' },
  statLabel: { color: '#888', fontSize: 12, marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: '#333' },
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    gap: 8,
  },
  resultText: { fontSize: 14, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 12 },
  resetButton: { flex: 1, borderColor: '#444', borderRadius: 12 },
  completeButton: { flex: 1, borderRadius: 12 },
  completeButtonLabel: { fontSize: 15, fontWeight: '600' },
});
