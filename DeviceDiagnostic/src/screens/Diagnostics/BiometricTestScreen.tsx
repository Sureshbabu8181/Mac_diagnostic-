import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Device from 'expo-device';

export default function BiometricTestScreen() {
  const navigation = useNavigation();
  const [hardwareAvailable, setHardwareAvailable] = useState<boolean | null>(null);
  const [biometricTypes, setBiometricTypes] = useState<string[]>([]);
  const [authResult, setAuthResult] = useState<'WAITING' | 'PASS' | 'FAIL' | 'NOT_AVAILABLE'>('WAITING');
  const [fingerprintHardware, setFingerprintHardware] = useState<boolean | null>(null);
  const [homeButtonTest, setHomeButtonTest] = useState<'WAITING' | 'PASS' | 'FAIL' | 'NOT_APPLICABLE'>('WAITING');

  useEffect(() => {
    checkBiometricHardware();
  }, []);

  const checkBiometricHardware = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      setHardwareAvailable(hasHardware);
      setFingerprintHardware(hasHardware);

      if (hasHardware) {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        const typeNames = types.map((t) => {
          switch (t) {
            case LocalAuthentication.AuthenticationType.FINGERPRINT:
              return 'Fingerprint';
            case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
              return 'Face ID';
            case LocalAuthentication.AuthenticationType.IRIS:
              return 'Iris';
            default:
              return 'Unknown';
          }
        });
        setBiometricTypes(typeNames);

        if (!typeNames.includes('Fingerprint')) {
          setFingerprintHardware(false);
        }
      }
    } catch (err) {
      setHardwareAvailable(false);
      setFingerprintHardware(false);
    }
  };

  const runBiometricAuth = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify your fingerprint to test biometric hardware',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      setAuthResult(result.success ? 'PASS' : 'FAIL');
    } catch (err) {
      setAuthResult('FAIL');
    }
  };

  const testHomeButton = (working: boolean) => {
    setHomeButtonTest(working ? 'PASS' : 'FAIL');
  };

  const hasFingerprint = biometricTypes.includes('Fingerprint');
  const hasFaceId = biometricTypes.includes('Face ID');
  const deviceName = Device.modelName ?? 'Unknown Device';

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PASS': return '#4CAF50';
      case 'FAIL': return '#F44336';
      case 'NOT_AVAILABLE': return '#666';
      case 'NOT_APPLICABLE': return '#666';
      default: return '#FF9800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PASS': return 'checkmark-circle';
      case 'FAIL': return 'close-circle';
      case 'NOT_AVAILABLE': return 'remove-circle';
      case 'NOT_APPLICABLE': return 'remove-circle';
      default: return 'help-circle';
    }
  };

  const allDone = authResult !== 'WAITING' && homeButtonTest !== 'WAITING';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>Biometric / Fingerprint Test</Text>
          <Text style={styles.subtitle}>{deviceName}</Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hardware Detection</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Biometric Hardware</Text>
            <Text style={[styles.infoValue, { color: hardwareAvailable ? '#4CAF50' : '#F44336' }]}>
              {hardwareAvailable === null ? 'Checking...' : hardwareAvailable ? 'Available' : 'Not Available'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Sensor Types</Text>
            <Text style={styles.infoValue}>
              {biometricTypes.length > 0 ? biometricTypes.join(', ') : 'None detected'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Fingerprint Sensor</Text>
            <Text style={[styles.infoValue, { color: hasFingerprint ? '#4CAF50' : '#888' }]}>
              {hasFingerprint ? 'Detected' : 'Not Detected'}
            </Text>
          </View>
          {hasFaceId && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Face ID</Text>
              <Text style={[styles.infoValue, { color: '#4CAF50' }]}>Detected</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Fingerprint Authentication Test</Text>
          {hardwareAvailable ? (
            <>
              <Text style={styles.cardDesc}>
                Tap the button below to trigger fingerprint authentication. This verifies the sensor is working.
              </Text>
              {authResult === 'WAITING' ? (
                <TouchableOpacity style={styles.authButton} onPress={runBiometricAuth}>
                  <Ionicons name="finger-print" size={24} color="#FFF" />
                  <Text style={styles.authButtonText}>Test Fingerprint Auth</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.resultBanner, { backgroundColor: getStatusColor(authResult) + '15' }]}>
                  <Ionicons name={getStatusIcon(authResult) as any} size={24} color={getStatusColor(authResult)} />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={[styles.resultLabel, { color: getStatusColor(authResult) }]}>
                      {authResult === 'PASS' ? 'Authentication Successful' : 'Authentication Failed'}
                    </Text>
                    <Text style={styles.resultDesc}>
                      {authResult === 'PASS'
                        ? 'Fingerprint sensor is working correctly'
                        : 'Fingerprint was not recognized or was cancelled'}
                    </Text>
                  </View>
                </View>
              )}
            </>
          ) : (
            <View style={[styles.resultBanner, { backgroundColor: '#66615' }]}>
              <Ionicons name="remove-circle" size={24} color="#666" />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={[styles.resultLabel, { color: '#666' }]}>Not Available</Text>
                <Text style={styles.resultDesc}>This device does not have biometric hardware</Text>
              </View>
            </View>
          )}
        </View>

        {hasFingerprint && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Physical Fingerprint Button Test</Text>
            <Text style={styles.cardDesc}>
              Some devices have the fingerprint sensor integrated into a physical home button.
              Test whether the physical button is also functioning.
            </Text>

            {homeButtonTest === 'WAITING' ? (
              <View style={styles.manualRow}>
                <TouchableOpacity style={styles.passBtn} onPress={() => testHomeButton(true)}>
                  <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                  <Text style={styles.passBtnText}>Button Working</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.failBtn} onPress={() => testHomeButton(false)}>
                  <Ionicons name="close-circle" size={20} color="#F44336" />
                  <Text style={styles.failBtnText}>Button Not Working</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.resultBanner, { backgroundColor: getStatusColor(homeButtonTest) + '15' }]}>
                <Ionicons name={getStatusIcon(homeButtonTest) as any} size={24} color={getStatusColor(homeButtonTest)} />
                <Text style={[styles.resultLabel, { color: getStatusColor(homeButtonTest), marginLeft: 10 }]}>
                  {homeButtonTest === 'PASS' ? 'Physical Button Working' : 'Physical Button Not Working'}
                </Text>
              </View>
            )}
          </View>
        )}

        {allDone && (
          <View style={[styles.summaryCard, { backgroundColor: (authResult === 'PASS' && (homeButtonTest === 'PASS' || homeButtonTest === 'NOT_APPLICABLE')) ? '#4CAF5015' : '#F4433615' }]}>
            <Ionicons
              name={(authResult === 'PASS' && (homeButtonTest === 'PASS' || homeButtonTest === 'NOT_APPLICABLE')) ? 'checkmark-circle' : 'warning'}
              size={24}
              color={(authResult === 'PASS' && (homeButtonTest === 'PASS' || homeButtonTest === 'NOT_APPLICABLE')) ? '#4CAF50' : '#F44336'}
            />
            <Text style={styles.summaryText}>
              {(authResult === 'PASS' && (homeButtonTest === 'PASS' || homeButtonTest === 'NOT_APPLICABLE'))
                ? 'Biometric system is fully functional'
                : 'Some biometric components need attention'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
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
  card: {
    backgroundColor: '#1E1E2E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 12 },
  cardDesc: { color: '#AAA', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A3A',
  },
  infoLabel: { color: '#888', fontSize: 13 },
  infoValue: { color: '#DDD', fontSize: 13, fontWeight: '500' },
  authButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 14,
    borderRadius: 12,
  },
  authButtonText: { color: '#FFF', fontSize: 15, fontWeight: '600', marginLeft: 8 },
  manualRow: { flexDirection: 'row', gap: 12 },
  passBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF5015',
    padding: 12,
    borderRadius: 10,
  },
  passBtnText: { color: '#4CAF50', fontSize: 13, fontWeight: '600', marginLeft: 6 },
  failBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4433615',
    padding: 12,
    borderRadius: 10,
  },
  failBtnText: { color: '#F44336', fontSize: 13, fontWeight: '600', marginLeft: 6 },
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
  },
  resultLabel: { fontSize: 14, fontWeight: '600' },
  resultDesc: { color: '#888', fontSize: 12, marginTop: 2 },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    marginTop: 4,
  },
  summaryText: { color: '#DDD', fontSize: 14, fontWeight: '600', marginLeft: 10, flex: 1 },
  footer: { padding: 16, paddingBottom: 32 },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 14,
    borderRadius: 12,
  },
  doneBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600', marginLeft: 6 },
});
