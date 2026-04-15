/**
 * ScanningScreen.tsx
 *
 * Shown while a URL scan is in progress.
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ScanStatus } from '@/hooks/useLinkGuard';
import { ScanLine } from 'lucide-react-native';

interface Props {
  url: string;
  status: ScanStatus;
}

const CYAN = '#00E5FF';

export default function ScanningScreen({ url, status }: Props) {
  const pulse  = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.2, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulse, { toValue: 1,   duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ]),
    ).start();

    Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 1800,
        useNativeDriver: true,
        easing: Easing.linear,
      }),
    ).start();
  }, [pulse, rotate]);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const progressLabel =
    status === 'fast-scanning'  ? 'Fast scanning URL…'
    : status === 'deep-scanning' ? 'Running deep analysis…'
    : 'Checking safety…';

  const shortUrl = url.length > 50 ? url.slice(0, 47) + '…' : url;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Animated ring */}
        <View style={styles.iconWrapper}>
          <Animated.View style={[styles.outerRing, { transform: [{ scale: pulse }] }]} />
          <Animated.View style={[styles.spinnerRing, { transform: [{ rotate: spin }] }]} />
          <View style={styles.shieldCenter}>
            <ScanLine size={30} color={CYAN} strokeWidth={2} />
          </View>
        </View>

        <Text style={styles.title}>LinkGuard</Text>
        <Text style={styles.subtitle}>Scanning for threats…</Text>

        <View style={styles.urlBox}>
          <Text style={styles.urlLabel}>CHECKING URL</Text>
          <Text style={styles.urlText} numberOfLines={2}>{shortUrl}</Text>
        </View>

        <View style={styles.progressRow}>
          <View style={[styles.dot, status !== 'idle' && styles.dotActive]} />
          <View style={[styles.dot, status === 'deep-scanning' && styles.dotActive]} />
          <View style={styles.dot} />
        </View>
        <Text style={styles.progressLabel}>{progressLabel}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

  iconWrapper: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  outerRing: {
    position: 'absolute',
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(245,240,0,0.1)',
  },
  spinnerRing: {
    position: 'absolute',
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 3,
    borderColor: CYAN,
    borderTopColor: 'transparent',
  },
  shieldCenter: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#0F0F1A',
    borderWidth: 2,
    borderColor: CYAN,
    alignItems: 'center', justifyContent: 'center',
  },

  title:    { fontSize: 28, fontWeight: '900', color: '#fff', marginBottom: 8, letterSpacing: 2 },
  subtitle: { fontSize: 15, color: '#555', marginBottom: 32 },

  urlBox: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  urlLabel: { fontSize: 10, color: '#555', marginBottom: 6, fontWeight: '800', letterSpacing: 1.5 },
  urlText:  { fontSize: 13, color: CYAN, fontFamily: 'monospace' },

  progressRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  dot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: '#222' },
  dotActive:   { backgroundColor: CYAN },
  progressLabel: { fontSize: 13, color: '#555' },
});
