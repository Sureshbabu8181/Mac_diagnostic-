import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Button, TextInput } from 'react-native-paper';
import { documentDirectory, getInfoAsync, readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';

import { DEFAULT_CONFIG } from '../../config/diagnostics';
import { Database } from '../../database/Database';
import type { ThresholdConfig } from '../../types';

const db = Database.getInstance();
const SETTINGS_PATH = (documentDirectory ?? '') + 'settings.json';

interface StoredSettings {
  technicianPin?: string;
  technicianMode?: boolean;
}

export default function SettingsScreen() {
  const [thresholds, setThresholds] = useState<ThresholdConfig>(DEFAULT_CONFIG.thresholds);
  const [technicianMode, setTechnicianMode] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [savedPin, setSavedPin] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const info = await getInfoAsync(SETTINGS_PATH);
      if (info.exists) {
        const raw = await readAsStringAsync(SETTINGS_PATH);
        const data: StoredSettings = JSON.parse(raw);
        setSavedPin(data.technicianPin ?? null);
        setTechnicianMode(data.technicianMode ?? false);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const saveSettings = async (data: StoredSettings) => {
    try {
      await writeAsStringAsync(SETTINGS_PATH, JSON.stringify(data));
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  const updateThreshold = async (key: keyof ThresholdConfig, value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num)) return;
    setThresholds((prev) => ({ ...prev, [key]: num }));
  };

  const toggleTechnicianMode = () => {
    if (technicianMode) {
      setTechnicianMode(false);
      saveSettings({ technicianMode: false });
      return;
    }

    if (!savedPin) {
      setShowPinModal(true);
      return;
    }

    Alert.alert(
      'Technician Mode',
      'PIN verification required. Set a PIN first if you haven\'t.'
    );
  };

  const clearAllData = () => {
    Alert.alert(
      'Clear All Data',
      'This will delete all diagnostic sessions and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await db.deleteAllSessions();
              Alert.alert('Done', 'All data has been cleared.');
            } catch (err) {
              console.error('Clear failed:', err);
            }
          },
        },
      ]
    );
  };

  const thresholdFields: { key: keyof ThresholdConfig; label: string; unit: string }[] = [
    { key: 'storageWarning', label: 'Storage Warning', unit: '%' },
    { key: 'storageCritical', label: 'Storage Critical', unit: '%' },
    { key: 'batteryTemperatureWarning', label: 'Battery Temp Warning', unit: '°C' },
    { key: 'batteryTemperatureCritical', label: 'Battery Temp Critical', unit: '°C' },
    { key: 'memoryWarning', label: 'Memory Warning', unit: '%' },
    { key: 'memoryCritical', label: 'Memory Critical', unit: '%' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.sectionTitle}>Thresholds</Text>
      <Card style={styles.card}>
        <Card.Content>
          {thresholdFields.map((field) => (
            <View key={field.key} style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{field.label}</Text>
              <View style={styles.fieldInput}>
                <TextInput
                  value={String(thresholds[field.key])}
                  onChangeText={(v) => updateThreshold(field.key, v)}
                  keyboardType="numeric"
                  mode="outlined"
                  dense
                  style={styles.numberInput}
                  textColor="#DDD"
                  outlineColor="#333"
                  activeOutlineColor="#4CAF50"
                />
                <Text style={styles.fieldUnit}>{field.unit}</Text>
              </View>
            </View>
          ))}
        </Card.Content>
      </Card>

      <Text style={styles.sectionTitle}>Technician Mode</Text>
      <Card style={styles.card}>
        <Card.Content style={styles.switchRow}>
          <View style={styles.switchInfo}>
            <Ionicons name="construct-outline" size={20} color="#FF9800" />
            <View style={styles.switchText}>
              <Text style={styles.switchLabel}>Technician Mode</Text>
              <Text style={styles.switchDesc}>Enable advanced diagnostic options</Text>
            </View>
          </View>
          <Switch
            value={technicianMode}
            onValueChange={toggleTechnicianMode}
            trackColor={{ false: '#333', true: '#4CAF5050' }}
            thumbColor={technicianMode ? '#4CAF50' : '#888'}
          />
        </Card.Content>
      </Card>

      <Text style={styles.sectionTitle}>About</Text>
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>App Name</Text>
            <Text style={styles.aboutValue}>Device Diagnostic</Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Version</Text>
            <Text style={styles.aboutValue}>1.0.0</Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Engine</Text>
            <Text style={styles.aboutValue}>DiagnosticEngine v1</Text>
          </View>
        </Card.Content>
      </Card>

      <Text style={styles.sectionTitle}>Privacy</Text>
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.privacyText}>
            All diagnostic data is stored locally on your device. No data is
            transmitted to external servers. You can clear all data at any time
            using the button below.
          </Text>
        </Card.Content>
      </Card>

      <Text style={styles.sectionTitle}>Data Management</Text>
      <Button
        mode="outlined"
        onPress={clearAllData}
        style={styles.dangerButton}
        textColor="#F44336"
        icon="trash-outline"
      >
        Clear All Data
      </Button>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  contentContainer: { padding: 16 },
  sectionTitle: {
    color: '#AAA',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: { backgroundColor: '#1E1E2E', marginBottom: 16, borderRadius: 12 },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A3A',
  },
  fieldLabel: { color: '#DDD', fontSize: 13, flex: 1 },
  fieldInput: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  numberInput: { width: 60, backgroundColor: 'transparent', height: 36 },
  fieldUnit: { color: '#888', fontSize: 12, width: 30 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  switchText: { flex: 1 },
  switchLabel: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  switchDesc: { color: '#888', fontSize: 12, marginTop: 2 },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A3A',
  },
  aboutLabel: { color: '#888', fontSize: 13 },
  aboutValue: { color: '#DDD', fontSize: 13, fontWeight: '500' },
  privacyText: { color: '#AAA', fontSize: 13, lineHeight: 20 },
  dangerButton: { borderColor: '#F44336', borderRadius: 12 },
  bottomPadding: { height: 32 },
});
