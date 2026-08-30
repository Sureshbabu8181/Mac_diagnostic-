import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  PixelRatio,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Device from 'expo-device';
import * as Battery from 'expo-battery';
import Constants from 'expo-constants';
import { getFreeDiskStorageAsync, getTotalDiskCapacityAsync } from 'expo-file-system/legacy';

type RowData = { label: string; value: string };

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return 'Unknown';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

function formatBytesRatio(used: number, total: number): string {
  if (!total) return 'Unknown';
  const pct = (used / total) * 100;
  return `${formatBytes(used)} of ${formatBytes(total)} (${pct.toFixed(0)}%)`;
}

export default function DeviceDetailsScreen() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<{ [key: string]: RowData[] }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { width, height } = Dimensions.get('window');
        const density = PixelRatio.get();
        const totalMemory = Device.totalMemory;
        const totalStorage = await getTotalDiskCapacityAsync().catch(() => null);
        const freeStorage = await getFreeDiskStorageAsync().catch(() => null);
        const usedStorage = totalStorage !== null && freeStorage !== null ? totalStorage - freeStorage : null;

        const appVersion = (Constants.expoConfig?.version as string) ?? 'Unknown';
        const screenW = `${width} px`;
        const screenH = `${height} px`;

        setRows({
          device: [
            { label: 'Model', value: Device.modelName ?? 'Unknown' },
            { label: 'Manufacturer', value: Device.manufacturer ?? 'Unknown' },
            { label: 'Brand', value: Device.brand ?? 'Unknown' },
            { label: 'Device Name', value: Device.deviceName ?? 'Unknown' },
            { label: 'Device Type', value: String(Device.deviceType ?? 'Unknown') },
            { label: 'Is Physical Device', value: Device.isDevice ? 'Yes' : 'No (Emulator)' },
          ],
          system: [
            { label: 'Operating System', value: Device.osName ?? (Platform.OS === 'android' ? 'Android' : 'iOS') },
            { label: 'OS Version', value: Device.osVersion ?? 'Unknown' },
            { label: 'Android API Level', value: Device.platformApiLevel ? String(Device.platformApiLevel) : 'Unknown' },
            { label: 'Build ID', value: Device.osBuildId ?? 'Unknown' },
            { label: 'Build Fingerprint', value: Device.osBuildFingerprint ? Device.osBuildFingerprint.slice(-24) : 'Unknown' },
            { label: 'CPU Architectures', value: (Device.supportedCpuArchitectures ?? []).join(', ') || 'Unknown' },
            { label: 'Year Class', value: Device.deviceYearClass ? String(Device.deviceYearClass) : 'Unknown' },
          ],
          memory: [
            { label: 'Total RAM', value: formatBytes(totalMemory) },
            { label: 'Total Storage', value: formatBytes(totalStorage) },
            { label: 'Free Storage', value: formatBytes(freeStorage) },
            { label: 'Used Storage', value: formatBytesRatio(usedStorage ?? 0, totalStorage ?? 0) },
            { label: 'Pixel Density', value: `${density.toFixed(2)}x` },
          ],
          display: [
            { label: 'Screen Size', value: `${screenW} x ${screenH}` },
            { label: 'Resolution (logical)', value: `${width} x ${height} dp` },
          ],
          app: [
            { label: 'App Version', value: appVersion },
            { label: 'App Name', value: Constants.expoConfig?.name ?? 'Unknown' },
            { label: 'Native Runtime', value: Constants.expoConfig?.runtimeVersion ? String(Constants.expoConfig.runtimeVersion) : 'Unknown' },
          ],
        });
      } catch (err) {
        console.error('Failed to load device details:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const batteryRows = async (): Promise<RowData[]> => {
    try {
      const level = await Battery.getBatteryLevelAsync();
      const levelPct = Math.round((level ?? 0) * 100);
      const state = await Battery.getBatteryStateAsync();
      const states: Record<number, string> = {
        [Battery.BatteryState.UNKNOWN]: 'Unknown',
        [Battery.BatteryState.UNPLUGGED]: 'Unplugged (on battery)',
        [Battery.BatteryState.CHARGING]: 'Charging',
        [Battery.BatteryState.FULL]: 'Full',
      };
      return [
        { label: 'Level', value: `${levelPct}%` },
        { label: 'State', value: states[state] ?? 'Unknown' },
      ];
    } catch {
      return [{ label: 'Level', value: 'Unknown' }];
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Gathering device details...</Text>
      </View>
    );
  }

  const sections: { key: string; title: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'device', title: 'Device', icon: 'phone-portrait-outline' },
    { key: 'system', title: 'System', icon: 'hardware-chip-outline' },
    { key: 'memory', title: 'Storage & Memory', icon: 'server-outline' },
    { key: 'display', title: 'Display', icon: 'phone-landscape-outline' },
    { key: 'app', title: 'Application', icon: 'apps-outline' },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      {sections.map((section) => (
        <View key={section.key} style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name={section.icon} size={18} color="#4CAF50" />
            <Text style={styles.cardTitle}>{section.title}</Text>
          </View>
          {(rows[section.key] ?? []).map((row, idx) => (
            <View key={idx} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{row.label}</Text>
              <Text style={[styles.infoValue, { flexShrink: 1, textAlign: 'right' }]}>{row.value}</Text>
            </View>
          ))}
        </View>
      ))}

      <DeviceBatteryCard batteryRows={batteryRows} />
    </ScrollView>
  );
}

function DeviceBatteryCard({ batteryRows }: { batteryRows: () => Promise<RowData[]> }) {
  const [rows, setRows] = useState<RowData[]>([]);
  useEffect(() => {
    batteryRows().then((r) => setRows(r));
  }, [batteryRows]);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="battery-half-outline" size={18} color="#4CAF50" />
        <Text style={styles.cardTitle}>Battery</Text>
      </View>
      {rows.map((row, idx) => (
        <View key={idx} style={styles.infoRow}>
          <Text style={styles.infoLabel}>{row.label}</Text>
          <Text style={styles.infoValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  content: { padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  loadingText: { color: '#888', marginTop: 12, fontSize: 14 },
  card: { backgroundColor: '#1E1E2E', marginBottom: 12, padding: 16, borderRadius: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cardTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', marginLeft: 8 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  infoLabel: { color: '#888', fontSize: 13, marginRight: 16 },
  infoValue: { color: '#DDD', fontSize: 13, fontWeight: '500' },
});
