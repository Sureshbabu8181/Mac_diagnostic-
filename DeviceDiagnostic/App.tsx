import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>MAC Diagnostic Center</Text>
      <Text style={styles.sub}>Loading...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  text: { color: '#4CAF50', fontSize: 24, fontWeight: '700' },
  sub: { color: '#888', fontSize: 14, marginTop: 8 },
});
