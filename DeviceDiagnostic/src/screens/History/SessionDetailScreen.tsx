import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useFocusEffect } from '@react-navigation/native';

import { Database } from '../../database/Database';
import { ScoringEngine } from '../../core/ScoringEngine';
import { ReportGenerator } from '../../core/ReportGenerator';
import type { DiagnosticSession, DiagnosticResult } from '../../types';

const db = Database.getInstance();
const scoring = new ScoringEngine();
const reportGen = new ReportGenerator();

const STATUS_COLORS: Record<string, string> = {
  PASS: '#4CAF50',
  WARNING: '#FF9800',
  FAIL: '#F44336',
  NOT_SUPPORTED: '#666',
  NOT_TESTED: '#444',
};

export default function SessionDetailScreen() {
  const route = useRoute<any>();
  const sessionId = (route.params?.sessionId as string) ?? '';

  const [session, setSession] = useState<DiagnosticSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadSession();
    }, [sessionId])
  );

  const loadSession = async () => {
    if (!sessionId) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await db.getSession(sessionId);
      setSession(data);
    } catch (err) {
      console.error('Failed to load session:', err);
    } finally {
      setLoading(false);
    }
  };

  const shareReport = async () => {
    if (!session) return;
    setSharing(true);
    try {
      await reportGen.shareReport(session);
    } catch (err) {
      console.error('Share failed:', err);
    } finally {
      setSharing(false);
    }
  };

  const deleteSession = async () => {
    if (!session) return;
    Alert.alert('Delete Session', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await db.deleteSession(session.id);
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: '#888', fontSize: 16 }}>Session not found</Text>
      </View>
    );
  }

  const scoreColor = scoring.getScoreColor(session.healthScore);
  const scoreLabel = scoring.getScoreLabel(session.healthScore);
  const counts = scoring.getStatusCounts(session.results);

  const grouped = session.results.reduce<Record<string, DiagnosticResult[]>>((acc, r) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push(r);
    return acc;
  }, {});

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Device Information</Text>
        <View style={styles.infoRow}><Text style={styles.infoLabel}>Model</Text><Text style={styles.infoValue}>{session.deviceModel || 'Unknown'}</Text></View>
        <View style={styles.infoRow}><Text style={styles.infoLabel}>OS</Text><Text style={styles.infoValue}>{session.osVersion || 'Unknown'}</Text></View>
        <View style={styles.infoRow}><Text style={styles.infoLabel}>Date</Text><Text style={styles.infoValue}>{new Date(session.timestamp).toLocaleString()}</Text></View>
        <View style={styles.infoRow}><Text style={styles.infoLabel}>Duration</Text><Text style={styles.infoValue}>{(session.duration / 1000).toFixed(1)}s</Text></View>
      </View>

      <View style={styles.scoreCard}>
        <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
          <Text style={[styles.scoreNumber, { color: scoreColor }]}>{session.healthScore}</Text>
        </View>
        <Text style={[styles.scoreLabel, { color: scoreColor }]}>{scoreLabel}</Text>
      </View>

      <View style={styles.countsRow}>
        <View style={[styles.countBadge, { backgroundColor: '#4CAF5020' }]}>
          <Text style={[styles.countNumber, { color: '#4CAF50' }]}>{counts.pass}</Text>
          <Text style={styles.countLabel}>Pass</Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: '#FF980020' }]}>
          <Text style={[styles.countNumber, { color: '#FF9800' }]}>{counts.warning}</Text>
          <Text style={styles.countLabel}>Warning</Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: '#F4433620' }]}>
          <Text style={[styles.countNumber, { color: '#F44336' }]}>{counts.fail}</Text>
          <Text style={styles.countLabel}>Fail</Text>
        </View>
      </View>

      {Object.entries(grouped).map(([category, results]) => (
        <View key={category} style={styles.card}>
          <Text style={styles.categoryTitle}>{category.toUpperCase()}</Text>
          {results.map((result) => {
            const color = STATUS_COLORS[result.status] ?? '#444';
            return (
              <View key={result.testId} style={styles.resultRow}>
                <View style={[styles.resultDot, { backgroundColor: color }]} />
                <View style={styles.resultInfo}>
                  <Text style={styles.resultName}>{result.testName}</Text>
                  <Text style={styles.resultMessage} numberOfLines={1}>{result.message}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: color + '20' }]}>
                  <Text style={[styles.badgeText, { color }]}>{result.status.replace('_', ' ')}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ))}

      <TouchableOpacity style={styles.shareButton} onPress={shareReport} disabled={sharing}>
        {sharing ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="share-outline" size={18} color="#FFF" />}
        <Text style={styles.shareButtonText}>{sharing ? 'Sharing...' : 'Share Report'}</Text>
      </TouchableOpacity>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  content: { padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  card: { backgroundColor: '#1E1E2E', marginBottom: 12, padding: 16, borderRadius: 12 },
  cardTitle: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#2A2A3A' },
  infoLabel: { color: '#888', fontSize: 13 },
  infoValue: { color: '#DDD', fontSize: 13, fontWeight: '500' },
  scoreCard: { alignItems: 'center', backgroundColor: '#1E1E2E', marginBottom: 12, padding: 16, borderRadius: 12 },
  scoreCircle: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  scoreNumber: { fontSize: 28, fontWeight: '700' },
  scoreLabel: { fontSize: 15, fontWeight: '600' },
  countsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  countBadge: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  countNumber: { fontSize: 20, fontWeight: '700' },
  countLabel: { color: '#888', fontSize: 11, marginTop: 2 },
  categoryTitle: { color: '#AAA', fontSize: 13, fontWeight: '600', marginBottom: 10, letterSpacing: 1 },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2A2A3A' },
  resultDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  resultInfo: { flex: 1 },
  resultName: { color: '#FFF', fontSize: 13, fontWeight: '500' },
  resultMessage: { color: '#888', fontSize: 11, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  shareButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2196F3', padding: 14, borderRadius: 12, marginTop: 8 },
  shareButtonText: { color: '#FFF', fontSize: 15, fontWeight: '600', marginLeft: 8 },
});
