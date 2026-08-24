import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from 'react-native-paper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Database } from '../../database/Database';
import { ScoringEngine } from '../../core/ScoringEngine';
import type { DiagnosticSession } from '../../types';

type RootStackParamList = {
  History: undefined;
  SessionDetail: { sessionId: string };
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const db = Database.getInstance();
const scoring = new ScoringEngine();

export default function HistoryScreen() {
  const navigation = useNavigation<NavigationProp>();

  const [sessions, setSessions] = useState<DiagnosticSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await db.getSessions();
      setSessions(data);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [loadSessions])
  );

  const deleteSession = async (id: string) => {
    setDeleting(id);
    try {
      await db.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Failed to delete session:', err);
    } finally {
      setDeleting(null);
    }
  };

  const deleteAll = async () => {
    try {
      await db.deleteAllSessions();
      setSessions([]);
    } catch (err) {
      console.error('Failed to delete all sessions:', err);
    }
  };

  const renderSession = ({ item }: { item: DiagnosticSession }) => {
    const scoreColor = scoring.getScoreColor(item.healthScore);
    const isDeleting = deleting === item.id;

    return (
      <TouchableOpacity
        style={styles.sessionCard}
        onPress={() => navigation.navigate('SessionDetail', { sessionId: item.id })}
        disabled={isDeleting}
      >
        <View style={styles.sessionLeft}>
          <Text style={styles.sessionDate}>
            {new Date(item.timestamp).toLocaleDateString()}{' '}
            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <Text style={styles.sessionDevice}>
            {item.deviceModel || 'Unknown device'}
          </Text>
          <Text style={styles.sessionDuration}>
            {(item.duration / 1000).toFixed(1)}s · {item.results.length} tests
          </Text>
        </View>
        <View style={styles.sessionRight}>
          <Text style={[styles.sessionScore, { color: scoreColor }]}>
            {item.healthScore}
          </Text>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => deleteSession(item.id)}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color="#F44336" />
            ) : (
              <Ionicons name="trash-outline" size={18} color="#F44336" />
            )}
          </TouchableOpacity>
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
      {sessions.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={64} color="#444" />
          <Text style={styles.emptyTitle}>No History Yet</Text>
          <Text style={styles.emptySubtitle}>
            Run a diagnostic to see results here
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {sessions.length} session{sessions.length !== 1 ? 's' : ''}
            </Text>
            <TouchableOpacity style={styles.clearAllButton} onPress={deleteAll}>
              <Ionicons name="trash" size={16} color="#F44336" />
              <Text style={styles.clearAllText}>Clear All</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={sessions}
            renderItem={renderSession}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
  },
  headerTitle: { color: '#AAA', fontSize: 14, fontWeight: '500' },
  clearAllButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  clearAllText: { color: '#F44336', fontSize: 13, fontWeight: '500' },
  listContent: { padding: 16, paddingTop: 8 },
  sessionCard: {
    backgroundColor: '#1E1E2E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sessionLeft: { flex: 1 },
  sessionDate: { color: '#AAA', fontSize: 12 },
  sessionDevice: { color: '#FFF', fontSize: 16, fontWeight: '600', marginTop: 4 },
  sessionDuration: { color: '#888', fontSize: 12, marginTop: 4 },
  sessionRight: { alignItems: 'flex-end', marginLeft: 12 },
  sessionScore: { fontSize: 26, fontWeight: '700' },
  deleteButton: { marginTop: 8, padding: 4 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { color: '#888', fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptySubtitle: { color: '#666', fontSize: 14, marginTop: 8 },
});
