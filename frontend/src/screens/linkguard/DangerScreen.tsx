/**
 * DangerScreen.tsx
 *
 * Shown when the verdict is 'dangerous'.
 * NO option to proceed — only "Go Back".
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
  onGoBack: () => void;
}

const YELLOW = '#F5F000';
const DANGER = '#ef4444';

export default function DangerScreen({ url, fastResult, deepResult, onGoBack }: Props) {
  const scale   = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const score      = deepResult?.final_score ?? fastResult?.score ?? 0;
  const flags      = deepResult?.flags ?? fastResult?.flags ?? [];
  const aiReason   = deepResult?.ai_analysis?.reason ?? null;
  const aiRisk     = deepResult?.ai_analysis?.risk ?? null;
  const confidence = deepResult?.ai_analysis?.confidence ?? null;
  const domainAge  = deepResult?.domain_age_days;
  const gsb        = deepResult?.google_safe_browsing;
  const shortUrl   = url.length > 55 ? url.slice(0, 52) + '…' : url;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,   { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
    ]).start();
  }, [opacity, scale]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.iconWrapper, { transform: [{ scale }], opacity }]}>
          <View style={styles.iconCircle}>
            <Text style={styles.icon}>🛡️</Text>
          </View>
          <View style={styles.blockedBadge}>
            <Text style={styles.blockedText}>BLOCKED</Text>
          </View>
        </Animated.View>

        <Text style={styles.title}>Dangerous Link</Text>
        <Text style={styles.subtitle}>This URL has been blocked to protect you</Text>

        {/* Score row */}
        <View style={styles.scoreRow}>
          <View style={styles.scoreBadge}>
            <Text style={styles.scoreValue}>{score}</Text>
            <Text style={styles.scoreLabel}>SAFETY SCORE</Text>
          </View>
          {confidence !== null && (
            <View style={[styles.scoreBadge, { marginLeft: 12 }]}>
              <Text style={styles.scoreValue}>{confidence}%</Text>
              <Text style={styles.scoreLabel}>AI CONFIDENCE</Text>
            </View>
          )}
          {domainAge !== null && domainAge !== undefined && (
            <View style={[styles.scoreBadge, { marginLeft: 12 }]}>
              <Text style={styles.scoreValue}>{domainAge}d</Text>
              <Text style={styles.scoreLabel}>DOMAIN AGE</Text>
            </View>
          )}
        </View>

        {/* URL */}
        <View style={styles.urlBox}>
          <Text style={styles.urlLabel}>BLOCKED URL</Text>
          <Text style={styles.urlText} numberOfLines={3}>{shortUrl}</Text>
        </View>

        {/* AI explanation */}
        {aiReason && (
          <View style={styles.aiBox}>
            <View style={styles.aiHeader}>
              <Text style={styles.aiLabel}>AI ANALYSIS</Text>
              {aiRisk && <Text style={styles.aiRisk}>{aiRisk}</Text>}
            </View>
            <Text style={styles.aiText}>{aiReason}</Text>
          </View>
        )}

        {/* GSB warning */}
        {gsb?.flagged && (
          <View style={styles.gsbBox}>
            <Text style={styles.gsbIcon}>🚨</Text>
            <View style={styles.gsbContent}>
              <Text style={styles.gsbTitle}>Google Safe Browsing Alert</Text>
              <Text style={styles.gsbText}>{gsb.threats.join(', ')}</Text>
            </View>
          </View>
        )}

        {/* All flags */}
        {flags.length > 0 && (
          <View style={styles.flagsBox}>
            <Text style={styles.flagsLabel}>THREAT INDICATORS ({flags.length})</Text>
            {flags.map((f, i) => (
              <View key={i} style={styles.flagRow}>
                <Text style={styles.flagDot}>●</Text>
                <Text style={styles.flagText}>{f.replace(/_/g, ' ')}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Single action */}
        <TouchableOpacity style={styles.goBackBtn} onPress={onGoBack} activeOpacity={0.85}>
          <Text style={styles.goBackText}>← Go Back to Safety</Text>
        </TouchableOpacity>

        <Text style={styles.noOptionText}>
          For your protection, this link cannot be opened.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content:   { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 40 },

  iconWrapper: { alignItems: 'center', marginBottom: 20 },
  iconCircle:  {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: DANGER,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: DANGER, shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  icon: { fontSize: 44 },
  blockedBadge: {
    backgroundColor: DANGER, borderRadius: 4,
    paddingHorizontal: 10, paddingVertical: 3, marginTop: 8,
  },
  blockedText: { fontSize: 10, fontWeight: '900', color: '#fff', letterSpacing: 2.5 },

  title:    { fontSize: 30, fontWeight: '900', color: DANGER, marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#555', marginBottom: 20, textAlign: 'center' },

  scoreRow:   { flexDirection: 'row', marginBottom: 20 },
  scoreBadge: {
    backgroundColor: DANGER + '12', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: DANGER + '33',
    flex: 1,
  },
  scoreValue: { fontSize: 28, fontWeight: '900', color: DANGER },
  scoreLabel: { fontSize: 10, color: '#555', fontWeight: '800', letterSpacing: 1.5, marginTop: 4 },

  urlBox: {
    backgroundColor: '#111', borderRadius: 12,
    padding: 14, width: '100%', marginBottom: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  urlLabel: { fontSize: 10, color: '#555', marginBottom: 5, fontWeight: '800', letterSpacing: 1.5 },
  urlText:  { fontSize: 13, color: DANGER, fontFamily: 'monospace' },

  aiBox: {
    backgroundColor: DANGER + '0d', borderRadius: 12,
    padding: 14, width: '100%', marginBottom: 14,
    borderWidth: 1, borderColor: DANGER + '33',
  },
  aiHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  aiLabel:   { fontSize: 10, color: DANGER, fontWeight: '900', letterSpacing: 1.5 },
  aiRisk:    { fontSize: 11, color: DANGER, fontWeight: '800', backgroundColor: DANGER + '22', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  aiText:    { fontSize: 14, color: '#aaa', lineHeight: 20 },

  gsbBox: {
    backgroundColor: DANGER + '18', borderRadius: 12,
    padding: 14, width: '100%', marginBottom: 14,
    flexDirection: 'row', alignItems: 'flex-start',
    borderWidth: 1, borderColor: DANGER + '44',
  },
  gsbIcon:    { fontSize: 20, marginRight: 10, marginTop: 2 },
  gsbContent: { flex: 1 },
  gsbTitle:   { fontSize: 13, fontWeight: '800', color: DANGER, marginBottom: 4 },
  gsbText:    { fontSize: 13, color: '#aaa' },

  flagsBox: {
    backgroundColor: '#111', borderRadius: 12,
    padding: 14, width: '100%', marginBottom: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  flagsLabel: { fontSize: 10, color: '#555', marginBottom: 8, fontWeight: '800', letterSpacing: 1.5 },
  flagRow:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5 },
  flagDot:    { fontSize: 7, color: DANGER, marginRight: 8, marginTop: 5 },
  flagText:   { fontSize: 13, color: '#aaa', flex: 1, textTransform: 'capitalize' },

  goBackBtn: {
    backgroundColor: YELLOW, borderRadius: 12,
    paddingVertical: 16, width: '100%', alignItems: 'center', marginBottom: 14,
  },
  goBackText: { fontSize: 16, fontWeight: '900', color: '#000' },

  noOptionText: { fontSize: 12, color: '#444', textAlign: 'center' },
});
