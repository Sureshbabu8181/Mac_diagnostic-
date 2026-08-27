import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Device from 'expo-device';

import { DiagnosticEngine } from '../../core/DiagnosticEngine';
import { ScoringEngine } from '../../core/ScoringEngine';
import { Database } from '../../database/Database';
import { CATEGORIES } from '../../config/diagnostics';
import { allDiagnostics } from '../../diagnostics';
import type { DiagnosticSession, DiagnosticCategory } from '../../types';

const engine = new DiagnosticEngine();
const scoring = new ScoringEngine();
const db = Database.getInstance();

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, testName: '' });
  const [session, setSession] = useState<DiagnosticSession | null>(null);
  const [counts, setCounts] = useState({ pass: 0, warning: 0, fail: 0 });
  const [recentSessions, setRecentSessions] = useState<DiagnosticSession[]>([]);

  const deviceInfo = {
    model: Device.modelName ?? 'Unknown',
    manufacturer: Device.manufacturer ?? 'Unknown',
    osVersion: Device.osVersion ?? 'Unknown',
    platform: Device.osName ?? 'Unknown',
  };

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
      engine.registerTests(allDiagnostics);
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
      contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 72 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4CAF50" />}
    >
      <View style={styles.deviceCard}>
        <View style={styles.cardHeader}>
          <Ionicons name="phone-portrait-outline" size={20} color="#4CAF50" />
          <Text style={styles.cardTitle}>Device Info</Text>
        </View>
        <View style={styles.infoRow}><Text style={styles.infoLabel}>Model</Text><Text style={styles.infoValue}>{deviceInfo.model}</Text></View>
        <View style={styles.infoRow}><Text style={styles.infoLabel}>Manufacturer</Text><Text style={styles.infoValue}>{deviceInfo.manufacturer}</Text></View>
        <View style={styles.infoRow}><Text style={styles.infoLabel}>OS</Text><Text style={styles.infoValue}>{deviceInfo.platform} {deviceInfo.osVersion}</Text></View>
      </View>

      {session && (
        <View style={styles.scoreCard}>
          <View style={[styles.scoreCircle, { borderColor: getScoreColor(session.healthScore) }]}>
            <Text style={[styles.scoreNumber, { color: getScoreColor(session.healthScore) }]}>
              {session.healthScore}
            </Text>
            <Text style={styles.scoreMax}>/100</Text>
          </View>
          <Text style={[styles.scoreLabel, { color: getScoreColor(session.healthScore) }]}>
            {getScoreLabel(session.healthScore)}
          </Text>
        </View>
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
        <View style={styles.progressCard}>
          <Text style={styles.progressTitle}>Running Diagnostics...</Text>
          <Text style={styles.progressTest}>{progress.testName}</Text>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%' }]} />
          </View>
          <Text style={styles.progressCount}>{progress.current} / {progress.total}</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.runButton} onPress={runFullDiagnostic}>
          <Ionicons name="play-circle" size={20} color="#FFF" />
          <Text style={styles.runButtonText}>Run Full Diagnostic</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionTitle}>Categories</Text>
      <View style={styles.categoryGrid}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={styles.categoryCard}
            onPress={() => navigation.navigate('DiagnosticsTab', { screen: 'DiagnosticsList', params: { category: cat.id, title: cat.name } })}
          >
            <Ionicons name={cat.icon as any} size={28} color="#4CAF50" />
            <Text style={styles.categoryName}>{cat.name}</Text>
            <Text style={styles.categoryDesc} numberOfLines={2}>{cat.description}</Text>
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
              <View style={{ flex: 1 }}>
                <Text style={styles.historyDate}>{new Date(s.timestamp).toLocaleDateString()}</Text>
                <Text style={styles.historyDevice}>{s.deviceModel || 'Unknown device'}</Text>
              </View>
              <Text style={[styles.historyScore, { color: getScoreColor(s.healthScore) }]}>{s.healthScore}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  contentContainer: { padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  loadingText: { color: '#888', marginTop: 12, fontSize: 14 },
  deviceCard: { backgroundColor: '#1E1E2E', marginBottom: 12, padding: 16, borderRadius: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', marginLeft: 8 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  infoLabel: { color: '#888', fontSize: 13 },
  infoValue: { color: '#DDD', fontSize: 13, fontWeight: '500' },
  scoreCard: { backgroundColor: '#1E1E2E', marginBottom: 12, padding: 16, borderRadius: 12, alignItems: 'center' },
  scoreCircle: { width: 100, height: 100, borderRadius: 50, borderWidth: 4, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  scoreNumber: { fontSize: 32, fontWeight: '700' },
  scoreMax: { color: '#666', fontSize: 12 },
  scoreLabel: { fontSize: 16, fontWeight: '600' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  statusText: { fontSize: 16, fontWeight: '700', marginLeft: 6 },
  progressCard: { backgroundColor: '#1E1E2E', marginBottom: 16, padding: 16, borderRadius: 12 },
  progressTitle: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  progressTest: { color: '#AAA', fontSize: 13, marginBottom: 12 },
  progressBarBg: { height: 6, borderRadius: 3, backgroundColor: '#333', overflow: 'hidden' },
  progressBarFill: { height: 6, borderRadius: 3, backgroundColor: '#4CAF50' },
  progressCount: { color: '#888', fontSize: 12, textAlign: 'right', marginTop: 8 },
  runButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#4CAF50', marginBottom: 20, padding: 14, borderRadius: 12 },
  runButtonText: { color: '#FFF', fontSize: 15, fontWeight: '600', marginLeft: 8 },
  sectionTitle: { color: '#AAA', fontSize: 14, fontWeight: '600', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
  categoryCard: { backgroundColor: '#1E1E2E', borderRadius: 12, padding: 16, width: '48%', marginBottom: 12, alignItems: 'center', minHeight: 110 },
  categoryName: { color: '#FFF', fontSize: 14, fontWeight: '600', marginTop: 8 },
  categoryDesc: { color: '#888', fontSize: 11, textAlign: 'center', marginTop: 4 },
  historyItem: { backgroundColor: '#1E1E2E', borderRadius: 10, padding: 14, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyDate: { color: '#AAA', fontSize: 12 },
  historyDevice: { color: '#DDD', fontSize: 14, marginTop: 2 },
  historyScore: { fontSize: 22, fontWeight: '700', marginLeft: 12 },
});
