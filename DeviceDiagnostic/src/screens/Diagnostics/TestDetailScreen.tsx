import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Button, Chip } from 'react-native-paper';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import { DiagnosticEngine } from '../../core/DiagnosticEngine';
import { allDiagnostics } from '../../diagnostics';
import type { DiagnosticTest, DiagnosticResult, DiagnosticStatus } from '../../types';

type RootStackParamList = {
  TestDetail: { testId: string };
};

type RouteProps = RouteProp<RootStackParamList, 'TestDetail'>;

const engine = new DiagnosticEngine();

const STATUS_COLORS: Record<DiagnosticStatus, string> = {
  PASS: '#4CAF50',
  WARNING: '#FF9800',
  FAIL: '#F44336',
  NOT_SUPPORTED: '#666',
  NOT_TESTED: '#444',
};

export default function TestDetailScreen() {
  const route = useRoute<RouteProps>();
  const { testId } = route.params;

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
      </View>
    );
  }

  const statusColor = result ? STATUS_COLORS[result.status] : '#444';
  const statusIcon = (
    result ? (result.status === 'PASS' ? 'checkmark-circle' : result.status === 'WARNING' ? 'warning' : result.status === 'FAIL' ? 'close-circle' : 'help-circle') : 'help-circle'
  ) as any;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Card style={styles.mainCard}>
        <Card.Content>
          <View style={styles.titleRow}>
            <Text style={styles.testName}>{test.name}</Text>
            {result && (
              <Chip
                style={[styles.statusChip, { backgroundColor: statusColor + '20' }]}
                textStyle={[styles.chipText, { color: statusColor }]}
              >
                {result.status.replace('_', ' ')}
              </Chip>
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
        </Card.Content>
      </Card>

      <Card style={styles.sectionCard}>
        <Card.Content>
          <Text style={styles.sectionTitle}>What is being tested?</Text>
          <Text style={styles.sectionBody}>
            This diagnostic test checks the functionality and performance of the{' '}
            {test.name.toLowerCase()} component on your device. It verifies that the
            hardware or software component is responding correctly within expected
            parameters.
          </Text>
        </Card.Content>
      </Card>

      {result && result.supported && Object.keys(result.details).length > 0 && (
        <Card style={styles.sectionCard}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Current Values</Text>
            {Object.entries(result.details).map(([key, value]) => (
              <View key={key} style={styles.detailRow}>
                <Text style={styles.detailKey}>{key}</Text>
                <Text style={styles.detailValue}>{String(value)}</Text>
              </View>
            ))}
          </Card.Content>
        </Card>
      )}

      {running ? (
        <View style={styles.runningBanner}>
          <ActivityIndicator size="small" color="#4CAF50" />
          <Text style={styles.runningText}>Running test...</Text>
        </View>
      ) : (
        <Button
          mode="contained"
          onPress={runTest}
          disabled={!supported}
          style={styles.runButton}
          buttonColor="#4CAF50"
          labelStyle={styles.runButtonLabel}
          icon="play"
        >
          {result ? 'Run Again' : 'Start Test'}
        </Button>
      )}

      {result && (
        <Card style={styles.sectionCard}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Result</Text>
            <View style={[styles.resultBanner, { backgroundColor: statusColor + '15' }]}>
              <Ionicons name={statusIcon} size={28} color={statusColor} />
              <View style={styles.resultInfo}>
                <Text style={[styles.resultStatus, { color: statusColor }]}>
                  {result.status.replace('_', ' ')}
                </Text>
                <Text style={styles.resultMessage}>{result.message}</Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      )}

      {result && result.supported && Object.keys(result.details).length > 0 && (
        <Card style={styles.sectionCard}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Technical Details</Text>
            {Object.entries(result.details).map(([key, value]) => (
              <View key={key} style={styles.techRow}>
                <Text style={styles.techKey}>{key}</Text>
                <Text style={styles.techValue}>{String(value)}</Text>
              </View>
            ))}
            {result.duration !== undefined && (
              <View style={styles.techRow}>
                <Text style={styles.techKey}>Duration</Text>
                <Text style={styles.techValue}>{(result.duration / 1000).toFixed(2)}s</Text>
              </View>
            )}
            <View style={styles.techRow}>
              <Text style={styles.techKey}>Timestamp</Text>
              <Text style={styles.techValue}>
                {new Date(result.timestamp).toLocaleString()}
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  contentContainer: { padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  mainCard: { backgroundColor: '#1E1E2E', marginBottom: 12, borderRadius: 12 },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  testName: { color: '#FFF', fontSize: 20, fontWeight: '700', flex: 1 },
  testDesc: { color: '#AAA', fontSize: 14, lineHeight: 20, marginBottom: 12 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  metaLabel: { color: '#888', fontSize: 13 },
  metaValue: { color: '#DDD', fontSize: 13, fontWeight: '500', textTransform: 'capitalize' },
  statusChip: { height: 28 },
  chipText: { fontSize: 11, fontWeight: '600' },
  sectionCard: { backgroundColor: '#1E1E2E', marginBottom: 12, borderRadius: 12 },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 10 },
  sectionBody: { color: '#AAA', fontSize: 13, lineHeight: 20 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A3A',
  },
  detailKey: { color: '#888', fontSize: 13 },
  detailValue: { color: '#DDD', fontSize: 13, fontWeight: '500' },
  runningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E1E2E',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    gap: 10,
  },
  runningText: { color: '#4CAF50', fontSize: 14, fontWeight: '500' },
  runButton: { marginBottom: 16, borderRadius: 12, paddingVertical: 4 },
  runButtonLabel: { fontSize: 15, fontWeight: '600' },
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    gap: 12,
  },
  resultInfo: { flex: 1 },
  resultStatus: { fontSize: 16, fontWeight: '700' },
  resultMessage: { color: '#AAA', fontSize: 13, marginTop: 2 },
  techRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A3A',
  },
  techKey: { color: '#888', fontSize: 12 },
  techValue: { color: '#DDD', fontSize: 12, fontWeight: '500' },
  bottomPadding: { height: 32 },
});
