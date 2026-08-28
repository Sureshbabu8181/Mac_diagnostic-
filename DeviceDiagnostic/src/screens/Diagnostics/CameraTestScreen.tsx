import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';

type CameraFacing = 'front' | 'back';

interface CameraInfo {
  facing: CameraFacing;
  label: string;
  status: 'WAITING' | 'WORKING' | 'DENIED' | 'ERROR';
}

export default function CameraTestScreen() {
  const navigation = useNavigation();
  const [permission, requestPermission] = useCameraPermissions();
  const [currentCamera, setCurrentCamera] = useState<CameraFacing>('back');
  const [cameras, setCameras] = useState<CameraInfo[]>([
    { facing: 'back', label: 'Back Camera', status: 'WAITING' },
    { facing: 'front', label: 'Front Camera', status: 'WAITING' },
  ]);

  const updateStatus = (facing: CameraFacing, status: CameraInfo['status']) => {
    setCameras((prev) => prev.map((c) => (c.facing === facing ? { ...c, status } : c)));
  };

  const handlePermissionRequest = async () => {
    await requestPermission();
  };

  const switchCamera = (facing: CameraFacing) => {
    setCurrentCamera(facing);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'WORKING': return '#4CAF50';
      case 'DENIED': return '#F44336';
      case 'ERROR': return '#F44336';
      default: return '#FF9800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'WORKING': return 'Working';
      case 'DENIED': return 'Denied';
      case 'ERROR': return 'Error';
      default: return 'Testing...';
    }
  };

  const allTested = cameras.every((c) => c.status !== 'WAITING');
  const workingCount = cameras.filter((c) => c.status === 'WORKING').length;

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Camera Test</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.previewArea}>
        {permission?.granted ? (
          <CameraView
            style={styles.camera}
            facing={currentCamera}
            onCameraReady={() => updateStatus(currentCamera, 'WORKING')}
            onMountError={() => updateStatus(currentCamera, 'ERROR')}
          />
        ) : (
          <View style={styles.noPermission}>
            <Ionicons name="camera-outline" size={64} color="#555" />
            <Text style={styles.noPermText}>Camera permission required</Text>
            {permission && !permission.canAskAgain && (
              <Text style={styles.noPermSub}>Enable in device Settings</Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.footer}>
        {!permission?.granted && (
          <TouchableOpacity style={styles.permissionBtn} onPress={handlePermissionRequest}>
            <Ionicons name="lock-open-outline" size={18} color="#FFF" />
            <Text style={styles.permissionBtnText}>Grant Camera Permission</Text>
          </TouchableOpacity>
        )}

        <View style={styles.cameraRow}>
          {cameras.map((cam) => (
            <TouchableOpacity
              key={cam.facing}
              style={[
                styles.cameraCard,
                currentCamera === cam.facing && permission?.granted && styles.cameraCardActive,
              ]}
              onPress={() => permission?.granted && switchCamera(cam.facing)}
            >
              <Ionicons
                name={cam.facing === 'back' ? 'camera-reverse-outline' : 'camera-outline'}
                size={24}
                color={currentCamera === cam.facing && permission?.granted ? '#FFF' : '#888'}
              />
              <Text style={[styles.cameraLabel, currentCamera === cam.facing && permission?.granted && styles.cameraLabelActive]}>
                {cam.label}
              </Text>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(cam.status) }]} />
              <Text style={[styles.statusText, { color: getStatusColor(cam.status) }]}>
                {getStatusLabel(cam.status)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {allTested && (
          <View style={[styles.summary, { backgroundColor: workingCount > 0 ? '#4CAF5015' : '#F4433615' }]}>
            <Ionicons name={workingCount > 0 ? 'checkmark-circle' : 'close-circle'} size={20} color={workingCount > 0 ? '#4CAF50' : '#F44336'} />
            <Text style={[styles.summaryText, { color: workingCount > 0 ? '#4CAF50' : '#F44336' }]}>
              {workingCount}/2 cameras working
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: '#1E1E2E',
    zIndex: 10,
  },
  backBtn: { padding: 8 },
  title: { flex: 1, color: '#FFF', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  previewArea: { flex: 1, backgroundColor: '#111' },
  camera: { flex: 1 },
  noPermission: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noPermText: { color: '#888', fontSize: 16, marginTop: 12 },
  noPermSub: { color: '#666', fontSize: 12, marginTop: 4 },
  footer: { backgroundColor: '#1E1E2E', paddingHorizontal: 16, paddingBottom: 12, paddingTop: 10 },
  permissionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#4CAF50', padding: 12, borderRadius: 10, marginBottom: 12,
  },
  permissionBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600', marginLeft: 8 },
  cameraRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  cameraCard: {
    flex: 1, backgroundColor: '#333', borderRadius: 10, padding: 12,
    alignItems: 'center', borderWidth: 2, borderColor: 'transparent',
  },
  cameraCardActive: { borderColor: '#4CAF50', backgroundColor: '#4CAF5020' },
  cameraLabel: { color: '#888', fontSize: 12, fontWeight: '600', marginTop: 6 },
  cameraLabelActive: { color: '#FFF' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  statusText: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  summary: {
    flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8,
  },
  summaryText: { fontSize: 13, fontWeight: '600', marginLeft: 8 },
});
