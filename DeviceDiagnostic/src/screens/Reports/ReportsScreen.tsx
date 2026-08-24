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
import { Card, Button } from 'react-native-paper';
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
  const [generating, setGenerating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [reportHistory, setReportHistory] = useState<string[]>([]);

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

  const generateReport = async () => {
    if (!latestSession) {
      Alert.alert('No Data', 'Run a diagnostic first to generate a report.');
      return;
    }
    setGenerating(true);
    try {
      await reportGen.shareReport(latestSession);
      Alert.alert('Report Shared', 'The report has been shared successfully.');
    } catch (err) {
      console.error('Report generation failed:', err);
      Alert.alert('Error', 'Failed to generate report.');
    } finally {
      setGenerating(false);
    }
  };

  const shareReport = async () => {
    if (!latestSession) return;
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
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {latestSession ? (
        <>
          <Text style={styles.sectionTitle}>Latest Session Summary</Text>
          <Card style={styles.summaryCard}>
            <Card.Content>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Date</Text>
                <Text style={styles.summaryValue}>
                  {new Date(latestSession.timestamp).toLocaleDateString()}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Device</Text>
                <Text style={styles.summaryValue}>
                  {latestSession.deviceModel || 'Unknown'}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Tests Run</Text>
                <Text style={styles.summaryValue}>{latestSession.results.length}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Duration</Text>
                <Text style={styles.summaryValue}>
                  {(latestSession.duration / 1000).toFixed(1)}s
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Health Score</Text>
                <Text
                  style={[
                    styles.summaryValue,
                    { color: scoring.getScoreColor(latestSession.healthScore) },
                  ]}
                >
                  {latestSession.healthScore}/100
                </Text>
              </View>
            </Card.Content>
          </Card>

          <View style={styles.actions}>
            <Button
              mode="contained"
              onPress={generateReport}
              loading={generating}
              disabled={generating}
              style={styles.actionButton}
              buttonColor="#4CAF50"
              icon="document-text-outline"
              labelStyle={styles.actionButtonLabel}
            >
              Generate Report
            </Button>
            <Button
              mode="contained"
              onPress={shareReport}
              loading={sharing}
              disabled={sharing}
              style={styles.actionButton}
              buttonColor="#2196F3"
              icon="share-outline"
              labelStyle={styles.actionButtonLabel}
            >
              Share Report
            </Button>
          </View>
        </>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={64} color="#444" />
          <Text style={styles.emptyTitle}>No Sessions Available</Text>
          <Text style={styles.emptySubtitle}>
            Run a diagnostic first to generate reports
          </Text>
        </View>
      )}

      {reportHistory.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Generated Reports</Text>
          {reportHistory.map((path, index) => (
            <View key={index} style={styles.reportItem}>
              <Ionicons name="document-outline" size={20} color="#4CAF50" />
              <Text style={styles.reportPath} numberOfLines={1}>
                {path.split('/').pop()}
              </Text>
            </View>
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
  sectionTitle: {
    color: '#AAA',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  summaryCard: { backgroundColor: '#1E1E2E', marginBottom: 16, borderRadius: 12 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A3A',
  },
  summaryLabel: { color: '#888', fontSize: 14 },
  summaryValue: { color: '#DDD', fontSize: 14, fontWeight: '600' },
  actions: { gap: 12, marginBottom: 24 },
  actionButton: { borderRadius: 12, paddingVertical: 4 },
  actionButtonLabel: { fontSize: 14, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { color: '#888', fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptySubtitle: { color: '#666', fontSize: 14, marginTop: 8 },
  reportItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E2E',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    gap: 10,
  },
  reportPath: { color: '#AAA', fontSize: 13, flex: 1 },
  bottomPadding: { height: 32 },
});
