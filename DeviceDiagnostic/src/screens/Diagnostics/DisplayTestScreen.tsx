import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

type Pattern = 'checkerboard' | 'colorBars' | 'red' | 'green' | 'blue' | 'white' | 'black' | 'gradient';

const PATTERNS: { key: Pattern; label: string; color: string }[] = [
  { key: 'red', label: 'Red', color: '#FF0000' },
  { key: 'green', label: 'Green', color: '#00FF00' },
  { key: 'blue', label: 'Blue', color: '#0000FF' },
  { key: 'white', label: 'White', color: '#FFFFFF' },
  { key: 'black', label: 'Black', color: '#000000' },
  { key: 'gradient', label: 'Gradient', color: '#1a1a2e' },
  { key: 'checkerboard', label: 'Checkerboard', color: '#000000' },
  { key: 'colorBars', label: 'Color Bars', color: '#000000' },
];

const { width, height } = Dimensions.get('window');
const CELL_SIZE = 40;

function Checkerboard() {
  const cols = Math.ceil(width / CELL_SIZE);
  const rows = Math.ceil(height / CELL_SIZE);
  const cells: React.ReactNode[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isWhite = (r + c) % 2 === 0;
      cells.push(
        <View
          key={`${r}-${c}`}
          style={{
            width: CELL_SIZE,
            height: CELL_SIZE,
            backgroundColor: isWhite ? '#FFFFFF' : '#000000',
          }}
        />
      );
    }
  }

  return (
    <View style={styles.patternContainer}>
      <View style={styles.checkerboardGrid}>{cells}</View>
    </View>
  );
}

function ColorBars() {
  const colors = ['#FFFFFF', '#FFFF00', '#00FFFF', '#00FF00', '#FF00FF', '#FF0000', '#0000FF', '#000000'];
  return (
    <View style={styles.patternContainer}>
      <View style={styles.colorBarsContainer}>
        {colors.map((color, i) => (
          <View key={i} style={[styles.colorBar, { backgroundColor: color }]} />
        ))}
      </View>
    </View>
  );
}

function GradientScreen() {
  const rows = Math.ceil(height / 4);
  const rowViews: React.ReactNode[] = [];

  for (let i = 0; i < rows; i++) {
    const ratio = i / rows;
    const r = Math.round(0 + ratio * 255);
    const g = Math.round(0 + ratio * 100);
    const b = Math.round(50 + ratio * 200);
    rowViews.push(
      <View
        key={i}
        style={{
          width: '100%',
          height: 4,
          backgroundColor: `rgb(${r},${g},${b})`,
        }}
      />
    );
  }

  return <View style={styles.patternContainer}>{rowViews}</View>;
}

export default function DisplayTestScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const [patternIndex, setPatternIndex] = useState(0);
  const currentPattern = PATTERNS[patternIndex];

  const cyclePattern = useCallback(() => {
    setPatternIndex((prev) => (prev + 1) % PATTERNS.length);
  }, []);

  const handleLongPress = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleResult = (status: 'PASS' | 'FAIL' | 'SKIP') => {
    const onResult = (route.params as any)?.onResult;
    if (onResult) onResult(status);
    navigation.goBack();
  };

  const renderPattern = () => {
    switch (currentPattern.key) {
      case 'checkerboard':
        return <Checkerboard />;
      case 'colorBars':
        return <ColorBars />;
      case 'gradient':
        return <GradientScreen />;
      default:
        return null;
    }
  };

  const isSolid = ['red', 'green', 'blue', 'white', 'black'].includes(currentPattern.key);

  return (
    <TouchableOpacity
      style={[styles.container, isSolid && { backgroundColor: currentPattern.color }]}
      activeOpacity={1}
      onPress={cyclePattern}
      onLongPress={handleLongPress}
    >
      <StatusBar hidden />

      {!isSolid && renderPattern()}

      <View style={styles.patternLabel}>
        <Text style={[styles.labelText, { color: currentPattern.key === 'black' ? '#FFF' : '#000' }]}>
          {currentPattern.label} — Tap to cycle
        </Text>
      </View>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.resultButton, { backgroundColor: '#4CAF50' }]}
          onPress={() => handleResult('PASS')}
        >
          <Ionicons name="checkmark-circle" size={22} color="#FFF" />
          <Text style={styles.resultButtonText}>PASS</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.resultButton, { backgroundColor: '#F44336' }]}
          onPress={() => handleResult('FAIL')}
        >
          <Ionicons name="close-circle" size={22} color="#FFF" />
          <Text style={styles.resultButtonText}>FAIL</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.resultButton, { backgroundColor: '#666' }]}
          onPress={() => handleResult('SKIP')}
        >
          <Ionicons name="arrow-back-circle" size={22} color="#FFF" />
          <Text style={styles.resultButtonText}>SKIP</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  patternContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkerboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: width,
  },
  colorBarsContainer: {
    flexDirection: 'row',
    flex: 1,
    width: '100%',
  },
  colorBar: {
    flex: 1,
  },
  patternLabel: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  labelText: {
    fontSize: 13,
    fontWeight: '500',
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingBottom: 50,
    paddingHorizontal: 20,
  },
  resultButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    gap: 6,
  },
  resultButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
