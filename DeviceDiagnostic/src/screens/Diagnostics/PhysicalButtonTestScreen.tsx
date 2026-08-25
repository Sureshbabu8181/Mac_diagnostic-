import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  DeviceEventEmitter,
  NativeModules,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

interface ButtonState {
  volumeUp: 'WAITING' | 'DETECTED' | 'MANUAL_PASS' | 'MANUAL_FAIL';
  volumeDown: 'WAITING' | 'DETECTED' | 'MANUAL_PASS' | 'MANUAL_FAIL';
}

export default function PhysicalButtonTestScreen() {
  const navigation = useNavigation();
  const [buttons, setButtons] = useState<ButtonState>({
    volumeUp: 'WAITING',
    volumeDown: 'WAITING',
  });
  const [autoDetectSupported, setAutoDetectSupported] = useState<boolean | null>(null);

  useEffect(() => {
    let subscription: any;
    try {
      if (NativeModules.VolumeButtonListener) {
        setAutoDetectSupported(true);
        subscription = DeviceEventEmitter.addListener('VolumeButtonPress', (event: { key: string }) => {
          if (event.key === 'volume_up') {
            setButtons((prev) => ({ ...prev, volumeUp: 'DETECTED' }));
          } else if (event.key === 'volume_down') {
            setButtons((prev) => ({ ...prev, volumeDown: 'DETECTED' }));
          }
        });
      } else {
        setAutoDetectSupported(false);
      }
    } catch {
      setAutoDetectSupported(false);
    }
    return () => {
      if (subscription) subscription.remove();
    };
  }, []);

  const getButtonColor = (state: string) => {
    switch (state) {
      case 'DETECTED': return '#4CAF50';
      case 'MANUAL_PASS': return '#4CAF50';
      case 'MANUAL_FAIL': return '#F44336';
      default: return '#FF9800';
    }
  };

  const getButtonIcon = (state: string) => {
    switch (state) {
      case 'DETECTED':
      case 'MANUAL_PASS':
        return 'checkmark-circle';
      case 'MANUAL_FAIL':
        return 'close-circle';
      default:
        return 'help-circle';
    }
  };

  const getButtonLabel = (state: string) => {
    switch (state) {
      case 'DETECTED': return 'DETECTED';
      case 'MANUAL_PASS': return 'WORKING';
      case 'MANUAL_FAIL': return 'NOT WORKING';
      default: return 'WAITING';
    }
  };

  const manualVerify = (button: 'volumeUp' | 'volumeDown', working: boolean) => {
    setButtons((prev) => ({
      ...prev,
      [button]: working ? 'MANUAL_PASS' : 'MANUAL_FAIL',
    }));
  };

  const reset = () => {
    setButtons({ volumeUp: 'WAITING', volumeDown: 'WAITING' });
  };

  const allTested = buttons.volumeUp !== 'WAITING' && buttons.volumeDown !== 'WAITING';
  const anyFail = buttons.volumeUp === 'MANUAL_FAIL' || buttons.volumeDown === 'MANUAL_FAIL';
  const anyDetected = buttons.volumeUp === 'DETECTED' || buttons.volumeDown === 'DETECTED';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>Physical Buttons Test</Text>
          <Text style={styles.subtitle}>Test Volume Up and Volume Down buttons</Text>
        </View>
      </View>

      <View style={styles.content}>
        {autoDetectSupported === false && (
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle" size={18} color="#FF9800" />
            <Text style={styles.infoText}>
              Auto-detection not available. Press each button, then verify manually.
            </Text>
          </View>
        )}

        <View style={styles.buttonCard}>
          <View style={styles.buttonHeader}>
            <Ionicons name="volume-high" size={32} color="#FFF" />
            <Text style={styles.buttonTitle}>Volume Up</Text>
          </View>
          <View style={[styles.statusRow, { backgroundColor: getButtonColor(buttons.volumeUp) + '15' }]}>
            <Ionicons name={getButtonIcon(buttons.volumeUp) as any} size={24} color={getButtonColor(buttons.volumeUp)} />
            <Text style={[styles.statusLabel, { color: getButtonColor(buttons.volumeUp) }]}>
              {getButtonLabel(buttons.volumeUp)}
            </Text>
          </View>
          {autoDetectSupported === false && buttons.volumeUp === 'WAITING' && (
            <View style={styles.manualRow}>
              <TouchableOpacity style={styles.passBtn} onPress={() => manualVerify('volumeUp', true)}>
                <Text style={styles.passBtnText}>Working</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.failBtn} onPress={() => manualVerify('volumeUp', false)}>
                <Text style={styles.failBtnText}>Not Working</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.buttonCard}>
          <View style={styles.buttonHeader}>
            <Ionicons name="volume-low" size={32} color="#FFF" />
            <Text style={styles.buttonTitle}>Volume Down</Text>
          </View>
          <View style={[styles.statusRow, { backgroundColor: getButtonColor(buttons.volumeDown) + '15' }]}>
            <Ionicons name={getButtonIcon(buttons.volumeDown) as any} size={24} color={getButtonColor(buttons.volumeDown)} />
            <Text style={[styles.statusLabel, { color: getButtonColor(buttons.volumeDown) }]}>
              {getButtonLabel(buttons.volumeDown)}
            </Text>
          </View>
          {autoDetectSupported === false && buttons.volumeDown === 'WAITING' && (
            <View style={styles.manualRow}>
              <TouchableOpacity style={styles.passBtn} onPress={() => manualVerify('volumeDown', true)}>
                <Text style={styles.passBtnText}>Working</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.failBtn} onPress={() => manualVerify('volumeDown', false)}>
                <Text style={styles.failBtnText}>Not Working</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {allTested && (
          <View style={[styles.summaryBanner, { backgroundColor: anyFail ? '#F4433620' : '#4CAF5020' }]}>
            <Ionicons
              name={anyFail ? 'close-circle' : 'checkmark-circle'}
              size={24}
              color={anyFail ? '#F44336' : '#4CAF50'}
            />
            <Text style={[styles.summaryText, { color: anyFail ? '#F44336' : '#4CAF50' }]}>
              {anyFail ? 'Some buttons are not working' : anyDetected ? 'All buttons detected automatically' : 'All buttons verified'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.resetBtn} onPress={reset}>
          <Ionicons name="refresh" size={18} color="#AAA" />
          <Text style={styles.resetBtnText}>Reset</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="checkmark" size={18} color="#FFF" />
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#1E1E2E',
  },
  backBtn: { padding: 8 },
  headerInfo: { marginLeft: 12, flex: 1 },
  title: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#888', fontSize: 12, marginTop: 2 },
  content: { flex: 1, padding: 16 },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF980015',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  infoText: { color: '#FF9800', fontSize: 12, marginLeft: 8, flex: 1 },
  buttonCard: {
    backgroundColor: '#1E1E2E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  buttonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonTitle: { color: '#FFF', fontSize: 18, fontWeight: '600', marginLeft: 12 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
  },
  statusLabel: { fontSize: 16, fontWeight: '700', marginLeft: 10 },
  manualRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 12,
  },
  passBtn: {
    flex: 1,
    backgroundColor: '#4CAF5030',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  passBtnText: { color: '#4CAF50', fontSize: 14, fontWeight: '600' },
  failBtn: {
    flex: 1,
    backgroundColor: '#F4433630',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  failBtnText: { color: '#F44336', fontSize: 14, fontWeight: '600' },
  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    marginTop: 8,
  },
  summaryText: { fontSize: 14, fontWeight: '600', marginLeft: 10 },
  footer: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  resetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
    padding: 14,
    borderRadius: 12,
  },
  resetBtnText: { color: '#AAA', fontSize: 15, fontWeight: '600', marginLeft: 6 },
  doneBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 14,
    borderRadius: 12,
  },
  doneBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600', marginLeft: 6 },
});
