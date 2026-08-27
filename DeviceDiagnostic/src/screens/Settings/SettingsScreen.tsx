import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

  const updateThreshold = (key: keyof ThresholdConfig, value: string) => {
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
    Alert.alert('Technician Mode', 'PIN verification required. Set a PIN first if you haven\'t.');
  };

  const clearAllData = () => {
    Alert.alert('Clear All Data', 'This will delete all diagnostic sessions.', [
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
    ]);
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Thresholds</Text>
      <View style={styles.card}>
        {thresholdFields.map((field) => (
          <View key={field.key} style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <View style={styles.fieldInput}>
              <TextInput
                value={String(thresholds[field.key])}
                onChangeText={(v) => updateThreshold(field.key, v)}
                keyboardType="numeric"
                style={styles.numberInput}
                placeholderTextColor="#666"
              />
              <Text style={styles.fieldUnit}>{field.unit}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Technician Mode</Text>
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.switchInfo}>
            <Ionicons name="construct-outline" size={20} color="#FF9800" />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.switchLabel}>Technician Mode</Text>
              <Text style={styles.switchDesc}>Advanced diagnostic options</Text>
            </View>
          </View>
          <Switch
            value={technicianMode}
            onValueChange={toggleTechnicianMode}
            trackColor={{ false: '#333', true: '#4CAF5050' }}
            thumbColor={technicianMode ? '#4CAF50' : '#888'}
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.card}>
        <View style={styles.aboutRow}><Text style={styles.aboutLabel}>App</Text><Text style={styles.aboutValue}>MAC Diagnostic Center</Text></View>
        <View style={styles.aboutRow}><Text style={styles.aboutLabel}>Version</Text><Text style={styles.aboutValue}>1.0.0</Text></View>
      </View>

      <Text style={styles.sectionTitle}>Privacy</Text>
      <View style={styles.card}>
        <Text style={styles.privacyText}>
          All diagnostic data is stored locally on your device. No data is transmitted to external servers.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Data Management</Text>
      <TouchableOpacity style={styles.dangerButton} onPress={clearAllData}>
        <Ionicons name="trash-outline" size={18} color="#F44336" />
        <Text style={styles.dangerButtonText}>Clear All Data</Text>
      </TouchableOpacity>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  content: { padding: 16, paddingBottom: 80 },
  sectionTitle: { color: '#AAA', fontSize: 14, fontWeight: '600', marginBottom: 10, marginTop: 8, textTransform: 'uppercase', letterSpacing: 1 },
  card: { backgroundColor: '#1E1E2E', marginBottom: 16, padding: 16, borderRadius: 12 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2A2A3A' },
  fieldLabel: { color: '#DDD', fontSize: 13, flex: 1 },
  fieldInput: { flexDirection: 'row', alignItems: 'center' },
  numberInput: { width: 60, backgroundColor: '#2A2A3E', borderRadius: 8, padding: 6, color: '#FFF', fontSize: 14, textAlign: 'center' },
  fieldUnit: { color: '#888', fontSize: 12, marginLeft: 6, width: 30 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  switchLabel: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  switchDesc: { color: '#888', fontSize: 12, marginTop: 2 },
  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2A2A3A' },
  aboutLabel: { color: '#888', fontSize: 13 },
  aboutValue: { color: '#DDD', fontSize: 13, fontWeight: '500' },
  privacyText: { color: '#AAA', fontSize: 13, lineHeight: 20 },
  dangerButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4433620', padding: 14, borderRadius: 12, marginTop: 4 },
  dangerButtonText: { color: '#F44336', fontSize: 15, fontWeight: '600', marginLeft: 8 },
});
