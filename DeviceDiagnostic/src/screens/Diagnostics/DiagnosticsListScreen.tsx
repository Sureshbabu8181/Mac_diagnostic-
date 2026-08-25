import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Button, Chip } from 'react-native-paper';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { DiagnosticEngine } from '../../core/DiagnosticEngine';
import { allDiagnostics } from '../../diagnostics';
import type { DiagnosticCategory, DiagnosticTest, DiagnosticResult } from '../../types';

type RootStackParamList = {
  DiagnosticsList: { category: DiagnosticCategory; title: string };
  TestDetail: { testId: string };
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'DiagnosticsList'>;
type RouteProps = RouteProp<RootStackParamList, 'DiagnosticsList'>;

const engine = new DiagnosticEngine();

const STATUS_COLORS: Record<string, string> = {
  PASS: '#4CAF50',
  WARNING: '#FF9800',
  FAIL: '#F44336',
  NOT_SUPPORTED: '#666',
  NOT_TESTED: '#444',
};

const STATUS_ICONS: Record<string, string> = {
  PASS: 'checkmark-circle',
  WARNING: 'warning',
  FAIL: 'close-circle',
  NOT_SUPPORTED: 'remove-circle',
  NOT_TESTED: 'help-circle',
};

export default function DiagnosticsListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<any>();
  const category = route.params?.category as DiagnosticCategory | undefined;
  const title = route.params?.title as string | undefined;

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
      const withSupport = await Promise.all(
        categoryTests.map(async (t) => ({
          test: t,
          supported: await t.isSupported().catch(() => false),
        }))
      );
      setTests(withSupport.map((w) => w.test));
    } catch (err) {
      console.error('Failed to load tests:', err);
    } finally {
      setLoading(false);
    }
  };

  const runCategory = async () => {
    setRunning(true);
    setProgress({ current: 0, total: tests.length });
    try {
      const map = new Map<string, DiagnosticResult>();
      if (category) {
        const categoryResults = await engine.runCategoryTests(category, (current, total) => {
          setProgress({ current, total });
        });
        categoryResults.forEach((r: DiagnosticResult) => map.set(r.testId, r));
      } else {
        const session = await engine.runAllTests((current, total) => {
          setProgress({ current, total });
        });
        session.results.forEach((r: DiagnosticResult) => map.set(r.testId, r));
      }
      setResults(map);
    } catch (err) {
      console.error('Category run failed:', err);
    } finally {
      setRunning(false);
    }
  };

  const runSingleTest = async (testId: string) => {
    try {
      const result = await engine.runTest(testId);
      setResults((prev) => new Map(prev).set(testId, result));
    } catch (err) {
      console.error('Test run failed:', err);
    }
  };

  const supportedCount = tests.length;
  const resultArray = Array.from(results.values());
  const testedCount = resultArray.filter(
    (r) => r.status !== 'NOT_SUPPORTED' && r.status !== 'NOT_TESTED'
  ).length;

  const renderTest = ({ item }: { item: DiagnosticTest }) => {
    const result = results.get(item.id);
    const status = result?.status ?? 'NOT_TESTED';
    const color = STATUS_COLORS[status] ?? '#444';
    const iconName = (STATUS_ICONS[status] ?? 'help-circle') as any;

    return (
      <TouchableOpacity
        style={styles.testItem}
        onPress={() => navigation.navigate('TestDetail', { testId: item.id })}
        onLongPress={() => runSingleTest(item.id)}
      >
        <View style={styles.testLeft}>
          <Ionicons name={iconName} size={22} color={color} />
          <View style={styles.testInfo}>
            <Text style={styles.testName}>{item.name}</Text>
            <Text style={styles.testDesc} numberOfLines={1}>
              {item.description}
            </Text>
          </View>
        </View>
        <Chip
          compact
          style={[styles.statusChip, { backgroundColor: color + '20' }]}
          textStyle={[styles.chipText, { color }]}
        >
          {status.replace('_', ' ')}
        </Chip>
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
      <Card style={styles.headerCard}>
        <Card.Content>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSubtitle}>
            {supportedCount} tests available · {testedCount} tested
          </Text>
        </Card.Content>
      </Card>

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

      <View style={styles.footer}>
        <Button
          mode="contained"
          onPress={runCategory}
          disabled={running}
          style={styles.runButton}
          buttonColor="#4CAF50"
          labelStyle={styles.runButtonLabel}
          icon="play"
        >
          Run Category
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  headerCard: { backgroundColor: '#1E1E2E', margin: 16, marginBottom: 8, borderRadius: 12 },
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
    gap: 10,
  },
  progressText: { color: '#4CAF50', fontSize: 14, fontWeight: '500' },
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
  testLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  testInfo: { flex: 1 },
  testName: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  testDesc: { color: '#888', fontSize: 12, marginTop: 2 },
  statusChip: { height: 28 },
  chipText: { fontSize: 11, fontWeight: '600' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#121212',
  },
  runButton: { borderRadius: 12, paddingVertical: 4 },
  runButtonLabel: { fontSize: 15, fontWeight: '600' },
});
