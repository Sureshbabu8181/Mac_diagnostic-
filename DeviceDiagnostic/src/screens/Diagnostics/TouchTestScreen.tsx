import React, { useState, useCallback, useRef } from 'react';
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
const COLS = 14;
const CELL = Math.floor(width / COLS);
const ROWS = Math.floor(height / CELL);
const TOTAL = COLS * ROWS;

type Mode = 'fill' | 'edge' | 'multi' | 'draw';

const MODES: { key: Mode; label: string; icon: string }[] = [
  { key: 'fill', label: 'Grid Fill', icon: 'grid-outline' },
  { key: 'edge', label: 'Edge Test', icon: 'expand-outline' },
  { key: 'multi', label: 'Multi-Touch', icon: 'finger-print-outline' },
  { key: 'draw', label: 'Draw', icon: 'create-outline' },
];

export default function TouchTestScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('fill');
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [edgeHits, setEdgeHits] = useState<Set<string>>(new Set());
  const [drawLen, setDrawLen] = useState(0);
  const [multiCount, setMultiCount] = useState(0);

  const touchedRef = useRef(new Set<string>());
  const edgeRef = useRef(new Set<string>());
  const drawRef = useRef(0);

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

  const markEdge = useCallback((px: number, py: number) => {
    const zones: string[] = [];
    if (py < CELL * 2) zones.push('Top');
    if (py > (ROWS - 2) * CELL) zones.push('Bottom');
    if (px < CELL * 2) zones.push('Left');
    if (px > (COLS - 2) * CELL) zones.push('Right');
    if (px < CELL * 3 && py < CELL * 3) zones.push('Top-Left');
    if (px > (COLS - 3) * CELL && py < CELL * 3) zones.push('Top-Right');
    if (px < CELL * 3 && py > (ROWS - 3) * CELL) zones.push('Bottom-Left');
    if (px > (COLS - 3) * CELL && py > (ROWS - 3) * CELL) zones.push('Bottom-Right');
    zones.forEach((z) => edgeRef.current.add(z));
    setEdgeHits(new Set(edgeRef.current));
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_, gs) => {
        if (mode === 'fill') mark(gs.x0, gs.y0);
        else if (mode === 'edge') markEdge(gs.x0, gs.y0);
        else if (mode === 'multi') setMultiCount(1);
        else { drawRef.current = 1; setDrawLen(1); }
      },
      onPanResponderMove: (_, gs) => {
        const x = gs.moveX;
        const y = gs.y0 + gs.dy;
        if (mode === 'fill') {
          mark(x, y);
        } else if (mode === 'edge') {
          markEdge(x, y);
        } else if (mode === 'multi') {
          setMultiCount(Math.min(Math.floor(Math.abs(gs.dx) / 20) + 1, 5));
        } else {
          drawRef.current++;
          setDrawLen(drawRef.current);
        }
      },
      onPanResponderRelease: () => {
        if (mode === 'multi') setTimeout(() => setMultiCount(0), 500);
      },
    })
  ).current;

  const coverage = Math.round((touched.size / TOTAL) * 100);
  const edgeCoverage = Math.round((edgeHits.size / 8) * 100);
  const color = coverage >= 80 ? '#4CAF50' : coverage >= 40 ? '#FF9800' : '#F44336';

  const reset = useCallback(() => {
    touchedRef.current.clear();
    edgeRef.current.clear();
    drawRef.current = 0;
    setTouched(new Set());
    setEdgeHits(new Set());
    setDrawLen(0);
    setMultiCount(0);
  }, []);

  const cells: React.ReactNode[] = [];
  if (mode === 'fill' || mode === 'draw') {
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
  }

  // Edge mode: highlight border cells
  if (mode === 'edge') {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const isTop = r <= 1;
        const isBottom = r >= ROWS - 2;
        const isLeft = c <= 1;
        const isRight = c >= COLS - 2;
        const isCorner = (isTop || isBottom) && (isLeft || isRight);
        const isBorder = isTop || isBottom || isLeft || isRight;

        let zone: string | null = null;
        if (isTop && isLeft) zone = 'Top-Left';
        else if (isTop && isRight) zone = 'Top-Right';
        else if (isBottom && isLeft) zone = 'Bottom-Left';
        else if (isBottom && isRight) zone = 'Bottom-Right';
        else if (isTop) zone = 'Top';
        else if (isBottom) zone = 'Bottom';
        else if (isLeft) zone = 'Left';
        else if (isRight) zone = 'Right';

        const hit = zone ? edgeHits.has(zone) : false;
        cells.push(
          <View
            key={`${r}-${c}`}
            style={[
              styles.cell,
              isBorder && styles.edgeCell,
              isCorner && styles.edgeCorner,
              hit && styles.cellOn,
            ]}
          >
            {hit && <View style={styles.cellInner} />}
          </View>
        );
      }
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Touch Test</Text>
        <TouchableOpacity onPress={reset} style={styles.backBtn}>
          <Ionicons name="refresh" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Mode tabs */}
      <View style={styles.modeBar}>
        {MODES.map((m) => (
          <TouchableOpacity
            key={m.key}
            style={[styles.modeTab, mode === m.key && styles.modeTabActive]}
            onPress={() => { reset(); setMode(m.key); }}
          >
            <Ionicons name={m.icon as any} size={14} color={mode === m.key ? '#FFF' : '#888'} />
            <Text style={[styles.modeLabel, mode === m.key && styles.modeLabelActive]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Grid area — fills remaining space */}
      <View style={styles.gridWrap} {...panResponder.panHandlers}>
        <View style={styles.grid}>
          {cells}
        </View>

        {/* Multi-touch overlay */}
        {mode === 'multi' && multiCount > 0 && (
          <View style={styles.multiOverlay}>
            <Text style={styles.multiText}>{multiCount} finger{multiCount > 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>

      {/* Bottom stats */}
      <View style={[styles.statsBar, { paddingBottom: insets.bottom + 6 }]}>
        <View style={styles.statsRow}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={[styles.statsText, { color }]}>
            {mode === 'fill' && `${coverage}% · ${touched.size}/${TOTAL}`}
            {mode === 'edge' && `${edgeCoverage}% · ${edgeHits.size}/8`}
            {mode === 'multi' && `${multiCount} fingers`}
            {mode === 'draw' && `${drawLen} points`}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 4,
    backgroundColor: '#1a1a2e',
    zIndex: 10,
  },
  backBtn: { padding: 8 },
  title: { flex: 1, color: '#FFF', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  modeBar: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 8,
    paddingBottom: 6,
    gap: 6,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
    paddingVertical: 7,
    borderRadius: 6,
    gap: 4,
  },
  modeTabActive: { backgroundColor: '#4CAF50' },
  modeLabel: { color: '#888', fontSize: 10, fontWeight: '600' },
  modeLabelActive: { color: '#FFF' },
  gridWrap: { flex: 1, backgroundColor: '#000' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
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
  edgeCell: {
    backgroundColor: '#f0f0f0',
    borderColor: '#999',
  },
  edgeCorner: {
    backgroundColor: '#ffe0b2',
    borderColor: '#ffb74d',
  },
  multiOverlay: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
    backgroundColor: '#0008',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  multiText: { color: '#FFF', fontSize: 28, fontWeight: '700' },
  statsBar: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statsText: { fontSize: 13, fontWeight: '600' },
});
