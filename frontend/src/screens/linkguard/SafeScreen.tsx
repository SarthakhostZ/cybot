/**
 * SafeScreen.tsx
 *
 * Shown when the scan verdict is 'safe'.
 * Auto-opens the URL in the browser after a countdown.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { FastScanResult, DeepScanResult } from '@/services/linkguard';

interface Props {
  url: string;
  fastResult: FastScanResult | null;
  deepResult: DeepScanResult | null;
  onOpenNow: () => void;
  onGoBack: () => void;
  autoOpenDelay: number;
}

const YELLOW = '#F5F000';
const GREEN  = '#22c55e';

export default function SafeScreen({
  url, fastResult, deepResult, onOpenNow, onGoBack, autoOpenDelay,
}: Props) {
  const scale   = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [countdown, setCountdown] = useState(Math.ceil(autoOpenDelay / 1000));

  const score    = deepResult?.final_score ?? fastResult?.score ?? 100;
  const shortUrl = url.length > 55 ? url.slice(0, 52) + '…' : url;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,   { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
    ]).start();
  }, [opacity, scale]);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [countdown]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Animated.View style={[styles.iconWrapper, { transform: [{ scale }], opacity }]}>
          <View style={styles.iconCircle}>
            <Text style={styles.icon}>✓</Text>
          </View>
        </Animated.View>

        <Animated.Text style={[styles.title, { opacity }]}>Safe Link</Animated.Text>
        <Animated.Text style={[styles.subtitle, { opacity }]}>No threats detected</Animated.Text>

        <View style={styles.scoreRow}>
          <View style={styles.scoreBadge}>
            <Text style={styles.scoreValue}>{score}</Text>
            <Text style={styles.scoreLabel}>SAFETY SCORE</Text>
          </View>
        </View>

        <View style={styles.urlBox}>
          <Text style={styles.urlLabel}>OPENING</Text>
          <Text style={styles.urlText} numberOfLines={2}>{shortUrl}</Text>
        </View>

        {fastResult?.whitelisted && (
          <View style={styles.whitelistBadge}>
            <Text style={styles.whitelistText}>Trusted Domain</Text>
          </View>
        )}

        <Text style={styles.countdown}>Opening in browser in {countdown}s…</Text>

        <TouchableOpacity style={styles.openBtn} onPress={onOpenNow} activeOpacity={0.85}>
          <Text style={styles.openBtnText}>Open Now</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backBtn} onPress={onGoBack} activeOpacity={0.8}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

  iconWrapper: { marginBottom: 24 },
  iconCircle:  {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: GREEN, shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  icon: { fontSize: 48, color: '#fff', fontWeight: '800' },

  title:    { fontSize: 32, fontWeight: '900', color: GREEN, marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#555', marginBottom: 28 },

  scoreRow:   { flexDirection: 'row', marginBottom: 24 },
  scoreBadge: {
    backgroundColor: GREEN + '18', borderRadius: 12,
    paddingHorizontal: 28, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: GREEN + '44',
  },
  scoreValue: { fontSize: 38, fontWeight: '900', color: GREEN },
  scoreLabel: { fontSize: 10, color: '#555', fontWeight: '800', letterSpacing: 1.5, marginTop: 4 },

  urlBox: {
    backgroundColor: '#111', borderRadius: 12,
    padding: 16, width: '100%', marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  urlLabel: { fontSize: 10, color: '#555', marginBottom: 6, fontWeight: '800', letterSpacing: 1.5 },
  urlText:  { fontSize: 13, color: YELLOW, fontFamily: 'monospace' },

  whitelistBadge: {
    backgroundColor: GREEN + '18', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 5, marginBottom: 18,
    borderWidth: 1, borderColor: GREEN + '44',
  },
  whitelistText: { fontSize: 12, color: GREEN, fontWeight: '700' },

  countdown: { fontSize: 13, color: '#555', marginBottom: 24 },

  openBtn: {
    backgroundColor: YELLOW, borderRadius: 12,
    paddingVertical: 16, width: '100%', alignItems: 'center', marginBottom: 12,
  },
  openBtnText: { fontSize: 16, fontWeight: '900', color: '#000' },

  backBtn: {
    backgroundColor: '#111', borderRadius: 12,
    paddingVertical: 14, width: '100%', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  backBtnText: { fontSize: 15, color: '#666', fontWeight: '600' },
});
