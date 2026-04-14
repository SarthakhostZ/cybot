/**
 * src/screens/HomeScreen.tsx
 *
 * Cybot Security Dashboard — Home Page
 *
 * Sections:
 *  1. Header + Security Score Card
 *  2. Daily Cyber Briefing  — today's news summary from RSS feed
 *  3. Breach Checker        — HIBP email breach check (existing backend)
 *  4. Daily Security Tip    — rotating static tip
 *  5. Quick Actions
 *  6. Recent Activity       — last 3 privacy audit results
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp } from '@react-navigation/native';
import { ShieldCheck, AlertTriangle, Lightbulb, Clock, Search } from 'lucide-react-native';

import { supabase } from '@/lib/supabase';
import { api }      from '@/services/api';
import { useAuth }  from '@/hooks/useAuth';
import type { HomeStackParamList, MainTabsParamList } from '@/navigation/AppNavigator';

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, 'Home'>,
  BottomTabNavigationProp<MainTabsParamList>
>;

// ─── Design tokens ─────────────────────────────────────────────────────────────
const YELLOW = '#F5F000';
const BG     = '#000';
const CARD   = '#0f0f0f';
const BORDER = 'rgba(255,255,255,0.06)';

const RISK_COLOR: Record<string, string> = {
  LOW:      '#22c55e',
  MEDIUM:   '#f59e0b',
  HIGH:     '#ef4444',
  CRITICAL: '#dc2626',
};

const CAT_COLOR: Record<string, string> = {
  BREACH:  '#ef4444',
  MALWARE: '#f59e0b',
  PATCH:   '#22c55e',
  ALERT:   '#dc2626',
};

// ─── Daily Security Tips (rotate by day of year) ──────────────────────────────
const TIPS = [
  "Never reuse passwords. Use a password manager like Bitwarden or 1Password.",
  "Enable two-factor authentication (2FA) on every account that supports it.",
  "Keep your OS and apps updated — most breaches exploit known vulnerabilities.",
  "Be suspicious of unsolicited emails asking you to click links or enter credentials.",
  "Use a VPN on public Wi-Fi to encrypt your traffic.",
  "Regularly review which apps have access to your camera, microphone, and location.",
  "Check your email at haveibeenpwned.com to see if you've been in a breach.",
  "Use unique email aliases for different services to limit breach exposure.",
  "Back up important data using the 3-2-1 rule: 3 copies, 2 media types, 1 offsite.",
  "Lock your devices with biometrics or a strong PIN — never use 0000 or 1234.",
  "Avoid clicking shortened URLs (bit.ly, tinyurl) from unknown senders.",
  "Revoke app permissions you no longer use — less access means less risk.",
  "Enable login notifications on your bank, email, and social accounts.",
  "Use HTTPS everywhere — never enter passwords on plain HTTP sites.",
  "Delete old accounts you no longer use — dormant accounts get breached too.",
  "A legitimate company will never ask for your password via email or phone.",
  "Freeze your credit if you're not actively applying for loans — it's free.",
  "Watch out for SIM-swapping — use an authenticator app instead of SMS 2FA.",
  "Encrypt sensitive files before uploading them to cloud storage.",
  "Check your router's admin page — change the default password immediately.",
  "Do not plug in USB drives you find in public — they can be loaded with malware.",
  "Social engineering is the #1 attack vector — trust but always verify.",
  "Use a separate browser profile or device for banking and financial accounts.",
  "Regularly audit your email forwarding rules — attackers set these silently.",
  "Disable Bluetooth and Wi-Fi when not in use in public places.",
  "Your home Wi-Fi should use WPA3 or at minimum WPA2 — never WEP.",
  "A strong password is at least 16 characters — use a passphrase.",
  "Be cautious of QR codes in public — they can redirect to phishing sites.",
  "Secure your DNS — use Cloudflare 1.1.1.1 or Google 8.8.8.8.",
  "Ransomware spreads via email attachments — never open unexpected .exe or .zip files.",
];

function getDailyTip(): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000,
  );
  return TIPS[dayOfYear % TIPS.length];
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DashboardStats {
  security_score: number;
  total_audits:   number;
  total_breaches: number;
  last_audit_at:  string | null;
}

interface RecentAudit {
  id:           string;
  email_scanned: string;
  breach_count:  number;
  risk_level:    string;
  created_at:    string;
}

interface NewsStats {
  total:   number;
  breach:  number;
  malware: number;
  patch:   number;
  alert:   number;
  topHeadline: string | null;
  topSource:   string | null;
}

interface BreachResult {
  breach_count:   number;
  risk_level:     string;
  data_classes:   string[];
  recommendations: string[];
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ label }: { label: string }) {
  return <Text style={styles.sectionTitle}>{label}</Text>;
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function NewsCountBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <View style={[styles.newsBadge, { backgroundColor: color + '18', borderColor: color + '35' }]}>
      <Text style={[styles.newsBadgeCount, { color }]}>{count}</Text>
      <Text style={[styles.newsBadgeLabel, { color: color + 'aa' }]}>{label}</Text>
    </View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { user }       = useAuth();
  const navigation     = useNavigation<Nav>();

  // ── Dashboard data ────────────────────────────────────────────────────────
  const [stats,      setStats]      = useState<DashboardStats | null>(null);
  const [recentAudits, setRecentAudits] = useState<RecentAudit[]>([]);
  const [newsStats,  setNewsStats]  = useState<NewsStats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Breach Checker ────────────────────────────────────────────────────────
  const [email,         setEmail]         = useState('');
  const [checkLoading,  setCheckLoading]  = useState(false);
  const [checkResult,   setCheckResult]   = useState<BreachResult | null>(null);
  const [checkError,    setCheckError]    = useState<string | null>(null);
  const [comingSoon,    setComingSoon]    = useState(false);

  const tip = getDailyTip();

  // ── Load dashboard data ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    const [dashRes, auditRes, newsRes] = await Promise.all([
      // Security score
      user
        ? supabase
            .from('user_security_dashboard')
            .select('security_score,total_audits,total_breaches,last_audit_at')
            .eq('user_id', user.id)
            .single()
        : Promise.resolve({ data: null }),

      // Recent audits
      user
        ? supabase
            .from('privacy_audits')
            .select('id,email_scanned,breach_count,risk_level,created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(3)
        : Promise.resolve({ data: [] }),

      // News briefing — fetch today's articles
      api.get('/threats/news/', { params: { per_page: '50' } }).catch(() => null),
    ]);

    setStats(dashRes.data ?? null);
    setRecentAudits((auditRes.data as RecentAudit[]) ?? []);

    // Build news briefing stats from today's articles
    if (newsRes?.data?.data) {
      const articles = newsRes.data.data as any[];
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayArticles = articles.filter(
        (a) => a.published_at?.startsWith(todayStr),
      );
      const src = todayArticles.length > 0 ? todayArticles : articles.slice(0, 10);

      setNewsStats({
        total:   src.length,
        breach:  src.filter((a) => a.category === 'BREACH').length,
        malware: src.filter((a) => a.category === 'MALWARE').length,
        patch:   src.filter((a) => a.category === 'PATCH').length,
        alert:   src.filter((a) => a.category === 'ALERT').length,
        topHeadline: src[0]?.title ?? null,
        topSource:   src[0]?.source_name ?? null,
      });
    }

    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // ── Breach check ──────────────────────────────────────────────────────────
  async function runBreachCheck() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setCheckError('Enter a valid email address');
      return;
    }
    setCheckLoading(true);
    setCheckResult(null);
    setCheckError(null);
    setComingSoon(false);
    try {
      const { data } = await api.post('/privacy/audit/', { email: trimmed });

      // Backend returns coming_soon when HIBP API key is not configured
      if (data.coming_soon) {
        setComingSoon(true);
        return;
      }

      setCheckResult({
        breach_count:    data.breach_count,
        risk_level:      data.risk_level,
        data_classes:    data.data_classes ?? [],
        recommendations: data.recommendations ?? [],
      });
      // Refresh recent activity to include this new check
      if (user) {
        const { data: fresh } = await supabase
          .from('privacy_audits')
          .select('id,email_scanned,breach_count,risk_level,created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(3);
        setRecentAudits((fresh as RecentAudit[]) ?? []);
      }
    } catch (err: any) {
      setCheckError(
        err?.response?.data?.error ?? 'Check failed. Try again.',
      );
    } finally {
      setCheckLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={YELLOW} />
      </View>
    );
  }

  const score      = stats?.security_score ?? 0;
  const scoreColor = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
  const greeting   = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  })();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={YELLOW}
          />
        }
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.appName}>CYBOT</Text>
            <Text style={styles.greeting}>{greeting}</Text>
          </View>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>
        </View>

        {/* ── Security Score Card ─────────────────────────────────────────── */}
        <View style={styles.scoreCard}>
          <View style={styles.scoreLeft}>
            <Text style={styles.scoreLabel}>SECURITY SCORE</Text>
            <Text style={[styles.scoreValue, { color: scoreColor }]}>
              {stats?.security_score ?? '—'}
            </Text>
            <Text style={styles.scoreOutOf}>out of 100</Text>
          </View>
          <View style={styles.scoreRight}>
            <StatPill label="AUDITS"   value={stats?.total_audits   ?? 0} />
            <StatPill label="BREACHES" value={stats?.total_breaches ?? 0} />
            <StatPill
              label="LAST SCAN"
              value={stats?.last_audit_at
                ? new Date(stats.last_audit_at).toLocaleDateString()
                : 'Never'}
            />
          </View>
        </View>

        {/* ── Daily Cyber Briefing ────────────────────────────────────────── */}
        <SectionTitle label="☀️  TODAY'S BRIEFING" />
        <View style={styles.briefingCard}>
          <View style={styles.briefingHeader}>
            <Text style={styles.briefingDate}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('ThreatsTab')} activeOpacity={0.7}>
              <Text style={styles.briefingAllLink}>View All →</Text>
            </TouchableOpacity>
          </View>

          {newsStats ? (
            <>
              <View style={styles.briefingBadges}>
                {newsStats.breach  > 0 && <NewsCountBadge label="BREACH"  count={newsStats.breach}  color={CAT_COLOR.BREACH}  />}
                {newsStats.malware > 0 && <NewsCountBadge label="MALWARE" count={newsStats.malware} color={CAT_COLOR.MALWARE} />}
                {newsStats.patch   > 0 && <NewsCountBadge label="PATCH"   count={newsStats.patch}   color={CAT_COLOR.PATCH}   />}
                {newsStats.alert   > 0 && <NewsCountBadge label="ALERT"   count={newsStats.alert}   color={CAT_COLOR.ALERT}   />}
              </View>

              {newsStats.topHeadline && (
                <View style={styles.briefingTopStory}>
                  <Text style={styles.briefingTopLabel}>TOP STORY</Text>
                  <Text style={styles.briefingHeadline} numberOfLines={2}>
                    {newsStats.topHeadline}
                  </Text>
                  {newsStats.topSource && (
                    <Text style={styles.briefingSource}>— {newsStats.topSource}</Text>
                  )}
                </View>
              )}

              <Text style={styles.briefingSummary}>
                {newsStats.total} stories tracked today across {' '}
                {[
                  newsStats.breach  > 0 && `${newsStats.breach} breach${newsStats.breach > 1 ? 'es' : ''}`,
                  newsStats.malware > 0 && `${newsStats.malware} malware`,
                  newsStats.patch   > 0 && `${newsStats.patch} patch${newsStats.patch > 1 ? 'es' : ''}`,
                  newsStats.alert   > 0 && `${newsStats.alert} alert${newsStats.alert > 1 ? 's' : ''}`,
                ].filter(Boolean).join(', ')}.
              </Text>
            </>
          ) : (
            <Text style={styles.briefingEmpty}>No news data available right now.</Text>
          )}
        </View>

        {/* ── Breach Checker ─────────────────────────────────────────────── */}
        <SectionTitle label="🔐  EMAIL BREACH CHECK" />
        <View style={styles.breachCard}>
          <Text style={styles.breachSubtitle}>
            Check if your email appeared in any known data breach
          </Text>
          <View style={styles.breachInputRow}>
            <TextInput
              style={styles.breachInput}
              placeholder="your@email.com"
              placeholderTextColor="#333"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={(t) => { setEmail(t); setCheckResult(null); setCheckError(null); }}
              onSubmitEditing={runBreachCheck}
              returnKeyType="search"
            />
            <TouchableOpacity
              style={[styles.breachBtn, checkLoading && { opacity: 0.6 }]}
              onPress={runBreachCheck}
              disabled={checkLoading}
              activeOpacity={0.8}
            >
              {checkLoading
                ? <ActivityIndicator size="small" color="#000" />
                : <Search size={16} color="#000" strokeWidth={2.5} />
              }
            </TouchableOpacity>
          </View>

          {checkError && (
            <Text style={styles.breachError}>{checkError}</Text>
          )}

          {comingSoon && (
            <View style={styles.comingSoonBox}>
              <Text style={styles.comingSoonIcon}>🔜</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.comingSoonTitle}>Coming Soon</Text>
                <Text style={styles.comingSoonText}>
                  Breach checking will be available soon. Stay tuned!
                </Text>
              </View>
            </View>
          )}

          {checkResult && (
            <View style={[
              styles.breachResult,
              { borderColor: (RISK_COLOR[checkResult.risk_level] ?? '#555') + '40' }
            ]}>
              {/* Risk level + count */}
              <View style={styles.breachResultTop}>
                <View style={[
                  styles.riskBadge,
                  { backgroundColor: (RISK_COLOR[checkResult.risk_level] ?? '#555') + '20' }
                ]}>
                  <Text style={[styles.riskBadgeText, { color: RISK_COLOR[checkResult.risk_level] ?? '#555' }]}>
                    {checkResult.risk_level}
                  </Text>
                </View>
                <Text style={styles.breachCount}>
                  {checkResult.breach_count === 0
                    ? '✓ No breaches found'
                    : `Found in ${checkResult.breach_count} breach${checkResult.breach_count > 1 ? 'es' : ''}`
                  }
                </Text>
              </View>

              {/* Data classes exposed */}
              {checkResult.data_classes.length > 0 && (
                <View style={styles.dataClassesWrap}>
                  <Text style={styles.dataClassesLabel}>EXPOSED DATA:</Text>
                  <Text style={styles.dataClassesValue} numberOfLines={2}>
                    {checkResult.data_classes.slice(0, 5).join(' · ')}
                    {checkResult.data_classes.length > 5 ? ` +${checkResult.data_classes.length - 5} more` : ''}
                  </Text>
                </View>
              )}

              {/* Top recommendation */}
              {checkResult.recommendations[0] && (
                <View style={styles.recommendationWrap}>
                  <AlertTriangle size={12} color="#f59e0b" strokeWidth={2} />
                  <Text style={styles.recommendationText} numberOfLines={3}>
                    {checkResult.recommendations[0]}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── Daily Security Tip ──────────────────────────────────────────── */}
        <SectionTitle label="💡  TIP OF THE DAY" />
        <View style={styles.tipCard}>
          <Lightbulb size={18} color={YELLOW} strokeWidth={1.8} style={{ flexShrink: 0 }} />
          <Text style={styles.tipText}>{tip}</Text>
        </View>

        {/* ── Quick Actions ───────────────────────────────────────────────── */}
        <SectionTitle label="⚡  QUICK ACTIONS" />
        <View style={styles.actions}>
          <QuickAction label="Run Audit"   primary onPress={() => navigation.navigate('Privacy')}    />
          <QuickAction label="Ask Cybot"   primary onPress={() => navigation.navigate('Chatbot')}    />
          <QuickAction label="Cyber News"         onPress={() => navigation.navigate('ThreatsTab')} />
          <QuickAction label="ML Analysis"        comingSoon                                         />
        </View>

        {/* ── Recent Activity ─────────────────────────────────────────────── */}
        <SectionTitle label="🕐  RECENT ACTIVITY" />
        {recentAudits.length === 0 ? (
          <View style={styles.emptyActivity}>
            <ShieldCheck size={28} color="#333" strokeWidth={1.5} />
            <Text style={styles.emptyActivityText}>No scans yet. Run your first audit above.</Text>
          </View>
        ) : (
          <View style={styles.activityList}>
            {recentAudits.map((audit) => {
              const riskColor = RISK_COLOR[audit.risk_level] ?? '#555';
              return (
                <View key={audit.id} style={styles.activityRow}>
                  <View style={[styles.activityDot, { backgroundColor: riskColor }]} />
                  <View style={styles.activityContent}>
                    <Text style={styles.activityEmail} numberOfLines={1}>
                      {audit.email_scanned}
                    </Text>
                    <Text style={styles.activityMeta}>
                      {audit.breach_count === 0 ? 'No breaches' : `${audit.breach_count} breach${audit.breach_count > 1 ? 'es' : ''}`}
                      {' · '}
                      {new Date(audit.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={[styles.activityBadge, { backgroundColor: riskColor + '18' }]}>
                    <Text style={[styles.activityBadgeText, { color: riskColor }]}>
                      {audit.risk_level}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Quick Action ──────────────────────────────────────────────────────────────

function QuickAction({ label, onPress, primary, comingSoon }: { label: string; onPress?: () => void; primary?: boolean; comingSoon?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, primary && styles.actionBtnPrimary, comingSoon && styles.actionBtnDisabled]}
      onPress={comingSoon ? undefined : onPress}
      activeOpacity={comingSoon ? 1 : 0.75}
    >
      <Text style={[styles.actionBtnText, primary && styles.actionBtnTextPrimary, comingSoon && styles.actionBtnTextDisabled]}>
        {label}
      </Text>
      {comingSoon && (
        <Text style={styles.comingSoonBadge}>SOON</Text>
      )}
    </TouchableOpacity>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content:   { padding: 20, paddingTop: 64 },

  // Header
  headerRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  appName:         { fontSize: 28, fontWeight: '900', color: YELLOW, letterSpacing: 4 },
  greeting:        { fontSize: 12, color: '#555', fontWeight: '600', marginTop: 3 },
  liveBadge:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: YELLOW + '18', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: YELLOW + '35', alignSelf: 'flex-start', marginTop: 4 },
  liveDot:         { width: 6, height: 6, borderRadius: 3, backgroundColor: YELLOW },
  liveBadgeText:   { color: YELLOW, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },

  // Section title
  sectionTitle: { color: '#444', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 10, marginTop: 4 },

  // Score Card
  scoreCard:  { backgroundColor: CARD, borderRadius: 16, padding: 22, marginBottom: 24, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: BORDER },
  scoreLeft:  { flex: 1 },
  scoreLabel: { color: '#555', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  scoreValue: { fontSize: 60, fontWeight: '900', letterSpacing: -2 },
  scoreOutOf: { color: '#444', fontSize: 12, fontWeight: '600', marginTop: 2 },
  scoreRight: { gap: 12 },
  statPill:   { alignItems: 'flex-end' },
  statValue:  { color: '#fff', fontSize: 15, fontWeight: '800' },
  statLabel:  { color: '#444', fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginTop: 1 },

  // Daily Briefing
  briefingCard:     { backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: BORDER },
  briefingHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  briefingDate:     { color: '#fff', fontSize: 13, fontWeight: '700' },
  briefingAllLink:  { color: YELLOW, fontSize: 12, fontWeight: '700' },
  briefingBadges:   { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  newsBadge:        { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, alignItems: 'center', minWidth: 56 },
  newsBadgeCount:   { fontSize: 18, fontWeight: '900' },
  newsBadgeLabel:   { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  briefingTopStory: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 10, marginBottom: 10, borderLeftWidth: 2, borderLeftColor: YELLOW },
  briefingTopLabel: { color: YELLOW, fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  briefingHeadline: { color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  briefingSource:   { color: '#444', fontSize: 11, marginTop: 4 },
  briefingSummary:  { color: '#555', fontSize: 11, lineHeight: 16 },
  briefingEmpty:    { color: '#444', fontSize: 13 },

  // Breach Checker
  breachCard:      { backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: BORDER },
  breachSubtitle:  { color: '#555', fontSize: 12, marginBottom: 12 },
  breachInputRow:  { flexDirection: 'row', gap: 8, marginBottom: 4 },
  breachInput:     {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  breachBtn:       {
    backgroundColor: YELLOW,
    borderRadius: 10,
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  breachError:     { color: '#ef4444', fontSize: 12, marginTop: 6 },
  comingSoonBox:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, backgroundColor: 'rgba(245,240,0,0.06)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(245,240,0,0.15)' },
  comingSoonIcon:  { fontSize: 22 },
  comingSoonTitle: { color: YELLOW, fontSize: 13, fontWeight: '800', marginBottom: 2 },
  comingSoonText:  { color: '#666', fontSize: 12, lineHeight: 17 },
  breachResult:    { marginTop: 12, borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 },
  breachResultTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  riskBadge:       { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  riskBadgeText:   { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  breachCount:     { color: '#fff', fontSize: 13, fontWeight: '700', flex: 1 },
  dataClassesWrap: { gap: 3 },
  dataClassesLabel:{ color: '#444', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  dataClassesValue:{ color: '#888', fontSize: 11, lineHeight: 16 },
  recommendationWrap: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  recommendationText: { color: '#666', fontSize: 11, lineHeight: 16, flex: 1 },

  // Daily Tip
  tipCard: { backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 24, flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderWidth: 1, borderColor: BORDER, borderLeftWidth: 3, borderLeftColor: YELLOW },
  tipText: { color: '#888', fontSize: 13, lineHeight: 20, flex: 1 },

  // Quick Actions
  actions:              { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  actionBtn:            { flex: 1, minWidth: '45%', backgroundColor: '#111', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  actionBtnPrimary:     { backgroundColor: YELLOW, borderColor: YELLOW },
  actionBtnDisabled:    { opacity: 0.45, borderStyle: 'dashed' },
  actionBtnText:        { color: '#555', fontSize: 13, fontWeight: '700' },
  actionBtnTextPrimary: { color: '#000' },
  actionBtnTextDisabled:{ color: '#444' },
  comingSoonBadge:      { fontSize: 8, fontWeight: '900', color: YELLOW, letterSpacing: 1.2, marginTop: 3, backgroundColor: 'rgba(245,240,0,0.12)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },

  // Recent Activity
  emptyActivity:     { alignItems: 'center', gap: 8, paddingVertical: 20, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 24 },
  emptyActivityText: { color: '#444', fontSize: 12 },
  activityList:      { gap: 8, marginBottom: 24 },
  activityRow:       { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER, gap: 10 },
  activityDot:       { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  activityContent:   { flex: 1 },
  activityEmail:     { color: '#fff', fontSize: 13, fontWeight: '700' },
  activityMeta:      { color: '#555', fontSize: 11, marginTop: 2 },
  activityBadge:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  activityBadgeText: { fontSize: 10, fontWeight: '800' },
});
