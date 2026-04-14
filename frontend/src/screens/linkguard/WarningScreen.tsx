/**
 * WarningScreen.tsx
 *
 * Shown when the verdict is 'suspicious'.
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  SafeAreaView,
  ScrollView,
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
  onOpenAnyway: () => void;
  onGoBack: () => void;
  isPartialScan: boolean;
}

const YELLOW  = '#F5F000';
const WARNING = '#f59e0b';

export default function WarningScreen({
  url, fastResult, deepResult, onOpenAnyway, onGoBack, isPartialScan,
}: Props) {
  const shake   = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const score     = deepResult?.final_score ?? fastResult?.score ?? 50;
  const flags     = deepResult?.flags ?? fastResult?.flags ?? [];
  const aiReason  = deepResult?.ai_analysis?.reason ?? null;
  const domainAge = deepResult?.domain_age_days;
  const shortUrl  = url.length > 55 ? url.slice(0, 52) + '…' : url;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1, duration: 400, useNativeDriver: true, easing: Easing.out(Easing.ease),
    }).start();

    Animated.sequence([
      Animated.timing(shake, { toValue: 10,  duration: 80, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 80, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6,   duration: 80, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -6,  duration: 80, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0,   duration: 80, useNativeDriver: true }),
    ]).start();
  }, [opacity, shake]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.iconWrapper, { transform: [{ translateX: shake }], opacity }]}>
          <View style={styles.iconCircle}>
            <Text style={styles.icon}>⚠️</Text>
          </View>
        </Animated.View>

        <Text style={styles.title}>Suspicious Link</Text>
        <Text style={styles.subtitle}>Proceed with caution</Text>

        {isPartialScan && (
          <View style={styles.partialBadge}>
            <Text style={styles.partialText}>OFFLINE / PARTIAL SCAN</Text>
          </View>
        )}

        {/* Score */}
        <View style={styles.scoreRow}>
          <View style={styles.scoreBadge}>
            <Text style={styles.scoreValue}>{score}</Text>
            <Text style={styles.scoreLabel}>RISK SCORE</Text>
          </View>
          {domainAge !== null && domainAge !== undefined && (
            <View style={[styles.scoreBadge, { marginLeft: 12 }]}>
              <Text style={styles.scoreValue}>{domainAge}d</Text>
              <Text style={styles.scoreLabel}>DOMAIN AGE</Text>
            </View>
          )}
        </View>

        {/* URL */}
        <View style={styles.urlBox}>
          <Text style={styles.urlLabel}>URL</Text>
          <Text style={styles.urlText} numberOfLines={3}>{shortUrl}</Text>
        </View>

        {/* AI explanation */}
        {aiReason && (
          <View style={styles.aiBox}>
            <Text style={styles.aiLabel}>AI ANALYSIS</Text>
            <Text style={styles.aiText}>{aiReason}</Text>
          </View>
        )}

        {/* Flags */}
        {flags.length > 0 && (
          <View style={styles.flagsBox}>
            <Text style={styles.flagsLabel}>RISK INDICATORS</Text>
            {flags.slice(0, 6).map((f, i) => (
              <View key={i} style={styles.flagRow}>
                <Text style={styles.flagDot}>●</Text>
                <Text style={styles.flagText}>{f.replace(/_/g, ' ')}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Actions */}
        <TouchableOpacity style={styles.goBackBtn} onPress={onGoBack} activeOpacity={0.85}>
          <Text style={styles.goBackText}>Go Back (Recommended)</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.openAnywayBtn} onPress={onOpenAnyway} activeOpacity={0.8}>
          <Text style={styles.openAnywayText}>Open Anyway — I Accept the Risk</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content:   { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 40 },

  iconWrapper: { marginBottom: 20 },
  iconCircle:  {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: WARNING,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: WARNING, shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  icon: { fontSize: 40 },

  title:    { fontSize: 28, fontWeight: '900', color: WARNING, marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#555', marginBottom: 16 },

  partialBadge: {
    backgroundColor: WARNING + '18', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5, marginBottom: 18,
    borderWidth: 1, borderColor: WARNING + '44',
  },
  partialText: { fontSize: 10, color: WARNING, fontWeight: '900', letterSpacing: 1.5 },

  scoreRow:   { flexDirection: 'row', marginBottom: 20 },
  scoreBadge: {
    backgroundColor: WARNING + '12', borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center',
    borderWidth: 1, borderColor: WARNING + '33',
    flex: 1,
  },
  scoreValue: { fontSize: 30, fontWeight: '900', color: WARNING },
  scoreLabel: { fontSize: 10, color: '#555', fontWeight: '800', letterSpacing: 1.5, marginTop: 4 },

  urlBox: {
    backgroundColor: '#111', borderRadius: 12,
    padding: 14, width: '100%', marginBottom: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  urlLabel: { fontSize: 10, color: '#555', marginBottom: 5, fontWeight: '800', letterSpacing: 1.5 },
  urlText:  { fontSize: 13, color: YELLOW, fontFamily: 'monospace' },

  aiBox: {
    backgroundColor: WARNING + '0d', borderRadius: 12,
    padding: 14, width: '100%', marginBottom: 14,
    borderWidth: 1, borderColor: WARNING + '33',
  },
  aiLabel: { fontSize: 10, color: WARNING, marginBottom: 6, fontWeight: '900', letterSpacing: 1.5 },
  aiText:  { fontSize: 14, color: '#aaa', lineHeight: 20 },

  flagsBox: {
    backgroundColor: '#111', borderRadius: 12,
    padding: 14, width: '100%', marginBottom: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  flagsLabel: { fontSize: 10, color: '#555', marginBottom: 8, fontWeight: '800', letterSpacing: 1.5 },
  flagRow:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  flagDot:    { fontSize: 7, color: WARNING, marginRight: 8, marginTop: 5 },
  flagText:   { fontSize: 13, color: '#aaa', flex: 1, textTransform: 'capitalize' },

  goBackBtn: {
    backgroundColor: YELLOW, borderRadius: 12,
    paddingVertical: 16, width: '100%', alignItems: 'center', marginBottom: 12,
  },
  goBackText: { fontSize: 16, fontWeight: '900', color: '#000' },

  openAnywayBtn: {
    backgroundColor: 'transparent', borderRadius: 12,
    paddingVertical: 14, width: '100%', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  openAnywayText: { fontSize: 14, color: '#555' },
});
