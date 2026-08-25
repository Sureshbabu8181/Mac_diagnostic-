import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const { width, height } = Dimensions.get('window');
const GRID_COLS = 20;
const GRID_ROWS = 36;
const HEADER_HEIGHT = 80;
const FOOTER_HEIGHT = 70;
const GRID_HEIGHT = height - HEADER_HEIGHT - FOOTER_HEIGHT;
const CELL_WIDTH = Math.floor(width / GRID_COLS);
const CELL_HEIGHT = Math.floor(GRID_HEIGHT / GRID_ROWS);

export default function TouchTestScreen() {
  const navigation = useNavigation();
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const touchedRef = useRef(new Set<string>());
  const totalCells = GRID_COLS * GRID_ROWS;

  const getCellKey = useCallback((x: number, y: number) => {
    const col = Math.floor(x / CELL_WIDTH);
    const row = Math.floor((y - HEADER_HEIGHT) / CELL_HEIGHT);
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return null;
    return `${row}-${col}`;
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        const x = gestureState.moveX;
        const y = gestureState.y0 + gestureState.dy;
        const key = getCellKey(x, y);
        if (key && !touchedRef.current.has(key)) {
          touchedRef.current.add(key);
          setTouched(new Set(touchedRef.current));
        }
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  const coverage = Math.round((touched.size / totalCells) * 100);
  const resultStatus = coverage >= 80 ? 'PASS' : coverage >= 40 ? 'WARNING' : 'FAIL';
  const resultColor = resultStatus === 'PASS' ? '#4CAF50' : resultStatus === 'WARNING' ? '#FF9800' : '#F44336';

  const reset = useCallback(() => {
    touchedRef.current.clear();
    setTouched(new Set());
  }, []);

  const cells: React.ReactNode[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const key = `${row}-${col}`;
      const isTouched = touched.has(key);
      cells.push(
        <View
          key={key}
          style={[
            styles.cell,
            isTouched && styles.cellTouched,
          ]}
        />
      );
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>Touch Screen Test</Text>
          <Text style={styles.subtitle}>Move your finger across the entire screen</Text>
        </View>
      </View>

      <View style={styles.gridContainer} {...panResponder.panHandlers}>
        <View style={styles.grid}>{cells}</View>
      </View>

      <View style={styles.footer}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: resultColor }]}>{coverage}%</Text>
            <Text style={styles.statLabel}>Coverage</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{touched.size}</Text>
            <Text style={styles.statLabel}>Touched</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{totalCells}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
        </View>

        <View style={[styles.resultBanner, { backgroundColor: resultColor + '20' }]}>
          <Ionicons
            name={resultStatus === 'PASS' ? 'checkmark-circle' : resultStatus === 'WARNING' ? 'warning' : 'close-circle'}
            size={20}
            color={resultColor}
          />
          <Text style={[styles.resultText, { color: resultColor }]}>
            {resultStatus} — {coverage}% coverage
          </Text>
        </View>

        <View style={styles.footerButtons}>
          <TouchableOpacity style={styles.resetBtn} onPress={reset}>
            <Ionicons name="refresh" size={18} color="#AAA" />
            <Text style={styles.resetBtnText}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="checkmark" size={18} color="#FFF" />
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 16,
    backgroundColor: '#1E1E2E',
  },
  backBtn: { padding: 8 },
  headerInfo: { marginLeft: 12, flex: 1 },
  title: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#888', fontSize: 12, marginTop: 2 },
  gridContainer: { flex: 1 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
    backgroundColor: '#1A1A2E',
    borderWidth: 0.5,
    borderColor: '#222',
  },
  cellTouched: {
    backgroundColor: '#4CAF50',
  },
  footer: {
    height: FOOTER_HEIGHT,
    backgroundColor: '#1E1E2E',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  statItem: { alignItems: 'center', flex: 1 },
  statNumber: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  statLabel: { color: '#888', fontSize: 10, marginTop: 2 },
  statDivider: { width: 1, height: 20, backgroundColor: '#333' },
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    borderRadius: 8,
    marginBottom: 6,
  },
  resultText: { fontSize: 12, fontWeight: '600', marginLeft: 6 },
  footerButtons: { flexDirection: 'row', gap: 12 },
  resetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
    padding: 10,
    borderRadius: 10,
  },
  resetBtnText: { color: '#AAA', fontSize: 14, fontWeight: '600', marginLeft: 6 },
  doneBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 10,
    borderRadius: 10,
  },
  doneBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600', marginLeft: 6 },
});
