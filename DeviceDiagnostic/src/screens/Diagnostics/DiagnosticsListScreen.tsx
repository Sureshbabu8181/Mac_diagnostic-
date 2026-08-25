import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';

import { DiagnosticEngine } from '../../core/DiagnosticEngine';
import { allDiagnostics } from '../../diagnostics';
import type { DiagnosticCategory, DiagnosticTest, DiagnosticResult } from '../../types';

const engine = new DiagnosticEngine();

const MANUAL_TESTS: Record<string, string> = {
  display: 'DisplayTest',
  touch: 'TouchTest',
};

const STATUS_COLORS: Record<string, string> = {
  PASS: '#4CAF50',
  WARNING: '#FF9800',
  FAIL: '#F44336',
  NOT_SUPPORTED: '#666',
  NOT_TESTED: '#444',
};

export default function DiagnosticsListScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const category = route.params?.category as DiagnosticCategory | undefined;
  const title = route.params?.title as string;

  const [tests, setTests] = useState<DiagnosticTest[]>([]);
  const [results, setResults] = useState<Map<string, DiagnosticResult>>(new Map());
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useFocusEffect(
    useCallback(() => {
      engine.registerTests(allDiagnostics);
      loadTests();
    }, [category])
  );

  const loadTests = async () => {
    setLoading(true);
    try {
      const categoryTests = category ? engine.getTestsByCategory(category) : engine.getTests();
      setTests(categoryTests);
    } catch (err) {
      console.error('Failed to load tests:', err);
    } finally {
      setLoading(false);
    }
  };

  const runAll = async () => {
    setRunning(true);
    setProgress({ current: 0, total: tests.length });
    try {
      const map = new Map<string, DiagnosticResult>();
      if (category) {
        const categoryResults = await engine.runCategoryTests(category, (current, total) => {
          setProgress({ current, total });
        });
        categoryResults.forEach((r: DiagnosticResult) => map.set(r.testId, r));
      }
      setResults(map);
    } catch (err) {
      console.error('Category run failed:', err);
    } finally {
      setRunning(false);
    }
  };

  const handleTestPress = (test: DiagnosticTest) => {
    const manualScreen = MANUAL_TESTS[test.id];
    if (manualScreen) {
      navigation.navigate(manualScreen);
      return;
    }
    navigation.navigate('TestDetail', { testId: test.id });
  };

  const renderTest = ({ item }: { item: DiagnosticTest }) => {
    const result = results.get(item.id);
    const status = result?.status ?? 'NOT_TESTED';
    const color = STATUS_COLORS[status] ?? '#444';
    const isManual = MANUAL_TESTS[item.id] !== undefined;

    return (
      <TouchableOpacity
        style={styles.testItem}
        onPress={() => handleTestPress(item)}
      >
        <View style={styles.testLeft}>
          <Ionicons
            name={status === 'PASS' ? 'checkmark-circle' : status === 'WARNING' ? 'warning' : status === 'FAIL' ? 'close-circle' : isManual ? 'hand-left-outline' : 'help-circle'}
            size={22}
            color={color}
          />
          <View style={styles.testInfo}>
            <Text style={styles.testName}>{item.name}</Text>
            <Text style={styles.testDesc} numberOfLines={1}>
              {item.description}
            </Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: color + '20' }]}>
          <Text style={[styles.statusText, { color }]}>
            {isManual ? 'MANUAL' : status.replace('_', ' ')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>{title || 'All Tests'}</Text>
        <Text style={styles.headerSubtitle}>{tests.length} tests available</Text>
      </View>

      {running && (
        <View style={styles.progressBanner}>
          <ActivityIndicator size="small" color="#4CAF50" />
          <Text style={styles.progressText}>
            Running {progress.current}/{progress.total}
          </Text>
        </View>
      )}

      <FlatList
        data={tests}
        renderItem={renderTest}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <TouchableOpacity
        style={[styles.runButton, running && styles.runButtonDisabled]}
        onPress={runAll}
        disabled={running}
      >
        <Ionicons name="play" size={18} color="#FFF" />
        <Text style={styles.runButtonText}>
          {running ? `Running ${progress.current}/${progress.total}...` : 'Run All Tests'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  headerCard: {
    backgroundColor: '#1E1E2E',
    margin: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
  },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: '700' },
  headerSubtitle: { color: '#888', fontSize: 13, marginTop: 4 },
  progressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E2E',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    borderRadius: 10,
  },
  progressText: { color: '#4CAF50', fontSize: 14, fontWeight: '500', marginLeft: 10 },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  separator: { height: 8 },
  testItem: {
    backgroundColor: '#1E1E2E',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  testLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  testInfo: { flex: 1, marginLeft: 12 },
  testName: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  testDesc: { color: '#888', fontSize: 12, marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: { fontSize: 10, fontWeight: '700' },
  runButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    margin: 16,
    marginBottom: 32,
    padding: 14,
    borderRadius: 12,
  },
  runButtonDisabled: { opacity: 0.5 },
  runButtonText: { color: '#FFF', fontSize: 15, fontWeight: '600', marginLeft: 8 },
});
