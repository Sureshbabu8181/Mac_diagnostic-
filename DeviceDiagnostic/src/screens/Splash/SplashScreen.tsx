import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function SplashScreen() {
  const navigation = useNavigation<any>();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace('Tabs');
    }, 2200);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.logoWrap}>
        <Image source={require('../../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
      </View>
      <Text style={styles.title}>One Diagnose</Text>
      <Text style={styles.tagline}>Complete hardware health check for your device</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  logoWrap: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#FFFFFF10',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  logo: {
    width: 160,
    height: 160,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tagline: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
});
