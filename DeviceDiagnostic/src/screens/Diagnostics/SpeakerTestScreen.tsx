import React, { useEffect, useState } from 'react';
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
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { createToneFile } from '../../utils/toneGenerator';

type SpeakerKind = 'loud' | 'earpiece';

export default function SpeakerTestScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [active, setActive] = useState<SpeakerKind | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playToken, setPlayToken] = useState(0);
  const [loudVerdict, setLoudVerdict] = useState<'PASS' | 'FAIL' | null>(null);
  const [earVerdict, setEarVerdict] = useState<'PASS' | 'FAIL' | null>(null);

  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);
  const isPlaying = status.playing;

  useEffect(() => {
    if (playToken === 0) return;
    if (status.isLoaded) {
      player.play();
      setPlayToken(0);
    }
  }, [playToken, status.isLoaded]);

  const playTone = async (kind: SpeakerKind) => {
    setError(null);
    setGenerating(true);
    try {
      player.pause();
      const freq = kind === 'loud' ? 440 : 1000;
      const fileUri = await createToneFile({ frequency: freq, durationSeconds: 2 });
      player.replace({ uri: fileUri });
      setActive(kind);
      setPlayToken((t) => t + 1);
    } catch (e) {
      setError('Could not generate the test tone.');
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  const stopPlay = () => {
    player.pause();
    setPlayToken(0);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Speaker Test</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.promptCard}>
          <Text style={styles.promptTitle}>Check Speaker Output</Text>
          <Text style={styles.promptText}>
            Play a test tone and confirm which speaker the sound comes from. The loud
            speaker test uses a low tone; the earpiece test uses a high tone.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>Loud Speaker</Text>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardInfo}>
              <Ionicons name="volume-high-outline" size={26} color="#4CAF50" />
              <Text style={styles.cardName}>Loud Speaker</Text>
              <Text style={styles.cardDesc}>Hold at normal distance, listen for the low tone</Text>
            </View>
            <TouchableOpacity
              style={[styles.playSmall, active === 'loud' && isPlaying && styles.playSmallActive]}
              disabled={generating}
              onPress={() => playTone('loud')}
            >
              <Ionicons
                name={active === 'loud' && isPlaying ? 'pause' : 'play'}
                size={20}
                color="#FFF"
              />
            </TouchableOpacity>
          </View>
          {loudVerdict && (
            <View
              style={[
                styles.verdictBanner,
                { backgroundColor: loudVerdict === 'PASS' ? '#4CAF5020' : '#F4433620' },
              ]}
            >
              <Ionicons
                name={loudVerdict === 'PASS' ? 'checkmark-circle' : 'close-circle'}
                size={18}
                color={loudVerdict === 'PASS' ? '#4CAF50' : '#F44336'}
              />
              <Text
                style={[
                  styles.verdictText,
                  { color: loudVerdict === 'PASS' ? '#4CAF50' : '#F44336' },
                ]}
              >
                {loudVerdict === 'PASS' ? 'Working' : 'Failed'}
              </Text>
            </View>
          )}
          <View style={styles.choiceRow}>
            <TouchableOpacity
              style={[styles.passBtn, loudVerdict === 'PASS' && styles.passBtnActive]}
              onPress={() => setLoudVerdict('PASS')}
            >
              <Text style={styles.choiceText}>Heard it</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.failBtn, loudVerdict === 'FAIL' && styles.failBtnActive]}
              onPress={() => setLoudVerdict('FAIL')}
            >
              <Text style={styles.choiceText}>Not heard</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Earpiece</Text>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardInfo}>
              <Ionicons name="phone-portrait-outline" size={26} color="#4CAF50" />
              <Text style={styles.cardName}>Earpiece</Text>
              <Text style={styles.cardDesc}>Hold to your ear, listen for the high tone</Text>
            </View>
            <TouchableOpacity
              style={[styles.playSmall, active === 'earpiece' && isPlaying && styles.playSmallActive]}
              disabled={generating}
              onPress={() => playTone('earpiece')}
            >
              <Ionicons
                name={active === 'earpiece' && isPlaying ? 'pause' : 'play'}
                size={20}
                color="#FFF"
              />
            </TouchableOpacity>
          </View>
          {earVerdict && (
            <View
              style={[
                styles.verdictBanner,
                { backgroundColor: earVerdict === 'PASS' ? '#4CAF5020' : '#F4433620' },
              ]}
            >
              <Ionicons
                name={earVerdict === 'PASS' ? 'checkmark-circle' : 'close-circle'}
                size={18}
                color={earVerdict === 'PASS' ? '#4CAF50' : '#F44336'}
              />
              <Text
                style={[
                  styles.verdictText,
                  { color: earVerdict === 'PASS' ? '#4CAF50' : '#F44336' },
                ]}
              >
                {earVerdict === 'PASS' ? 'Working' : 'Failed'}
              </Text>
            </View>
          )}
          <View style={styles.choiceRow}>
            <TouchableOpacity
              style={[styles.passBtn, earVerdict === 'PASS' && styles.passBtnActive]}
              onPress={() => setEarVerdict('PASS')}
            >
              <Text style={styles.choiceText}>Heard it</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.failBtn, earVerdict === 'FAIL' && styles.failBtnActive]}
              onPress={() => setEarVerdict('FAIL')}
            >
              <Text style={styles.choiceText}>Not heard</Text>
            </TouchableOpacity>
          </View>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}
        {generating && <Text style={styles.hint}>Generating tone...</Text>}

        {isPlaying && (
          <TouchableOpacity style={styles.stopButton} onPress={stopPlay}>
            <Ionicons name="stop" size={18} color="#FFF" />
            <Text style={styles.stopButtonText}>Stop Tone</Text>
          </TouchableOpacity>
        )}

        {loudVerdict && earVerdict && (
          <View
            style={[
              styles.summaryBanner,
              {
                backgroundColor:
                  loudVerdict === 'PASS' && earVerdict === 'PASS' ? '#4CAF5020' : '#FF980020',
              },
            ]}
          >
            <Ionicons
              name={
                loudVerdict === 'PASS' && earVerdict === 'PASS'
                  ? 'checkmark-circle'
                  : 'alert-circle'
              }
              size={24}
              color={loudVerdict === 'PASS' && earVerdict === 'PASS' ? '#4CAF50' : '#FF9800'}
            />
            <Text
              style={[
                styles.summaryText,
                {
                  color: loudVerdict === 'PASS' && earVerdict === 'PASS' ? '#4CAF50' : '#FF9800',
                },
              ]}
            >
              {loudVerdict === 'PASS' && earVerdict === 'PASS'
                ? 'Both speakers working'
                : 'One or both speakers failed'}
            </Text>
          </View>
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
  body: { flex: 1, padding: 16 },
  promptCard: { backgroundColor: '#1E1E2E', padding: 16, borderRadius: 12, marginBottom: 16 },
  promptTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  promptText: { color: '#AAA', fontSize: 13, lineHeight: 20, marginTop: 8 },
  sectionLabel: { color: '#888', fontSize: 12, fontWeight: '600', marginBottom: 8, marginTop: 8 },
  card: { backgroundColor: '#1E1E2E', borderRadius: 12, padding: 14, marginBottom: 8 },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardInfo: { flex: 1, marginRight: 12 },
  cardName: { color: '#FFF', fontSize: 15, fontWeight: '600', marginTop: 4 },
  cardDesc: { color: '#888', fontSize: 12, marginTop: 2, lineHeight: 16 },
  playSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playSmallActive: { backgroundColor: '#FF9800' },
  choiceRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  passBtn: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#2E3A30',
    paddingVertical: 10,
    borderRadius: 8,
  },
  passBtnActive: { backgroundColor: '#4CAF50' },
  failBtn: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#3A2E2E',
    paddingVertical: 10,
    borderRadius: 8,
  },
  failBtnActive: { backgroundColor: '#F44336' },
  choiceText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  verdictBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    padding: 8,
    borderRadius: 8,
  },
  verdictText: { fontSize: 13, fontWeight: '700', marginLeft: 8 },
  errorText: { color: '#F44336', fontSize: 13, textAlign: 'center', marginTop: 10 },
  hint: { color: '#AAA', fontSize: 13, textAlign: 'center', marginTop: 10 },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F44336',
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  stopButtonText: { color: '#FFF', fontSize: 14, fontWeight: '600', marginLeft: 8 },
  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
  },
  summaryText: { fontSize: 14, fontWeight: '700', marginLeft: 10 },
});
