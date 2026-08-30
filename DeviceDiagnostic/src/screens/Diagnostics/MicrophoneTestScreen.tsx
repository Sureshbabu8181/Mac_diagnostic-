import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useAudioRecorder,
  useAudioRecorderState,
  useAudioPlayer,
  useAudioPlayerStatus,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from 'expo-audio';

export default function MicrophoneTestScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [permission, setPermission] = useState<boolean | null>(null);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<'PASS' | 'FAIL' | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const requestPermission = async () => {
    const { granted } = await AudioModule.requestRecordingPermissionsAsync();
    setPermission(granted);
    if (granted) {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    }
  };

  useEffect(() => {
    requestPermission();
  }, []);

  const startRecording = async () => {
    setError(null);
    setRecordingUri(null);
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e) {
      setError('Could not start recording.');
      console.error(e);
    }
  };

  const stopRecording = async () => {
    try {
      await recorder.stop();
      setRecordingUri(recorder.uri);
    } catch (e) {
      setError('Could not save recording.');
      console.error(e);
    }
  };

  const recorderState = useAudioRecorderState(recorder);

  const player = useAudioPlayer(recordingUri ? { uri: recordingUri } : null);
  const playerStatus = useAudioPlayerStatus(player);
  const isPlaying = playerStatus.playing;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Microphone Test</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.body}>
        {permission === null && (
          <Text style={styles.hint}>Requesting microphone permission...</Text>
        )}

        {permission === false && (
          <View style={styles.centerBox}>
            <Ionicons name="mic-off-outline" size={64} color="#F44336" />
            <Text style={styles.errorTitle}>Microphone permission denied</Text>
            <Text style={styles.errorSub}>Enable mic access in device Settings.</Text>
            <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
              <Text style={styles.grantBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {permission === true && (
          <>
            <View style={styles.promptCard}>
              <Text style={styles.promptTitle}>Record &amp; Playback Test</Text>
              <Text style={styles.promptText}>
                Press Record, speak into the microphone for a few seconds, then press
                Play to check that your voice was captured clearly on the input audio.
              </Text>
            </View>

            <View style={styles.meterRow}>
              <View
                style={[
                  styles.recordDot,
                  { backgroundColor: recorderState.isRecording ? '#F44336' : '#666' },
                ]}
              />
              <Text style={styles.timerText}>
                {recorderState.isRecording
                  ? `Recording ${Math.floor(recorderState.durationMillis / 1000)}s`
                  : recordingUri
                  ? 'Recording saved'
                  : 'Ready'}
              </Text>
            </View>

            {error && <Text style={styles.errorText}>{error}</Text>}

            <View style={styles.actionRow}>
              {!recorderState.isRecording ? (
                <TouchableOpacity style={styles.recordBtn} onPress={startRecording}>
                  <Ionicons name="mic" size={22} color="#FFF" />
                  <Text style={styles.recordBtnText}>Record</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.stopBtn} onPress={stopRecording}>
                  <Ionicons name="stop" size={22} color="#FFF" />
                  <Text style={styles.recordBtnText}>Stop</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.playBtn, !recordingUri && styles.btnDisabled]}
                disabled={!recordingUri}
                onPress={() => (isPlaying ? player.pause() : player.play())}
              >
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={22}
                  color={recordingUri ? '#FFF' : '#666'}
                />
                <Text style={[styles.recordBtnText, !recordingUri && { color: '#666' }]}>
                  {isPlaying ? 'Pause' : 'Play'}
                </Text>
              </TouchableOpacity>
            </View>

            {recordingUri && !verdict && (
              <View style={styles.verdictBox}>
                <Text style={styles.verdictPrompt}>Did you hear your voice clearly?</Text>
                <View style={styles.verdictRow}>
                  <TouchableOpacity
                    style={[styles.passBtn, verdict === 'PASS' && styles.passBtnActive]}
                    onPress={() => setVerdict('PASS')}
                  >
                    <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
                    <Text style={styles.verdictBtnText}>Yes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.failBtn, verdict === 'FAIL' && styles.failBtnActive]}
                    onPress={() => setVerdict('FAIL')}
                  >
                    <Ionicons name="close-circle-outline" size={18} color="#FFF" />
                    <Text style={styles.verdictBtnText}>No</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {verdict && (
              <View
                style={[
                  styles.resultBanner,
                  { backgroundColor: verdict === 'PASS' ? '#4CAF5020' : '#F4433620' },
                ]}
              >
                <Ionicons
                  name={verdict === 'PASS' ? 'checkmark-circle' : 'close-circle'}
                  size={28}
                  color={verdict === 'PASS' ? '#4CAF50' : '#F44336'}
                />
                <Text
                  style={[
                    styles.resultText,
                    { color: verdict === 'PASS' ? '#4CAF50' : '#F44336' },
                  ]}
                >
                  {verdict === 'PASS' ? 'Microphone is working' : 'Microphone failed'}
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 4,
    backgroundColor: '#1E1E2E',
    zIndex: 10,
  },
  backBtn: { padding: 8 },
  title: { flex: 1, color: '#FFF', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  body: { flex: 1, padding: 16, paddingTop: 24 },
  hint: { color: '#AAA', fontSize: 14, textAlign: 'center', marginTop: 20 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorTitle: { color: '#F44336', fontSize: 16, fontWeight: '700', marginTop: 12 },
  errorSub: { color: '#888', fontSize: 13, marginTop: 4, textAlign: 'center' },
  grantBtn: {
    marginTop: 16,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  grantBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  promptCard: { backgroundColor: '#1E1E2E', padding: 16, borderRadius: 12 },
  promptTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  promptText: { color: '#AAA', fontSize: 13, lineHeight: 20, marginTop: 8 },
  meterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 28,
  },
  recordDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  timerText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  errorText: { color: '#F44336', fontSize: 13, textAlign: 'center', marginBottom: 8 },
  actionRow: { flexDirection: 'row', gap: 12 },
  recordBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F44336',
    padding: 14,
    borderRadius: 12,
  },
  stopBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F44336',
    padding: 14,
    borderRadius: 12,
  },
  playBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 14,
    borderRadius: 12,
  },
  btnDisabled: { backgroundColor: '#1E1E2E' },
  recordBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600', marginLeft: 8 },
  verdictBox: { marginTop: 24 },
  verdictPrompt: { color: '#FFF', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  verdictRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  passBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2E3A30',
    padding: 12,
    borderRadius: 10,
  },
  passBtnActive: { backgroundColor: '#4CAF50' },
  failBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3A2E2E',
    padding: 12,
    borderRadius: 10,
  },
  failBtnActive: { backgroundColor: '#F44336' },
  verdictBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600', marginLeft: 6 },
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    padding: 14,
    borderRadius: 12,
  },
  resultText: { fontSize: 15, fontWeight: '700', marginLeft: 10 },
});
