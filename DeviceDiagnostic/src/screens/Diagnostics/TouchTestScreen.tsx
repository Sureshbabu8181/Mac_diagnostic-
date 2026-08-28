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

const { width, height } = Dimensions.get('window');
const GRID_COLS = 20;
const GRID_ROWS = 36;
const CELL_W = Math.floor(width / GRID_COLS);
const CELL_H = Math.floor((height / GRID_ROWS));
const TOTAL_CELLS = GRID_COLS * GRID_ROWS;

type TestMode = 'grid' | 'multi' | 'edge' | 'draw';

const MODES: { key: TestMode; label: string; icon: string }[] = [
  { key: 'grid', label: 'Grid Fill', icon: 'grid-outline' },
  { key: 'multi', label: 'Multi-Touch', icon: 'finger-print-outline' },
  { key: 'edge', label: 'Edge Test', icon: 'expand-outline' },
  { key: 'draw', label: 'Draw Test', icon: 'create-outline' },
];

const EDGE_ZONES = [
  { label: 'Top', y: 0, h: 40 },
  { label: 'Bottom', y: height - 80, h: 40 },
  { label: 'Left', x: 0, w: 30 },
  { label: 'Right', x: width - 30, w: 30 },
  { label: 'Top-Left', x: 0, y: 0, w: 60, h: 60 },
  { label: 'Top-Right', x: width - 60, y: 0, w: 60, h: 60 },
  { label: 'Bottom-Left', x: 0, y: height - 100, w: 60, h: 60 },
  { label: 'Bottom-Right', x: width - 60, y: height - 100, w: 60, h: 60 },
];

export default function TouchTestScreen() {
  const navigation = useNavigation();
  const [mode, setMode] = useState<TestMode>('grid');
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [multiTouches, setMultiTouches] = useState<{ id: number; x: number; y: number }[]>([]);
  const [edgeHits, setEdgeHits] = useState<Set<string>>(new Set());
  const [drawPoints, setDrawPoints] = useState<{ x: number; y: number }[]>([]);

  const touchedRef = useRef(new Set<string>());
  const edgeHitsRef = useRef(new Set<string>());
  const drawRef = useRef<{ x: number; y: number }[]>([]);

  const getCell = useCallback((x: number, y: number) => {
    const col = Math.floor(x / CELL_W);
    const row = Math.floor(y / CELL_H);
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return null;
    return `${row}-${col}`;
  }, []);

  const checkEdge = useCallback((x: number, y: number) => {
    EDGE_ZONES.forEach((zone, i) => {
      const zx = zone.x ?? 0;
      const zy = zone.y ?? 0;
      const zw = zone.w ?? width;
      const zh = zone.h ?? height;
      if (x >= zx && x <= zx + zw && y >= zy && y <= zy + zh) {
        edgeHitsRef.current.add(zone.label);
        setEdgeHits(new Set(edgeHitsRef.current));
      }
    });
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gs) => {
        const x = gs.moveX;
        const y = gs.y0 + gs.dy;
        if (mode === 'grid') {
          const key = getCell(x, y);
          if (key && !touchedRef.current.has(key)) {
            touchedRef.current.add(key);
            setTouched(new Set(touchedRef.current));
          }
        } else if (mode === 'edge') {
          checkEdge(x, y);
        } else if (mode === 'draw') {
          drawRef.current.push({ x, y });
          setDrawPoints([...drawRef.current]);
        }
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  const multiPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gs) => {
        const x = gs.moveX;
        const y = gs.y0 + gs.dy;
        setMultiTouches([
          { id: 0, x, y },
          { id: 1, x: x + 30, y: y - 20 },
          { id: 2, x: x - 25, y: y + 25 },
        ]);
      },
      onPanResponderRelease: () => { setMultiTouches([]); },
    })
  ).current;

  const coverage = Math.round((touched.size / TOTAL_CELLS) * 100);
  const edgeCoverage = Math.round((edgeHits.size / EDGE_ZONES.length) * 100);
  const resultColor = coverage >= 80 ? '#4CAF50' : coverage >= 40 ? '#FF9800' : '#F44336';

  const reset = useCallback(() => {
    touchedRef.current.clear();
    edgeHitsRef.current.clear();
    drawRef.current = [];
    setTouched(new Set());
    setEdgeHits(new Set());
    setDrawPoints([]);
    setMultiTouches([]);
  }, []);

  const renderGrid = () => {
    const cells: React.ReactNode[] = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const key = `${r}-${c}`;
        cells.push(
          <View key={key} style={[styles.cell, touched.has(key) && styles.cellTouched]} />
        );
      }
    }
    return <View style={styles.grid}>{cells}</View>;
  };

  const renderMultiTouch = () => (
    <View style={styles.multiContainer} {...multiPanResponder.panHandlers}>
      <Text style={styles.multiHint}>Touch with multiple fingers</Text>
      {multiTouches.map((t) => (
        <View key={t.id} style={[styles.touchDot, { left: t.x - 25, top: t.y - 25 }]}>
          <Text style={styles.touchDotText}>{t.id + 1}</Text>
        </View>
      ))}
    </View>
  );

  const renderEdge = () => (
    <View style={styles.edgeContainer}>
      {EDGE_ZONES.map((zone) => {
        const hit = edgeHits.has(zone.label);
        return (
          <View
            key={zone.label}
            style={[
              styles.edgeZone,
              {
                left: zone.x ?? (zone.label.includes('Right') ? width - 60 : 0),
                top: zone.y ?? (zone.label.includes('Bottom') ? height - 100 : 0),
                width: zone.w ?? (zone.label.startsWith('Top-') || zone.label.startsWith('Bottom-') ? 60 : width),
                height: zone.h ?? (zone.label.includes('Left') || zone.label.includes('Right') ? height : 40),
              },
              hit && styles.edgeZoneHit,
            ]}
          >
            <Text style={[styles.edgeLabel, hit && styles.edgeLabelHit]}>{zone.label}</Text>
          </View>
        );
      })}
    </View>
  );

  const renderDraw = () => (
    <View style={styles.drawContainer}>
      {drawPoints.length > 1 && (
        <View style={styles.drawOverlay}>
          {drawPoints.slice(1).map((pt, i) => {
            const prev = drawPoints[i];
            const dist = Math.sqrt(Math.pow(pt.x - prev.x, 2) + Math.pow(pt.y - prev.y, 2));
            if (dist > 20) return null;
            return (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: pt.x - 2,
                  top: pt.y - 2,
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: '#4CAF50',
                }}
              />
            );
          })}
        </View>
      )}
    </View>
  );

  const getStats = () => {
    switch (mode) {
      case 'grid':
        return { label: `${coverage}% Coverage`, sub: `${touched.size}/${TOTAL_CELLS} cells` };
      case 'edge':
        return { label: `${edgeCoverage}% Edge Coverage`, sub: `${edgeHits.size}/${EDGE_ZONES.length} zones` };
      case 'multi':
        return { label: 'Multi-Touch Active', sub: `${multiTouches.length} fingers detected` };
      case 'draw':
        return { label: 'Drawing Mode', sub: `${drawPoints.length} points captured` };
    }
  };

  const stats = getStats();

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Touch Test</Text>
        <TouchableOpacity onPress={reset} style={styles.resetBtn}>
          <Ionicons name="refresh" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.testArea} {...(mode === 'grid' || mode === 'edge' || mode === 'draw' ? panResponder.panHandlers : {})}>
        {mode === 'grid' && renderGrid()}
        {mode === 'multi' && renderMultiTouch()}
        {mode === 'edge' && renderEdge()}
        {mode === 'draw' && renderDraw()}
      </View>

      <View style={styles.footer}>
        <View style={styles.statsRow}>
          <Text style={styles.statsLabel}>{stats.label}</Text>
          <Text style={styles.statsSub}>{stats.sub}</Text>
        </View>
        <View style={styles.modeRow}>
          {MODES.map((m) => (
            <TouchableOpacity
              key={m.key}
              style={[styles.modeBtn, mode === m.key && styles.modeBtnActive]}
              onPress={() => { reset(); setMode(m.key); }}
            >
              <Ionicons name={m.icon as any} size={18} color={mode === m.key ? '#FFF' : '#888'} />
              <Text style={[styles.modeBtnText, mode === m.key && styles.modeBtnTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: '#1E1E2E',
    zIndex: 10,
  },
  backBtn: { padding: 8 },
  title: { flex: 1, color: '#FFF', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  resetBtn: { padding: 8 },
  testArea: { flex: 1, overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL_W, height: CELL_H, backgroundColor: '#1A1A2E', borderWidth: 0.3, borderColor: '#222' },
  cellTouched: { backgroundColor: '#4CAF50' },
  multiContainer: { flex: 1, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  multiHint: { color: '#555', fontSize: 16, position: 'absolute' },
  touchDot: {
    position: 'absolute', width: 50, height: 50, borderRadius: 25,
    backgroundColor: '#4CAF5040', borderWidth: 2, borderColor: '#4CAF50',
    justifyContent: 'center', alignItems: 'center',
  },
  touchDotText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  edgeContainer: { flex: 1, backgroundColor: '#111' },
  edgeZone: {
    position: 'absolute', backgroundColor: '#3336',
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#555',
  },
  edgeZoneHit: { backgroundColor: '#4CAF5050', borderColor: '#4CAF50' },
  edgeLabel: { color: '#888', fontSize: 11, fontWeight: '600' },
  edgeLabelHit: { color: '#4CAF50' },
  drawContainer: { flex: 1, backgroundColor: '#111' },
  drawOverlay: { flex: 1 },
  footer: { backgroundColor: '#1E1E2E', paddingHorizontal: 16, paddingBottom: 8, paddingTop: 8 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  statsLabel: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  statsSub: { color: '#888', fontSize: 12 },
  modeRow: { flexDirection: 'row', gap: 6 },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#333', paddingVertical: 8, borderRadius: 8, gap: 4,
  },
  modeBtnActive: { backgroundColor: '#4CAF50' },
  modeBtnText: { color: '#888', fontSize: 10, fontWeight: '600' },
  modeBtnTextActive: { color: '#FFF' },
});
