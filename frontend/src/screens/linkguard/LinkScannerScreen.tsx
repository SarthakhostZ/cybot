/**
 * LinkScannerScreen.tsx
 *
 * Manual URL scanner — user types a URL, presses Scan, gets a full
 * AI-powered analysis inline (no navigation away from the screen).
 *
 * Features:
 *  - URL validation before any backend call (with inline error message)
 *  - Auto-prefixes https:// when scheme is missing
 *  - Shows safety verdict + score + colored indicator
 *  - AI Analysis card: risk level, confidence, one-line reason, tactics list
 *  - Domain Info card: hostname (where the URL is from), age, SSL, redirects
 *  - Findings list (human-readable reasons from backend)
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { deepScan, type DeepScanResult } from '@/services/linkguard';

// ─── Colours ──────────────────────────────────────────────────────────────────

const YELLOW = '#F5F000';
const GREEN  = '#22c55e';
const ORANGE = '#f59e0b';
const RED    = '#ef4444';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeAndValidate(raw: string): { valid: boolean; url: string; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, url: '', error: 'Please enter a URL.' };
  }

  // Auto-prefix https:// if no scheme given
  let urlStr = trimmed;
  if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
    urlStr = 'https://' + urlStr;
  }

  try {
    const parsed = new URL(urlStr);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, url: '', error: 'Only http and https URLs are accepted.' };
    }

    // Must have a hostname with at least one dot (rejects bare words like "hello")
    const hostname = parsed.hostname;
    if (!hostname || !hostname.includes('.') || hostname.length < 4) {
      return { valid: false, url: '', error: 'Please enter a valid URL (e.g. https://example.com).' };
    }

    return { valid: true, url: urlStr, error: '' };
  } catch {
    return { valid: false, url: '', error: 'Please enter a valid URL (e.g. https://example.com).' };
  }
}

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function verdictColor(verdict: string) {
  if (verdict === 'safe') return GREEN;
  if (verdict === 'suspicious') return ORANGE;
  return RED;
}

function verdictIcon(verdict: string) {
  if (verdict === 'safe') return '✓';
  if (verdict === 'suspicious') return '!';
  return '✕';
}

function verdictLabel(verdict: string) {
  if (verdict === 'safe') return 'Safe';
  if (verdict === 'suspicious') return 'Suspicious';
  return 'Dangerous';
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LinkScannerScreen() {
  const [input,     setInput]     = useState('');
  const [urlError,  setUrlError]  = useState('');
  const [scanning,  setScanning]  = useState(false);
  const [result,    setResult]    = useState<DeepScanResult | null>(null);
  const [scanError, setScanError] = useState('');

  const handleScan = async () => {
    // Reset previous state
    setResult(null);
    setScanError('');

    const { valid, url, error } = normalizeAndValidate(input);
    if (!valid) {
      setUrlError(error);
      return;
    }
    setUrlError('');
    setScanning(true);

    try {
      const res = await deepScan(url, 100, []);
      setResult(res);
    } catch {
      setScanError('Scan failed. Please check your connection and try again.');
    } finally {
      setScanning(false);
    }
  };

  const handleInputChange = (text: string) => {
    setInput(text);
    // Clear error as soon as user starts editing
    if (urlError) setUrlError('');
    if (scanError) setScanError('');
  };

  const color    = result ? verdictColor(result.verdict) : YELLOW;
  const hostname = result ? extractHostname(result.url) : '';

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <Text style={styles.title}>LINK SCANNER</Text>
        <Text style={styles.subtitle}>Enter any URL to scan for threats & AI analysis</Text>

        {/* ── URL Input ───────────────────────────────────────────────── */}
        <View style={[styles.inputWrapper, urlError ? styles.inputError : null]}>
          <TextInput
            style={styles.input}
            placeholder="https://example.com"
            placeholderTextColor="#444"
            value={input}
            onChangeText={handleInputChange}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            onSubmitEditing={handleScan}
          />
        </View>

        {urlError ? (
          <View style={styles.errorRow}>
            <Text style={styles.errorIcon}>⚠</Text>
            <Text style={styles.errorText}>{urlError}</Text>
          </View>
        ) : null}

        {/* ── Scan Button ─────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.scanBtn, scanning && styles.scanBtnDisabled]}
          onPress={handleScan}
          disabled={scanning}
          activeOpacity={0.85}
        >
          {scanning ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.scanBtnText}>SCAN URL</Text>
          )}
        </TouchableOpacity>

        {scanError ? (
          <Text style={styles.scanError}>{scanError}</Text>
        ) : null}

        {/* ── Scan Result ─────────────────────────────────────────────── */}
        {result && !scanning && (
          <View style={styles.resultSection}>

            {/* Verdict badge */}
            <View style={[styles.verdictCard, { borderColor: color + '44', backgroundColor: color + '14' }]}>
              <View style={[styles.verdictCircle, { backgroundColor: color, shadowColor: color }]}>
                <Text style={styles.verdictCircleText}>{verdictIcon(result.verdict)}</Text>
              </View>
              <View style={styles.verdictMeta}>
                <Text style={[styles.verdictLabel, { color }]}>{verdictLabel(result.verdict)}</Text>
                <Text style={styles.verdictScore}>Safety Score: {result.final_score} / 100</Text>
              </View>
            </View>

            {/* Domain Info */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>DOMAIN INFO</Text>
              <Text style={styles.domainHost}>{hostname}</Text>
              <View style={styles.pillRow}>
                <InfoPill
                  label="AGE"
                  value={result.domain?.age_days != null
                    ? `${result.domain.age_days} days`
                    : 'Unknown'}
                />
                <InfoPill
                  label="SSL"
                  value={
                    result.domain?.ssl_valid === true  ? 'Valid ✓' :
                    result.domain?.ssl_valid === false ? 'Invalid ✗' :
                    'Unknown'
                  }
                  valueColor={
                    result.domain?.ssl_valid === true  ? GREEN :
                    result.domain?.ssl_valid === false ? RED :
                    undefined
                  }
                />
                <InfoPill
                  label="REDIRECTS"
                  value={`${result.domain?.redirect_count ?? 0}`}
                />
              </View>
            </View>

            {/* AI Analysis */}
            {result.ai_analysis && (
              <View style={[styles.card, styles.aiCard, { borderColor: color + '44' }]}>
                <Text style={[styles.cardLabel, { color }]}>AI ANALYSIS</Text>

                <View style={styles.aiTopRow}>
                  <View style={[styles.riskBadge, { backgroundColor: color + '22', borderColor: color + '55' }]}>
                    <Text style={[styles.riskBadgeText, { color }]}>
                      {result.ai_analysis.risk.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.confidence}>
                    Confidence: {result.ai_analysis.confidence}%
                  </Text>
                </View>

                {result.ai_analysis.reason ? (
                  <Text style={styles.aiReason}>{result.ai_analysis.reason}</Text>
                ) : null}

                {result.ai_analysis.tactics && result.ai_analysis.tactics.length > 0 && (
                  <View style={styles.tacticsBlock}>
                    <Text style={styles.tacticsLabel}>DETECTED TACTICS</Text>
                    {result.ai_analysis.tactics.map((tactic, i) => (
                      <View key={i} style={styles.bulletRow}>
                        <Text style={[styles.bullet, { color }]}>●</Text>
                        <Text style={styles.bulletText}>{tactic}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Findings / reasons */}
            {result.reasons && result.reasons.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>FINDINGS</Text>
                {result.reasons.map((reason, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <Text style={[styles.bullet, { color }]}>●</Text>
                    <Text style={styles.bulletText}>{reason}</Text>
                  </View>
                ))}
              </View>
            )}

          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Sub-component ────────────────────────────────────────────────────────────

function InfoPill({ label, value, valueColor }: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={pillStyles.container}>
      <Text style={pillStyles.label}>{label}</Text>
      <Text style={[pillStyles.value, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  label:     { fontSize: 9, color: '#444', fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  value:     { fontSize: 12, color: '#aaa', fontWeight: '700' },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#000' },
  content: { padding: 20, paddingTop: 20, paddingBottom: 48 },

  title:    { fontSize: 22, fontWeight: '900', color: YELLOW, letterSpacing: 3, marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#555', marginBottom: 24 },

  inputWrapper: {
    backgroundColor: '#111',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  inputError: { borderColor: RED + 'AA' },
  input: { color: '#fff', fontSize: 15, fontFamily: 'monospace' },

  errorRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 },
  errorIcon: { fontSize: 13, color: RED },
  errorText: { fontSize: 13, color: RED, flex: 1 },

  scanBtn: {
    backgroundColor: YELLOW,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  scanBtnDisabled: { opacity: 0.6 },
  scanBtnText: { fontSize: 15, fontWeight: '900', color: '#000', letterSpacing: 1.5 },

  scanError: { color: RED, fontSize: 13, textAlign: 'center', marginBottom: 16 },

  // Result section
  resultSection: { gap: 14 },

  verdictCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 18,
  },
  verdictCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  verdictCircleText: { fontSize: 26, color: '#fff', fontWeight: '900' },
  verdictMeta:       { flex: 1 },
  verdictLabel:      { fontSize: 24, fontWeight: '900' },
  verdictScore:      { fontSize: 13, color: '#555', marginTop: 4 },

  card: {
    backgroundColor: '#111',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  aiCard: { borderWidth: 1 },
  cardLabel: {
    fontSize: 10,
    color: '#555',
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 12,
  },

  domainHost: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '800',
    fontFamily: 'monospace',
    marginBottom: 14,
  },
  pillRow: { flexDirection: 'row', gap: 8 },

  aiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  riskBadge: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
  },
  riskBadgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  confidence:    { fontSize: 13, color: '#666' },
  aiReason:      { fontSize: 14, color: '#bbb', lineHeight: 22 },

  tacticsBlock: { marginTop: 14 },
  tacticsLabel: {
    fontSize: 9,
    color: '#555',
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 8,
  },

  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  bullet:    { fontSize: 7, marginRight: 8, marginTop: 7 },
  bulletText: { fontSize: 13, color: '#aaa', flex: 1, lineHeight: 20 },
});
