/**
 * src/screens/PrivacyAuditScreen.tsx
 *
 * AI-powered Link Security Scanner.
 * URL → fastScan (client, instant) → deepScan (Cybot + server) → rich result
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Animated,
} from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { MessageSquare, Calendar, Lock, ShieldCheck, CornerDownRight } from 'lucide-react-native';
import { fastScan, deepScan, FastScanResult, DeepScanResult } from '@/services/linkguard';

// ─── Constants ────────────────────────────────────────────────────────────────

const CYAN     = '#00E5FF';
const BG       = '#080810';
const CARD_BG  = '#0F0F1A';
const BORDER   = 'rgba(0,229,255,0.07)';

const RISK_COLOR: Record<string, string> = {
  Safe:      '#22c55e',
  Suspicious:'#f59e0b',
  Dangerous: '#ef4444',
  Unknown:   '#555',
};

const VERDICT_COLOR: Record<string, string> = {
  safe:       '#22c55e',
  suspicious: '#f59e0b',
  dangerous:  '#ef4444',
};

// ─── Score Ring ───────────────────────────────────────────────────────────────

const RING_SIZE     = 130;
const STROKE_W      = 11;
const RADIUS        = (RING_SIZE - STROKE_W) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ScoreRing({ score, verdict }: { score: number; verdict: string }) {
  const color  = VERDICT_COLOR[verdict] ?? '#555';
  const filled = CIRCUMFERENCE * (1 - score / 100);
  return (
    <View style={ringStyles.wrapper}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <G rotation="-90" origin={`${RING_SIZE / 2},${RING_SIZE / 2}`}>
          <Circle
            cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RADIUS}
            stroke="rgba(255,255,255,0.06)" strokeWidth={STROKE_W} fill="none"
          />
          <Circle
            cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RADIUS}
            stroke={color} strokeWidth={STROKE_W} fill="none"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={filled} strokeLinecap="round"
          />
        </G>
      </Svg>
      <View style={ringStyles.labelBox}>
        <Text style={[ringStyles.score, { color }]}>{score}</Text>
        <Text style={ringStyles.outOf}>/100</Text>
      </View>
    </View>
  );
}

const ringStyles = StyleSheet.create({
  wrapper:  { width: RING_SIZE, height: RING_SIZE, justifyContent: 'center', alignItems: 'center' },
  labelBox: { position: 'absolute', alignItems: 'center' },
  score:    { fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  outOf:    { fontSize: 11, color: '#444', fontWeight: '700', marginTop: -2 },
});

// ─── Confidence Bar ───────────────────────────────────────────────────────────

function ConfidenceBar({ value, color }: { value: number; color: string }) {
  return (
    <View style={confStyles.track}>
      <View style={[confStyles.fill, { width: `${value}%` as any, backgroundColor: color }]} />
    </View>
  );
}

const confStyles = StyleSheet.create({
  track: { height: 5, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden', flex: 1, marginLeft: 10 },
  fill:  { height: '100%', borderRadius: 4 },
});

// ─── AI Analysis Card ─────────────────────────────────────────────────────────

function AICard({ ai }: { ai: DeepScanResult['ai_analysis'] }) {
  if (!ai) {
    return (
      <View style={aiStyles.card}>
        <View style={aiStyles.headerRow}>
          <View style={aiStyles.gptBadge}><Text style={aiStyles.gptText}>Cybot</Text></View>
          <Text style={aiStyles.title}>AI Analysis</Text>
        </View>
        <Text style={aiStyles.unavailable}>AI analysis unavailable for this scan.</Text>
      </View>
    );
  }

  const riskColor = RISK_COLOR[ai.risk] ?? '#555';

  return (
    <View style={[aiStyles.card, { borderColor: riskColor + '33' }]}>
      <View style={aiStyles.headerRow}>
        <View style={aiStyles.gptBadge}><Text style={aiStyles.gptText}>Cybot</Text></View>
        <Text style={aiStyles.title}>AI Analysis</Text>
        <View style={[aiStyles.riskChip, { backgroundColor: riskColor + '22', borderColor: riskColor }]}>
          <Text style={[aiStyles.riskChipText, { color: riskColor }]}>{ai.risk.toUpperCase()}</Text>
        </View>
      </View>

      <View style={aiStyles.confRow}>
        <Text style={aiStyles.confLabel}>Confidence</Text>
        <ConfidenceBar value={ai.confidence} color={riskColor} />
        <Text style={[aiStyles.confValue, { color: riskColor }]}>{ai.confidence}%</Text>
      </View>

      <View style={aiStyles.reasonBox}>
        <MessageSquare size={14} color="#5A5A7A" strokeWidth={2} style={{ marginTop: 2, flexShrink: 0 }} />
        <Text style={aiStyles.reasonText}>{ai.reason}</Text>
      </View>
    </View>
  );
}

const aiStyles = StyleSheet.create({
  card:         { backgroundColor: CARD_BG, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: BORDER },
  headerRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 8 },
  gptBadge:     { backgroundColor: '#00E5FF22', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#00E5FF55' },
  gptText:      { color: '#00E5FF', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  title:        { color: '#fff', fontSize: 14, fontWeight: '800', flex: 1 },
  riskChip:     { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  riskChipText: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  confRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  confLabel:    { color: '#555', fontSize: 11, fontWeight: '700' },
  confValue:    { fontSize: 11, fontWeight: '900', marginLeft: 8, minWidth: 32, textAlign: 'right' },
  reasonBox:    { flexDirection: 'row', backgroundColor: '#06060E', borderRadius: 8, padding: 12, gap: 8, borderWidth: 1, borderColor: 'rgba(0,229,255,0.06)' },
  reasonText:   { color: '#aaa', fontSize: 13, lineHeight: 21, flex: 1 },
  unavailable:  { color: '#444', fontSize: 12 },
});

// ─── Signal Cell ──────────────────────────────────────────────────────────────

interface SignalProps {
  label: string;
  value: string;
  sub?: string;
  color: string;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
}

function SignalCell({ label, value, sub, color, Icon }: SignalProps) {
  return (
    <View style={sigStyles.cell}>
      <View style={sigStyles.iconBox}>
        <Icon size={18} color={color} strokeWidth={2} />
      </View>
      <Text style={[sigStyles.value, { color }]}>{value}</Text>
      {sub ? <Text style={sigStyles.sub}>{sub}</Text> : null}
      <Text style={sigStyles.label}>{label}</Text>
    </View>
  );
}

const sigStyles = StyleSheet.create({
  cell:    { flex: 1, backgroundColor: CARD_BG, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: BORDER, minHeight: 90 },
  iconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(0,229,255,0.08)', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  value:   { fontSize: 15, fontWeight: '900', marginBottom: 2 },
  sub:     { color: '#5A5A7A', fontSize: 10, fontWeight: '600', marginBottom: 2 },
  label:   { color: '#5A5A7A', fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textAlign: 'center' },
});

// ─── Flag Chip ────────────────────────────────────────────────────────────────

const FLAG_LABEL: Record<string, string> = {
  no_https:             'No HTTPS',
  ip_based_url:         'IP URL',
  url_shortener:        'URL Shortener',
  double_extension:     'Double Extension',
  at_symbol_in_url:     'Credentials in URL',
  homoglyph_characters: 'Homoglyph',
  invalid_url:          'Invalid URL',
  non_http_passthrough: 'Non-HTTP Scheme',
  new_domain:           'New Domain',
  suspicious_redirect:  'Suspicious Redirect',
};

function humanFlag(flag: string): string {
  if (FLAG_LABEL[flag]) return FLAG_LABEL[flag];
  if (flag.startsWith('suspicious_keyword:')) return `Keyword: "${flag.split(':')[1]}"`;
  if (flag.startsWith('excessive_url_length:')) return 'Very Long URL';
  if (flag.startsWith('long_url:')) return 'Long URL';
  if (flag.startsWith('excessive_subdomains:')) return 'Many Subdomains';
  if (flag.startsWith('gsb:')) return `GSB: ${flag.split(':')[1]}`;
  if (flag.startsWith('domain_age_days:')) return 'New Domain';
  return flag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function FlagChip({ flag }: { flag: string }) {
  const isDanger = flag.startsWith('gsb:') || flag === 'ip_based_url' || flag === 'double_extension' || flag === 'invalid_url';
  const isWarn   = !isDanger;
  const color    = isDanger ? '#ef4444' : '#f59e0b';

  return (
    <View style={[chipStyles.chip, { borderColor: color + '44', backgroundColor: color + '11' }]}>
      <Text style={[chipStyles.text, { color }]}>{humanFlag(flag)}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: { borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, marginRight: 6, marginBottom: 6 },
  text: { fontSize: 11, fontWeight: '700' },
});

// ─── Redirect Chain ───────────────────────────────────────────────────────────

function RedirectChain({ chain }: { chain: string[] }) {
  if (!chain || chain.length <= 1) return null;
  return (
    <View style={rdStyles.box}>
      <Text style={rdStyles.title}>REDIRECT CHAIN</Text>
      {chain.map((url, i) => (
        <View key={i} style={rdStyles.row}>
          <View style={rdStyles.dot} />
          <Text style={rdStyles.url} numberOfLines={1}>{url}</Text>
        </View>
      ))}
    </View>
  );
}

const rdStyles = StyleSheet.create({
  box:   { backgroundColor: CARD_BG, borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: BORDER },
  title: { color: '#444', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 10 },
  row:   { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  dot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b', marginRight: 8 },
  url:   { color: '#666', fontSize: 12, flex: 1 },
});

// ─── Result Panel ─────────────────────────────────────────────────────────────

function formatDomainAge(days: number | null): { value: string; sub?: string; color: string } {
  if (days === null) return { value: 'Unknown', color: '#555' };
  if (days < 30)  return { value: `${days}d`, sub: 'Very new', color: '#ef4444' };
  if (days < 180) return { value: `${Math.floor(days / 30)}mo`, sub: 'New', color: '#f59e0b' };
  if (days < 365) return { value: `${Math.floor(days / 30)}mo`, color: '#f59e0b' };
  return { value: `${Math.floor(days / 365)}yr`, sub: `${Math.floor(days / 30)}mo`, color: '#22c55e' };
}

function ResultPanel({ result }: { result: DeepScanResult; }) {
  const { ai_analysis, domain_age_days, ssl_valid, redirect_chain, google_safe_browsing, flags, final_score, verdict } = result;

  const domainAge = formatDomainAge(domain_age_days);

  const sslColor = ssl_valid === null ? '#555' : ssl_valid ? '#22c55e' : '#ef4444';
  const sslValue = ssl_valid === null ? 'N/A' : ssl_valid ? 'Valid' : 'Invalid';

  const gsbFlagged = google_safe_browsing?.flagged ?? false;
  const gsbColor   = gsbFlagged ? '#ef4444' : '#22c55e';
  const gsbValue   = gsbFlagged ? 'Flagged' : 'Clean';

  const redirectCount = redirect_chain ? Math.max(0, redirect_chain.length - 1) : 0;
  const rdColor = redirectCount === 0 ? '#22c55e' : redirectCount <= 2 ? '#f59e0b' : '#ef4444';

  return (
    <View>
      {/* Score header */}
      <View style={rpStyles.header}>
        <ScoreRing score={final_score} verdict={verdict} />
        <View style={rpStyles.headerRight}>
          <View style={[rpStyles.verdictBadge, { backgroundColor: VERDICT_COLOR[verdict] + '22', borderColor: VERDICT_COLOR[verdict] }]}>
            <Text style={[rpStyles.verdictText, { color: VERDICT_COLOR[verdict] }]}>
              {verdict.toUpperCase()}
            </Text>
          </View>
          <Text style={rpStyles.scoreLabel}>Security Score</Text>
          <Text style={rpStyles.urlText} numberOfLines={3}>{result.redirect_chain?.[0] ?? '—'}</Text>
        </View>
      </View>

      {/* AI Analysis */}
      <AICard ai={ai_analysis} />

      {/* Signal grid */}
      <Text style={rpStyles.sectionTitle}>SECURITY SIGNALS</Text>
      <View style={rpStyles.signalRow}>
        <SignalCell
          label="DOMAIN AGE"
          Icon={Calendar}
          value={domainAge.value}
          sub={domainAge.sub}
          color={domainAge.color}
        />
        <View style={{ width: 10 }} />
        <SignalCell
          label="SSL CERT"
          Icon={Lock}
          value={sslValue}
          color={sslColor}
        />
      </View>
      <View style={[rpStyles.signalRow, { marginTop: 10 }]}>
        <SignalCell
          label="GOOGLE SAFE BROWSING"
          Icon={ShieldCheck}
          value={gsbValue}
          sub={gsbFlagged ? google_safe_browsing?.threats?.join(', ') : undefined}
          color={gsbColor}
        />
        <View style={{ width: 10 }} />
        <SignalCell
          label="REDIRECTS"
          Icon={CornerDownRight}
          value={redirectCount === 0 ? 'None' : `${redirectCount}x`}
          color={rdColor}
        />
      </View>

      {/* Flags */}
      {flags && flags.length > 0 && (
        <>
          <Text style={[rpStyles.sectionTitle, { marginTop: 18 }]}>DETECTED ISSUES</Text>
          <View style={rpStyles.flagsWrap}>
            {flags.map((f, i) => <FlagChip key={i} flag={f} />)}
          </View>
        </>
      )}

      {/* Redirect chain */}
      {redirect_chain && redirect_chain.length > 1 && (
        <>
          <Text style={[rpStyles.sectionTitle, { marginTop: 18 }]}>REDIRECT CHAIN</Text>
          <View style={rdChainStyles.box}>
            {redirect_chain.map((url, i) => (
              <View key={i} style={rdChainStyles.row}>
                <View style={[rdChainStyles.stepBadge, i === redirect_chain.length - 1 && rdChainStyles.finalBadge]}>
                  <Text style={rdChainStyles.stepText}>{i === 0 ? 'START' : i === redirect_chain.length - 1 ? 'END' : `HOP ${i}`}</Text>
                </View>
                <Text style={rdChainStyles.url} numberOfLines={1}>{url}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Scan metadata */}
      <View style={rpStyles.metaBox}>
        <Text style={rpStyles.metaText}>
          Scanned {result.scanned_at ? new Date(result.scanned_at).toLocaleString() : 'just now'}
        </Text>
        {result.scan_id && (
          <Text style={rpStyles.metaId} numberOfLines={1}>ID: {String(result.scan_id).slice(0, 8)}…</Text>
        )}
      </View>
    </View>
  );
}

const rpStyles = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD_BG, borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: BORDER },
  headerRight:  { flex: 1, marginLeft: 16 },
  verdictBadge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 8 },
  verdictText:  { fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  scoreLabel:   { color: '#444', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
  urlText:      { color: '#444', fontSize: 11, lineHeight: 16 },
  sectionTitle: { color: '#333', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 10 },
  signalRow:    { flexDirection: 'row' },
  flagsWrap:    { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  metaBox:      { paddingTop: 14, paddingBottom: 4, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)', marginTop: 14 },
  metaText:     { color: '#333', fontSize: 11 },
  metaId:       { color: '#2a2a2a', fontSize: 10, marginTop: 3 },
});

const rdChainStyles = StyleSheet.create({
  box:        { backgroundColor: CARD_BG, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 4 },
  row:        { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stepBadge:  { backgroundColor: '#12121E', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3, marginRight: 10, borderWidth: 1, borderColor: '#f59e0b44', minWidth: 50, alignItems: 'center' },
  finalBadge: { borderColor: '#22c55e44' },
  stepText:   { color: '#f59e0b', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  url:        { color: '#555', fontSize: 11, flex: 1 },
});

// ─── Offline Fallback Panel ───────────────────────────────────────────────────

function OfflinePanel({ fastResult, url }: { fastResult: FastScanResult; url: string }) {
  const verdict = fastResult.verdict as string;
  return (
    <View>
      <View style={rpStyles.header}>
        <ScoreRing score={fastResult.score} verdict={verdict} />
        <View style={rpStyles.headerRight}>
          <View style={[rpStyles.verdictBadge, { backgroundColor: VERDICT_COLOR[verdict] + '22', borderColor: VERDICT_COLOR[verdict] }]}>
            <Text style={[rpStyles.verdictText, { color: VERDICT_COLOR[verdict] }]}>
              {verdict.toUpperCase()}
            </Text>
          </View>
          <Text style={rpStyles.scoreLabel}>CLIENT-SIDE ONLY</Text>
          <Text style={rpStyles.urlText} numberOfLines={2}>{url}</Text>
        </View>
      </View>

      <View style={offStyles.banner}>
        <Text style={offStyles.title}>OFFLINE SCAN</Text>
        <Text style={offStyles.body}>
          Server unreachable. Showing instant client-side analysis — SSL certificate, domain age, blacklist checks and AI verdict require the backend.
        </Text>
      </View>

      {fastResult.flags.length > 0 && (
        <>
          <Text style={[rpStyles.sectionTitle, { marginTop: 14 }]}>DETECTED ISSUES</Text>
          <View style={rpStyles.flagsWrap}>
            {fastResult.flags.map((f, i) => <FlagChip key={i} flag={f} />)}
          </View>
        </>
      )}

      {fastResult.whitelisted && (
        <View style={offStyles.whitelist}>
          <Text style={offStyles.whitelistText}>Domain is on the trusted whitelist.</Text>
        </View>
      )}
    </View>
  );
}

const offStyles = StyleSheet.create({
  banner:        { backgroundColor: '#0A0A14', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#f59e0b33', marginBottom: 14 },
  title:         { color: '#f59e0b', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 6 },
  body:          { color: '#666', fontSize: 12, lineHeight: 18 },
  whitelist:     { backgroundColor: '#05100A', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#22c55e33' },
  whitelistText: { color: '#22c55e', fontSize: 12 },
});

// ─── Scanning animation text ──────────────────────────────────────────────────

const SCAN_STEPS = [
  'Running client-side analysis…',
  'Checking SSL certificate…',
  'Querying Google Safe Browsing…',
  'Performing WHOIS domain lookup…',
  'Tracing redirect chain…',
  'Asking Cybot for AI verdict…',
  'Computing hybrid security score…',
];

function ScanningIndicator() {
  const [step, setStep] = React.useState(0);

  React.useEffect(() => {
    const t = setInterval(() => setStep(s => (s + 1) % SCAN_STEPS.length), 1800);
    return () => clearInterval(t);
  }, []);

  return (
    <View style={scanStyles.box}>
      <ActivityIndicator color={CYAN} size="small" style={{ marginBottom: 10 }} />
      <Text style={scanStyles.step}>{SCAN_STEPS[step]}</Text>
      <Text style={scanStyles.note}>Deep AI scan — usually takes 5–15 seconds</Text>
    </View>
  );
}

const scanStyles = StyleSheet.create({
  box:  { backgroundColor: CARD_BG, borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: BORDER, marginTop: 8 },
  step: { color: '#aaa', fontSize: 13, marginBottom: 6, textAlign: 'center' },
  note: { color: '#333', fontSize: 11, textAlign: 'center' },
});

// ─── State ────────────────────────────────────────────────────────────────────

type ScanState =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'deep'; result: DeepScanResult }
  | { kind: 'offline'; fast: FastScanResult; url: string }
  | { kind: 'error'; message: string };

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PrivacyAuditScreen() {
  const [url,   setUrl]   = useState('');
  const [state, setState] = useState<ScanState>({ kind: 'idle' });
  const scrollRef         = useRef<ScrollView>(null);

  async function runScan() {
    const trimmed = url.trim();
    if (!trimmed) {
      setState({ kind: 'error', message: 'Enter a URL to scan.' });
      return;
    }

    // Normalise: add https:// if the user typed a bare domain
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    // Validate: must be a parseable URL with a proper hostname (e.g. has a dot, min length)
    try {
      const parsed = new URL(normalized);
      const hostname = parsed.hostname.replace(/^www\./, '');
      // Must have at least one dot and a minimum length like "a.io"
      if (!hostname.includes('.') || hostname.length < 4) {
        setState({ kind: 'error', message: 'Enter a valid URL — e.g. https://example.com' });
        return;
      }
      // TLD must be at least 2 chars
      const parts = hostname.split('.');
      const tld = parts[parts.length - 1];
      if (!tld || tld.length < 2) {
        setState({ kind: 'error', message: 'Enter a valid URL — e.g. https://example.com' });
        return;
      }
      // Domain label before TLD must exist and be non-empty
      if (!parts[parts.length - 2] || parts[parts.length - 2].length < 1) {
        setState({ kind: 'error', message: 'Enter a valid URL — e.g. https://example.com' });
        return;
      }
    } catch {
      setState({ kind: 'error', message: 'Enter a valid URL — e.g. https://example.com' });
      return;
    }

    // Keep the input box showing normalized URL
    setUrl(normalized);

    setState({ kind: 'scanning' });

    // Tier-1: instant client-side scan
    const fast = fastScan(normalized);

    try {
      // Tier-2: full backend + Cybot deep scan
      const deep = await deepScan(normalized, fast.score, fast.flags);
      setState({ kind: 'deep', result: deep });
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    } catch (err: any) {
      // Only fall back to offline on genuine network errors (no response from server)
      if (!err?.response) {
        setState({ kind: 'offline', fast, url: normalized });
      } else {
        // Server returned an error — show the message instead of fake offline result
        const msg =
          err.response?.data?.url?.[0] ??
          err.response?.data?.error ??
          `Scan failed (HTTP ${err.response?.status}). Check the URL and try again.`;
        setState({ kind: 'error', message: msg });
      }
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    }
  }

  function reset() {
    setUrl('');
    setState({ kind: 'idle' });
  }

  const isLoading = state.kind === 'scanning';
  const hasResult = state.kind === 'deep' || state.kind === 'offline';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Text style={styles.header}>Link Scanner</Text>
        <View style={styles.aiTagRow}>
          <View style={styles.aiTag}><Text style={styles.aiTagText}>Cybot</Text></View>
          <View style={styles.aiTag}><Text style={styles.aiTagText}>SSL</Text></View>
          <View style={styles.aiTag}><Text style={styles.aiTagText}>WHOIS</Text></View>
          <View style={styles.aiTag}><Text style={styles.aiTagText}>Safe Browsing</Text></View>
        </View>
        <Text style={styles.subtitle}>
          AI-powered deep analysis — SSL, domain age, blacklists, redirect chains, and Cybot threat verdict.
        </Text>

        {/* Input */}
        <TextInput
          style={[styles.input, isLoading && styles.inputDisabled]}
          placeholder="https://example.com"
          placeholderTextColor="#333"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={url}
          onChangeText={t => { setUrl(t); if (state.kind === 'error') setState({ kind: 'idle' }); }}
          editable={!isLoading}
          returnKeyType="go"
          onSubmitEditing={runScan}
        />

        {state.kind === 'error' && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{state.message}</Text>
          </View>
        )}

        {/* Buttons */}
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.btn, isLoading && styles.btnDisabled]}
            onPress={runScan}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.btnText}>Scan URL</Text>
            }
          </TouchableOpacity>

          {hasResult && (
            <TouchableOpacity style={styles.clearBtn} onPress={reset} activeOpacity={0.7}>
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Scanning animation */}
        {isLoading && <ScanningIndicator />}

        {/* Results */}
        {state.kind === 'deep' && (
          <ResultPanel result={state.result} />
        )}

        {state.kind === 'offline' && (
          <OfflinePanel fastResult={state.fast} url={state.url} />
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Root Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex:        { flex: 1, backgroundColor: BG },
  container:   { flex: 1, backgroundColor: BG },
  content:     { paddingHorizontal: 18, paddingTop: 60, paddingBottom: 20 },

  header:      { fontSize: 30, fontWeight: '900', color: '#fff', letterSpacing: -0.5, marginBottom: 10 },

  aiTagRow:    { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 },
  aiTag:       { backgroundColor: '#141414', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: BORDER },
  aiTagText:   { color: '#555', fontSize: 10, fontWeight: '700' },

  subtitle:    { color: '#444', fontSize: 12, lineHeight: 18, marginBottom: 22 },

  input: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.1)',
    borderRadius: 13,
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: '#fff',
    fontSize: 14,
    marginBottom: 10,
  },
  inputDisabled: { opacity: 0.45 },

  errorBox:  { backgroundColor: '#110808', borderRadius: 9, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#ef444433' },
  errorText: { color: '#f87171', fontSize: 13 },

  btnRow:    { flexDirection: 'row', gap: 10, marginBottom: 6 },
  btn:       { flex: 1, backgroundColor: CYAN, borderRadius: 13, paddingVertical: 15, alignItems: 'center' },
  btnDisabled: { opacity: 0.55 },
  btnText:   { color: '#000', fontWeight: '900', fontSize: 15 },
  clearBtn:  { backgroundColor: CARD_BG, borderRadius: 13, paddingVertical: 15, paddingHorizontal: 20, alignItems: 'center', borderWidth: 1, borderColor: BORDER },
  clearText: { color: '#555', fontWeight: '700', fontSize: 15 },
});
