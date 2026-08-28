import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  PanResponder,
  StatusBar,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');
const GRID_COLS = 18;
const HEADER_H = 44;
const FOOTER_H = 110;

export default function TouchTestScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const systemNavH = insets.bottom || 20;
  const gridH = height - HEADER_H - FOOTER_H - systemNavH;
  const CELL_W = width / GRID_COLS;
  const ROWS = Math.floor(gridH / CELL_W);
  const GRID_H = ROWS * CELL_W;
  const TOTAL = GRID_COLS * ROWS;

  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [edgeHits, setEdgeHits] = useState<Set<string>>(new Set());
  const [drawLen, setDrawLen] = useState(0);
  const [mode, setMode] = useState<'grid' | 'edge' | 'draw'>('grid');

  const touchedRef = useRef(new Set<string>());
  const edgeRef = useRef(new Set<string>());
  const drawCountRef = useRef(0);
  const gridTopRef = useRef(0);

  const markCell = useCallback((pageX: number, pageY: number) => {
    const relY = pageY - gridTopRef.current;
    if (relY < 0 || relY > GRID_H) return;
    const col = Math.floor(pageX / CELL_W);
    const row = Math.floor(relY / CELL_W);
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= ROWS) return;
    const key = `${row}-${col}`;
    if (!touchedRef.current.has(key)) {
      touchedRef.current.add(key);
      setTouched(new Set(touchedRef.current));
    }
    // Also mark adjacent cells for wider finger coverage
    const offsets = [-1, 0, 1];
    offsets.forEach((dr) => {
      offsets.forEach((dc) => {
        const r2 = row + dr;
        const c2 = col + dc;
        if (r2 >= 0 && r2 < ROWS && c2 >= 0 && c2 < GRID_COLS) {
          const k2 = `${r2}-${c2}`;
          if (!touchedRef.current.has(k2)) {
            touchedRef.current.add(k2);
            setTouched(new Set(touchedRef.current));
          }
        }
      });
    });
  }, [GRID_H, CELL_W, ROWS]);

  const markEdge = useCallback((pageX: number, pageY: number) => {
    const zones: string[] = [];
    if (pageY < HEADER_H + 50) zones.push('Top');
    if (pageY > height - FOOTER_H - systemNavH - 50) zones.push('Bottom');
    if (pageX < 30) zones.push('Left');
    if (pageX > width - 30) zones.push('Right');
    if (pageX < 60 && pageY < HEADER_H + 80) zones.push('Top-Left');
    if (pageX > width - 60 && pageY < HEADER_H + 80) zones.push('Top-Right');
    if (pageX < 60 && pageY > height - FOOTER_H - systemNavH - 80) zones.push('Bottom-Left');
    if (pageX > width - 60 && pageY > height - FOOTER_H - systemNavH - 80) zones.push('Bottom-Right');
    if (zones.length > 0) {
      zones.forEach((z) => edgeRef.current.add(z));
      setEdgeHits(new Set(edgeRef.current));
    }
  }, [systemNavH]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_, gs) => {
        // x0, y0 are relative to the testArea view
        const absX = gs.x0;
        const absY = gs.y0 + gridTopRef.current;
        if (mode === 'grid') markCell(absX, absY);
        else if (mode === 'edge') markEdge(absX, absY);
        else { drawCountRef.current = 1; setDrawLen(1); }
      },
      onPanResponderMove: (_, gs) => {
        // moveX is absolute screen X, dy is displacement from start
        const absX = gs.moveX;
        const absY = gs.y0 + gs.dy + gridTopRef.current;
        if (mode === 'grid') {
          markCell(absX, absY);
        } else if (mode === 'edge') {
          markEdge(absX, absY);
        } else {
          drawCountRef.current++;
          setDrawLen(drawCountRef.current);
        }
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  const coverage = Math.round((touched.size / TOTAL) * 100);
  const edgeCoverage = Math.round((edgeHits.size / 8) * 100);

  const reset = useCallback(() => {
    touchedRef.current.clear();
    edgeRef.current.clear();
    drawCountRef.current = 0;
    setTouched(new Set());
    setEdgeHits(new Set());
    setDrawLen(0);
  }, []);

  const getStatusColor = () => {
    if (mode === 'grid') return coverage >= 80 ? '#4CAF50' : coverage >= 40 ? '#FF9800' : '#F44336';
    if (mode === 'edge') return edgeCoverage >= 75 ? '#4CAF50' : '#FF9800';
    return '#4CAF50';
  };

  const getStatusText = () => {
    if (mode === 'grid') return `${coverage}% · ${touched.size}/${TOTAL} cells`;
    if (mode === 'edge') return `${edgeCoverage}% · ${edgeHits.size}/8 zones`;
    return `${drawLen} points`;
  };

  // Render grid cells
  const cells: React.ReactNode[] = [];
  if (mode === 'grid') {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const key = `${r}-${c}`;
        cells.push(
          <View key={key} style={[s.cell, { width: CELL_W, height: CELL_W }, touched.has(key) && s.cellOn]} />
        );
      }
    }
  }

  // Render edge zones
  const edgeZones = [
    { label: 'Top', style: { top: HEADER_H, left: 0, width, height: 40 } },
    { label: 'Bottom', style: { bottom: FOOTER_H + systemNavH, left: 0, width, height: 40 } },
    { label: 'Left', style: { top: HEADER_H, left: 0, width: 25, height: GRID_H } },
    { label: 'Right', style: { top: HEADER_H, right: 0, width: 25, height: GRID_H } },
    { label: 'Top-Left', style: { top: HEADER_H, left: 0, width: 50, height: 50 } },
    { label: 'Top-Right', style: { top: HEADER_H, right: 0, width: 50, height: 50 } },
    { label: 'Bottom-Left', style: { bottom: FOOTER_H + systemNavH, left: 0, width: 50, height: 50 } },
    { label: 'Bottom-Right', style: { bottom: FOOTER_H + systemNavH, right: 0, width: 50, height: 50 } },
  ];

  return (
    <View style={s.root}>
      <StatusBar hidden />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={s.title}>Touch Test</Text>
        <TouchableOpacity onPress={reset} style={s.backBtn}>
          <Ionicons name="refresh" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Test area */}
      <View
        style={[s.testArea, { height: GRID_H }]}
        onLayout={(e) => { gridTopRef.current = e.nativeEvent.layout.y; }}
        {...panResponder.panHandlers}
      >
        {mode === 'grid' && (
          <View style={[s.grid, { width, height: GRID_H }]}>
            {cells}
          </View>
        )}
        {mode === 'edge' && (
          <View style={[s.grid, { width, height: GRID_H, backgroundColor: '#111' }]}>
            {edgeZones.map((z) => (
              <View
                key={z.label}
                style={[
                  s.edgeZone,
                  z.style as any,
                  edgeHits.has(z.label) && s.edgeHit,
                ]}
              >
                <Text style={[s.edgeLabel, edgeHits.has(z.label) && s.edgeLabelHit]}>
                  {z.label}
                </Text>
              </View>
            ))}
          </View>
        )}
        {mode === 'draw' && (
          <View style={[s.grid, { width, height: GRID_H, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ color: '#555', fontSize: 14 }}>Draw anywhere on this area</Text>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={[s.footer, { paddingBottom: systemNavH + 8 }]}>
        <View style={s.statusRow}>
          <View style={[s.statusDot, { backgroundColor: getStatusColor() }]} />
          <Text style={[s.statusText, { color: getStatusColor() }]}>{getStatusText()}</Text>
        </View>
        <View style={s.modeRow}>
          {(['grid', 'edge', 'draw'] as const).map((m) => (
            <TouchableOpacity
              key={m}
              style={[s.modeBtn, mode === m && s.modeBtnActive]}
              onPress={() => { reset(); setMode(m); }}
            >
              <Ionicons
                name={m === 'grid' ? 'grid-outline' : m === 'edge' ? 'expand-outline' : 'create-outline'}
                size={16}
                color={mode === m ? '#FFF' : '#888'}
              />
              <Text style={[s.modeText, mode === m && s.modeTextActive]}>
                {m === 'grid' ? 'Grid' : m === 'edge' ? 'Edge' : 'Draw'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: '#1E1E2E',
    zIndex: 10,
  },
  backBtn: { padding: 8 },
  title: { flex: 1, color: '#FFF', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  testArea: { overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    backgroundColor: '#1A1A2E',
    borderWidth: 0.3,
    borderColor: '#2A2A3A',
  },
  cellOn: { backgroundColor: '#4CAF50' },
  edgeZone: {
    position: 'absolute',
    backgroundColor: '#3338',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#555',
  },
  edgeHit: { backgroundColor: '#4CAF5050', borderColor: '#4CAF50' },
  edgeLabel: { color: '#888', fontSize: 10, fontWeight: '600' },
  edgeLabelHit: { color: '#4CAF50' },
  footer: {
    backgroundColor: '#1E1E2E',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 4,
  },
  modeBtnActive: { backgroundColor: '#4CAF50' },
  modeText: { color: '#888', fontSize: 12, fontWeight: '600' },
  modeTextActive: { color: '#FFF' },
});
