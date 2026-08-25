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
import { useFocusEffect } from '@react-navigation/native';

import { Database } from '../../database/Database';
import { ScoringEngine } from '../../core/ScoringEngine';
import { ReportGenerator } from '../../core/ReportGenerator';
import type { DiagnosticSession } from '../../types';

const db = Database.getInstance();
const scoring = new ScoringEngine();
const reportGen = new ReportGenerator();

export default function ReportsScreen() {
  const [latestSession, setLatestSession] = useState<DiagnosticSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const sessions = await db.getSessions();
      if (sessions.length > 0) {
        setLatestSession(sessions[0]);
      }
    } catch (err) {
      console.error('Failed to load report data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const shareReport = async () => {
    if (!latestSession) {
      Alert.alert('No Data', 'Run a diagnostic first to generate a report.');
      return;
    }
    setSharing(true);
    try {
      await reportGen.shareReport(latestSession);
    } catch (err) {
      console.error('Share failed:', err);
    } finally {
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {latestSession ? (
        <>
          <Text style={styles.sectionTitle}>Latest Session Summary</Text>
          <View style={styles.card}>
            <View style={styles.row}><Text style={styles.label}>Date</Text><Text style={styles.value}>{new Date(latestSession.timestamp).toLocaleDateString()}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Device</Text><Text style={styles.value}>{latestSession.deviceModel || 'Unknown'}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Tests</Text><Text style={styles.value}>{latestSession.results.length}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Duration</Text><Text style={styles.value}>{(latestSession.duration / 1000).toFixed(1)}s</Text></View>
            <View style={styles.row}><Text style={styles.label}>Score</Text><Text style={[styles.value, { color: scoring.getScoreColor(latestSession.healthScore) }]}>{latestSession.healthScore}/100</Text></View>
          </View>

          <TouchableOpacity style={styles.shareButton} onPress={shareReport} disabled={sharing}>
            {sharing ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="share-outline" size={18} color="#FFF" />}
            <Text style={styles.shareButtonText}>{sharing ? 'Sharing...' : 'Share Report'}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={64} color="#444" />
          <Text style={styles.emptyTitle}>No Sessions Available</Text>
          <Text style={styles.emptySubtitle}>Run a diagnostic first to generate reports</Text>
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
  sectionTitle: { color: '#AAA', fontSize: 14, fontWeight: '600', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  card: { backgroundColor: '#1E1E2E', marginBottom: 16, padding: 16, borderRadius: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2A2A3A' },
  label: { color: '#888', fontSize: 14 },
  value: { color: '#DDD', fontSize: 14, fontWeight: '600' },
  shareButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#4CAF50', padding: 14, borderRadius: 12, marginBottom: 16 },
  shareButtonText: { color: '#FFF', fontSize: 15, fontWeight: '600', marginLeft: 8 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { color: '#888', fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptySubtitle: { color: '#666', fontSize: 14, marginTop: 8 },
});
