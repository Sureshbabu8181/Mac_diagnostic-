import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Button, ProgressBar } from 'react-native-paper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Device from 'expo-device';

import { DiagnosticEngine } from '../../core/DiagnosticEngine';
import { ScoringEngine } from '../../core/ScoringEngine';
import { Database } from '../../database/Database';
import { CATEGORIES } from '../../config/diagnostics';
import { allDiagnostics } from '../../diagnostics';
import type {
  DiagnosticResult,
  DiagnosticSession,
  DiagnosticCategory,
} from '../../types';

type RootStackParamList = {
  DiagnosticsList: { category: DiagnosticCategory; title: string };
  TestDetail: { testId: string };
  SessionDetail: { sessionId: string };
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const engine = new DiagnosticEngine();
const scoring = new ScoringEngine();
const db = Database.getInstance();

export default function DashboardScreen() {
  const navigation = useNavigation<NavigationProp>();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, testName: '' });
  const [session, setSession] = useState<DiagnosticSession | null>(null);
  const [counts, setCounts] = useState({ pass: 0, warning: 0, fail: 0, notSupported: 0, notTested: 0 });
  const [recentSessions, setRecentSessions] = useState<DiagnosticSession[]>([]);

  const deviceInfo = {
    model: Device.modelName ?? 'Unknown',
    manufacturer: Device.manufacturer ?? 'Unknown',
    osVersion: Device.osVersion ?? 'Unknown',
    platform: Device.osName ?? 'Unknown',
  };

  useEffect(() => {
    engine.registerTests(allDiagnostics);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const sessions = await db.getSessions();
      setRecentSessions(sessions.slice(0, 5));
      if (sessions.length > 0) {
        const latest = sessions[0];
        setSession(latest);
        setCounts(scoring.getStatusCounts(latest.results));
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const runFullDiagnostic = async () => {
    setRunning(true);
    setProgress({ current: 0, total: 0, testName: '' });
    try {
      const result = await engine.runAllTests((current, total, testName) => {
        setProgress({ current, total, testName });
      });
      setSession(result);
      setCounts(scoring.getStatusCounts(result.results));
      const sessions = await db.getSessions();
      setRecentSessions(sessions.slice(0, 5));
    } catch (err) {
      console.error('Diagnostic run failed:', err);
    } finally {
      setRunning(false);
    }
  };

  const getScoreColor = (score: number) => scoring.getScoreColor(score);
  const getScoreLabel = (score: number) => scoring.getScoreLabel(score);

  const getCategoryIcon = (iconName: string) => iconName as any;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4CAF50" />}
    >
      <Card style={styles.deviceCard}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <Ionicons name="phone-portrait-outline" size={20} color="#4CAF50" />
            <Text style={styles.cardTitle}>Device Info</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Model</Text>
            <Text style={styles.infoValue}>{deviceInfo.model}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Manufacturer</Text>
            <Text style={styles.infoValue}>{deviceInfo.manufacturer}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>OS Version</Text>
            <Text style={styles.infoValue}>{deviceInfo.platform} {deviceInfo.osVersion}</Text>
          </View>
        </Card.Content>
      </Card>

      {session && (
        <Card style={styles.scoreCard}>
          <Card.Content style={styles.scoreContent}>
            <View style={[styles.scoreCircle, { borderColor: getScoreColor(session.healthScore) }]}>
              <Text style={[styles.scoreNumber, { color: getScoreColor(session.healthScore) }]}>
                {session.healthScore}
              </Text>
              <Text style={styles.scoreMax}>/100</Text>
            </View>
            <Text style={[styles.scoreLabel, { color: getScoreColor(session.healthScore) }]}>
              {getScoreLabel(session.healthScore)}
            </Text>
          </Card.Content>
        </Card>
      )}

      <View style={styles.statusRow}>
        <View style={[styles.statusBadge, { backgroundColor: '#4CAF5020' }]}>
          <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
          <Text style={[styles.statusText, { color: '#4CAF50' }]}>{counts.pass}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: '#FF980020' }]}>
          <Ionicons name="warning" size={18} color="#FF9800" />
          <Text style={[styles.statusText, { color: '#FF9800' }]}>{counts.warning}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: '#F4433620' }]}>
          <Ionicons name="close-circle" size={18} color="#F44336" />
          <Text style={[styles.statusText, { color: '#F44336' }]}>{counts.fail}</Text>
        </View>
      </View>

      {running ? (
        <Card style={styles.progressCard}>
          <Card.Content>
            <Text style={styles.progressTitle}>Running Diagnostics...</Text>
            <Text style={styles.progressTest}>{progress.testName}</Text>
            <ProgressBar
              progress={progress.total > 0 ? progress.current / progress.total : 0}
              color="#4CAF50"
              style={styles.progressBar}
            />
            <Text style={styles.progressCount}>
              {progress.current} / {progress.total}
            </Text>
          </Card.Content>
        </Card>
      ) : (
        <Button
          mode="contained"
          onPress={runFullDiagnostic}
          style={styles.runButton}
          buttonColor="#4CAF50"
          labelStyle={styles.runButtonLabel}
          icon="play-circle"
        >
          Run Full Diagnostic
        </Button>
      )}

      <Text style={styles.sectionTitle}>Categories</Text>
      <View style={styles.categoryGrid}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={styles.categoryCard}
            onPress={() =>
              navigation.navigate('DiagnosticsList', {
                category: cat.id as DiagnosticCategory,
                title: cat.name,
              })
            }
          >
            <Ionicons name={getCategoryIcon(cat.icon)} size={28} color="#4CAF50" />
            <Text style={styles.categoryName}>{cat.name}</Text>
            <Text style={styles.categoryDesc} numberOfLines={2}>
              {cat.description}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {recentSessions.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Recent History</Text>
          {recentSessions.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={styles.historyItem}
              onPress={() => navigation.navigate('SessionDetail', { sessionId: s.id })}
            >
              <View style={styles.historyLeft}>
                <Text style={styles.historyDate}>
                  {new Date(s.timestamp).toLocaleDateString()}
                </Text>
                <Text style={styles.historyDevice}>
                  {s.deviceModel || 'Unknown device'}
                </Text>
              </View>
              <View style={styles.historyRight}>
                <Text style={[styles.historyScore, { color: getScoreColor(s.healthScore) }]}>
                  {s.healthScore}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  contentContainer: { padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  loadingText: { color: '#888', marginTop: 12, fontSize: 14 },
  deviceCard: { backgroundColor: '#1E1E2E', marginBottom: 12, borderRadius: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', marginLeft: 8 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  infoLabel: { color: '#888', fontSize: 13 },
  infoValue: { color: '#DDD', fontSize: 13, fontWeight: '500' },
  scoreCard: { backgroundColor: '#1E1E2E', marginBottom: 12, borderRadius: 12 },
  scoreContent: { alignItems: 'center', paddingVertical: 16 },
  scoreCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  scoreNumber: { fontSize: 32, fontWeight: '700' },
  scoreMax: { color: '#666', fontSize: 12 },
  scoreLabel: { fontSize: 16, fontWeight: '600' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  statusText: { fontSize: 16, fontWeight: '700' },
  progressCard: { backgroundColor: '#1E1E2E', marginBottom: 16, borderRadius: 12 },
  progressTitle: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  progressTest: { color: '#AAA', fontSize: 13, marginBottom: 12 },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: '#333' },
  progressCount: { color: '#888', fontSize: 12, textAlign: 'right', marginTop: 8 },
  runButton: { marginBottom: 20, borderRadius: 12, paddingVertical: 4 },
  runButtonLabel: { fontSize: 15, fontWeight: '600' },
  sectionTitle: { color: '#AAA', fontSize: 14, fontWeight: '600', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  categoryCard: {
    backgroundColor: '#1E1E2E',
    borderRadius: 12,
    padding: 16,
    width: '48%',
    marginBottom: 12,
    alignItems: 'center',
    minHeight: 110,
  },
  categoryName: { color: '#FFF', fontSize: 14, fontWeight: '600', marginTop: 8 },
  categoryDesc: { color: '#888', fontSize: 11, textAlign: 'center', marginTop: 4 },
  historyItem: {
    backgroundColor: '#1E1E2E',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyLeft: { flex: 1 },
  historyDate: { color: '#AAA', fontSize: 12 },
  historyDevice: { color: '#DDD', fontSize: 14, marginTop: 2 },
  historyRight: { marginLeft: 12 },
  historyScore: { fontSize: 22, fontWeight: '700' },
  bottomPadding: { height: 32 },
});
