import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  PanResponder,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');
const COLS = 16;
const CELL = Math.floor(width / COLS);
const ROWS = Math.floor(height / CELL);
const TOTAL = COLS * ROWS;

export default function TouchTestScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const touchedRef = useRef(new Set<string>());

  const mark = useCallback((px: number, py: number) => {
    const col = Math.floor(px / CELL);
    const row = Math.floor(py / CELL);
    // Mark 3x3 area for wide finger coverage
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = row + dr;
        const c = col + dc;
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
          const key = `${r}-${c}`;
          if (!touchedRef.current.has(key)) {
            touchedRef.current.add(key);
          }
        }
      }
    }
    setTouched(new Set(touchedRef.current));
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_, gs) => mark(gs.x0, gs.y0),
      onPanResponderMove: (_, gs) => mark(gs.moveX, gs.y0 + gs.dy),
    })
  ).current;

  const coverage = Math.round((touched.size / TOTAL) * 100);
  const color = coverage >= 80 ? '#4CAF50' : coverage >= 40 ? '#FF9800' : '#F44336';

  const reset = useCallback(() => {
    touchedRef.current.clear();
    setTouched(new Set());
  }, []);

  useEffect(() => {
    return () => {
      touchedRef.current.clear();
    };
  }, []);

  const cells: React.ReactNode[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const key = `${r}-${c}`;
      const on = touched.has(key);
      cells.push(
        <View key={key} style={[styles.cell, on && styles.cellOn]}>
          {on && <View style={styles.cellInner} />}
        </View>
      );
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Grid fills the entire screen */}
      <View style={styles.gridWrap} {...panResponder.panHandlers}>
        <View style={styles.grid}>{cells}</View>
      </View>

      {/* Floating back button */}
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={[styles.backBtn, { top: insets.top + 8 }]}
      >
        <Ionicons name="arrow-back" size={24} color="#FFF" />
      </TouchableOpacity>

      {/* Floating coverage indicator */}
      <View style={[styles.coveragePill, { top: insets.top + 8 }]} pointerEvents="none">
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.coverageText, { color }]}>
          {coverage}% · {touched.size}/{TOTAL}
        </Text>
      </View>

      {/* Floating reset button */}
      <TouchableOpacity
        onPress={reset}
        style={[styles.resetBtn, { top: insets.top + 8 }]}
      >
        <Ionicons name="refresh" size={22} color="#FFF" />
      </TouchableOpacity>

      <View style={styles.instruction} pointerEvents="none">
        <Text style={styles.instructionText}>Touch and drag across the whole screen to test</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  gridWrap: { flex: 1, backgroundColor: '#000' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: CELL,
    height: CELL,
    backgroundColor: '#e8e8e8',
    borderWidth: 0.5,
    borderColor: '#bbb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellOn: {
    backgroundColor: '#76c442',
    borderColor: '#5ea832',
  },
  cellInner: {
    width: CELL * 0.6,
    height: CELL * 0.6,
    backgroundColor: '#6abf3a',
    borderRadius: 2,
  },
  backBtn: {
    position: 'absolute',
    left: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#00000099',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  resetBtn: {
    position: 'absolute',
    right: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#00000099',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  coveragePill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00000099',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    zIndex: 20,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  coverageText: { fontSize: 13, fontWeight: '700' },
  instruction: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: '#00000099',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  instructionText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
});
