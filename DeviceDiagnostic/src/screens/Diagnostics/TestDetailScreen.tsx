import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useFocusEffect } from '@react-navigation/native';

import { DiagnosticEngine } from '../../core/DiagnosticEngine';
import { allDiagnostics } from '../../diagnostics';
import type { DiagnosticTest, DiagnosticResult } from '../../types';

const engine = new DiagnosticEngine();

const STATUS_COLORS: Record<string, string> = {
  PASS: '#4CAF50',
  WARNING: '#FF9800',
  FAIL: '#F44336',
  NOT_SUPPORTED: '#666',
  NOT_TESTED: '#444',
};

export default function TestDetailScreen() {
  const route = useRoute<any>();
  const testId = (route.params?.testId as string) ?? '';

  const [test, setTest] = useState<DiagnosticTest | null>(null);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [running, setRunning] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      engine.registerTests(allDiagnostics);
      loadTest();
    }, [testId])
  );

  const loadTest = async () => {
    if (!testId) return;
    const tests = engine.getTests();
    const found = tests.find((t) => t.id === testId);
    if (found) {
      setTest(found);
      const isSupported = await found.isSupported().catch(() => false);
      setSupported(isSupported);
    }
  };

  const runTest = async () => {
    if (!test) return;
    setRunning(true);
    try {
      const res = await engine.runTest(test.id);
      setResult(res);
    } catch (err) {
      console.error('Test failed:', err);
    } finally {
      setRunning(false);
    }
  };

  if (!test) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={{ color: '#888', marginTop: 8 }}>{testId ? 'Loading...' : 'No test specified'}</Text>
      </View>
    );
  }

  const statusColor = result ? (STATUS_COLORS[result.status] ?? '#444') : '#444';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <Text style={styles.testName}>{test.name}</Text>
          {result && (
            <View style={[styles.badge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.badgeText, { color: statusColor }]}>
                {result.status.replace('_', ' ')}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.testDesc}>{test.description}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Category</Text>
          <Text style={styles.metaValue}>{test.category}</Text>
        </View>
        {supported !== null && (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Supported</Text>
            <Text style={[styles.metaValue, { color: supported ? '#4CAF50' : '#F44336' }]}>
              {supported ? 'Yes' : 'No'}
            </Text>
          </View>
        )}
      </View>

      {result && result.supported && Object.keys(result.details).length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Details</Text>
          {Object.entries(result.details).map(([key, value]) => (
            <View key={key} style={styles.detailRow}>
              <Text style={styles.detailKey}>{key}</Text>
              <Text style={styles.detailValue}>{String(value)}</Text>
            </View>
          ))}
        </View>
      )}

      {running ? (
        <View style={styles.runningBanner}>
          <ActivityIndicator size="small" color="#4CAF50" />
          <Text style={styles.runningText}>Running test...</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.runButton, !supported && supported !== null && styles.runButtonDisabled]}
          onPress={runTest}
          disabled={!supported && supported !== null}
        >
          <Ionicons name="play" size={18} color="#FFF" />
          <Text style={styles.runButtonText}>{result ? 'Run Again' : 'Start Test'}</Text>
        </TouchableOpacity>
      )}

      {result && (
        <View style={[styles.resultBanner, { backgroundColor: statusColor + '15' }]}>
          <Ionicons
            name={result.status === 'PASS' ? 'checkmark-circle' : result.status === 'WARNING' ? 'warning' : result.status === 'FAIL' ? 'close-circle' : 'help-circle'}
            size={28}
            color={statusColor}
          />
          <View style={styles.resultInfo}>
            <Text style={[styles.resultStatus, { color: statusColor }]}>
              {result.status.replace('_', ' ')}
            </Text>
            <Text style={styles.resultMessage}>{result.message}</Text>
          </View>
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  content: { padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  card: { backgroundColor: '#1E1E2E', marginBottom: 12, padding: 16, borderRadius: 12 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  testName: { color: '#FFF', fontSize: 20, fontWeight: '700', flex: 1 },
  testDesc: { color: '#AAA', fontSize: 14, lineHeight: 20, marginBottom: 12 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#333' },
  metaLabel: { color: '#888', fontSize: 13 },
  metaValue: { color: '#DDD', fontSize: 13, fontWeight: '500', textTransform: 'capitalize' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2A2A3A' },
  detailKey: { color: '#888', fontSize: 13 },
  detailValue: { color: '#DDD', fontSize: 13, fontWeight: '500' },
  runningBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E1E2E', padding: 16, borderRadius: 12, marginBottom: 12 },
  runningText: { color: '#4CAF50', fontSize: 14, fontWeight: '500', marginLeft: 10 },
  runButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#4CAF50', marginBottom: 16, padding: 14, borderRadius: 12 },
  runButtonDisabled: { opacity: 0.5 },
  runButtonText: { color: '#FFF', fontSize: 15, fontWeight: '600', marginLeft: 8 },
  resultBanner: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, marginBottom: 12 },
  resultInfo: { flex: 1, marginLeft: 12 },
  resultStatus: { fontSize: 16, fontWeight: '700' },
  resultMessage: { color: '#AAA', fontSize: 13, marginTop: 2 },
});
