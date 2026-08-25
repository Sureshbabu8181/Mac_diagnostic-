import React, { useState, useEffect, useCallback } from 'react';
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
import { Card, Button, Chip } from 'react-native-paper';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import { Database } from '../../database/Database';
import { ScoringEngine } from '../../core/ScoringEngine';
import { ReportGenerator } from '../../core/ReportGenerator';
import type { DiagnosticSession, DiagnosticResult, DiagnosticStatus } from '../../types';

type RootStackParamList = {
  SessionDetail: { sessionId: string };
};

type RouteProps = RouteProp<RootStackParamList, 'SessionDetail'>;

const db = Database.getInstance();
const scoring = new ScoringEngine();
const reportGen = new ReportGenerator();

const STATUS_COLORS: Record<DiagnosticStatus, string> = {
  PASS: '#4CAF50',
  WARNING: '#FF9800',
  FAIL: '#F44336',
  NOT_SUPPORTED: '#666',
  NOT_TESTED: '#444',
};

const STATUS_ICONS: Record<DiagnosticStatus, string> = {
  PASS: 'checkmark-circle',
  WARNING: 'warning',
  FAIL: 'close-circle',
  NOT_SUPPORTED: 'remove-circle',
  NOT_TESTED: 'help-circle',
};

export default function SessionDetailScreen() {
  const route = useRoute<any>();
  const sessionId = (route.params?.sessionId as string) ?? '';

  const [session, setSession] = useState<DiagnosticSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadSession();
    }, [sessionId])
  );

  const loadSession = async () => {
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
    Alert.alert('Delete Session', 'Are you sure you want to delete this session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await db.deleteSession(session.id);
          } catch (err) {
            console.error('Delete failed:', err);
          } finally {
            setDeleting(false);
          }
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
        <Text style={styles.errorText}>Session not found</Text>
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
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Card style={styles.deviceCard}>
        <Card.Content>
          <Text style={styles.cardTitle}>Device Information</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Model</Text>
            <Text style={styles.infoValue}>{session.deviceModel || 'Unknown'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Manufacturer</Text>
            <Text style={styles.infoValue}>{session.deviceManufacturer || 'Unknown'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>OS Version</Text>
            <Text style={styles.infoValue}>{session.osVersion || 'Unknown'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Date</Text>
            <Text style={styles.infoValue}>
              {new Date(session.timestamp).toLocaleString()}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Duration</Text>
            <Text style={styles.infoValue}>{(session.duration / 1000).toFixed(1)}s</Text>
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.scoreCard}>
        <Card.Content style={styles.scoreContent}>
          <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
            <Text style={[styles.scoreNumber, { color: scoreColor }]}>
              {session.healthScore}
            </Text>
          </View>
          <Text style={[styles.scoreLabel, { color: scoreColor }]}>{scoreLabel}</Text>
        </Card.Content>
      </Card>

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
        <Card key={category} style={styles.categoryCard}>
          <Card.Content>
            <Text style={styles.categoryTitle}>{category.toUpperCase()}</Text>
            {results.map((result) => {
              const color = STATUS_COLORS[result.status];
              const iconName = (STATUS_ICONS[result.status] ?? 'help-circle') as any;
              return (
                <View key={result.testId} style={styles.resultRow}>
                  <Ionicons name={iconName} size={18} color={color} />
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultName}>{result.testName}</Text>
                    <Text style={styles.resultMessage} numberOfLines={1}>
                      {result.message}
                    </Text>
                  </View>
                  <Chip
                    compact
                    style={[styles.statusChip, { backgroundColor: color + '20' }]}
                    textStyle={[styles.chipText, { color }]}
                  >
                    {result.status.replace('_', ' ')}
                  </Chip>
                </View>
              );
            })}
          </Card.Content>
        </Card>
      ))}

      <View style={styles.actions}>
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
        <Button
          mode="outlined"
          onPress={deleteSession}
          loading={deleting}
          disabled={deleting}
          style={[styles.actionButton, { borderColor: '#F44336' }]}
          textColor="#F44336"
          icon="trash-outline"
          labelStyle={styles.actionButtonLabel}
        >
          Delete
        </Button>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  contentContainer: { padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  errorText: { color: '#888', fontSize: 16 },
  deviceCard: { backgroundColor: '#1E1E2E', marginBottom: 12, borderRadius: 12 },
  cardTitle: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 12 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A3A',
  },
  infoLabel: { color: '#888', fontSize: 13 },
  infoValue: { color: '#DDD', fontSize: 13, fontWeight: '500' },
  scoreCard: { backgroundColor: '#1E1E2E', marginBottom: 12, borderRadius: 12 },
  scoreContent: { alignItems: 'center', paddingVertical: 16 },
  scoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  scoreNumber: { fontSize: 28, fontWeight: '700' },
  scoreLabel: { fontSize: 15, fontWeight: '600' },
  countsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  countBadge: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  countNumber: { fontSize: 20, fontWeight: '700' },
  countLabel: { color: '#888', fontSize: 11, marginTop: 2 },
  categoryCard: { backgroundColor: '#1E1E2E', marginBottom: 12, borderRadius: 12 },
  categoryTitle: { color: '#AAA', fontSize: 13, fontWeight: '600', marginBottom: 10, letterSpacing: 1 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A3A',
    gap: 10,
  },
  resultInfo: { flex: 1 },
  resultName: { color: '#FFF', fontSize: 13, fontWeight: '500' },
  resultMessage: { color: '#888', fontSize: 11, marginTop: 2 },
  statusChip: { height: 26 },
  chipText: { fontSize: 10, fontWeight: '600' },
  actions: { gap: 12, marginTop: 8 },
  actionButton: { borderRadius: 12, paddingVertical: 4 },
  actionButtonLabel: { fontSize: 14, fontWeight: '600' },
  bottomPadding: { height: 32 },
});
