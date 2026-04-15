/**
 * src/screens/SecurityTipsScreen.tsx
 *
 * Curated security tips organised by category.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  ArrowLeft,
  ShieldCheck,
  Lock,
  Wifi,
  Smartphone,
  Eye,
  Link,
  Key,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react-native';

const CYAN   = '#00E5FF';
const BG     = '#080810';
const CARD   = '#0F0F1A';
const MUTED  = '#5A5A7A';
const GREEN  = '#00E096';
const YELLOW = '#FFD600';
const RED    = '#FF4C6A';

// ─── Data ─────────────────────────────────────────────────────────────────────

interface Tip {
  id:          string;
  title:       string;
  description: string;
  severity:    'high' | 'medium' | 'low';
}

interface Category {
  id:    string;
  label: string;
  icon:  React.ReactNode;
  color: string;
  tips:  Tip[];
}

const CATEGORIES: Category[] = [
  {
    id:    'passwords',
    label: 'Passwords',
    icon:  <Key size={18} color="#FFD600" strokeWidth={2} />,
    color: YELLOW,
    tips: [
      {
        id: 'p1',
        title: 'Use a password manager',
        description:
          'Store all your passwords in a reputable password manager (e.g. Bitwarden, 1Password). Never reuse the same password across accounts.',
        severity: 'high',
      },
      {
        id: 'p2',
        title: 'Enable two-factor authentication',
        description:
          'Turn on 2FA on every account that supports it. Use an authenticator app (TOTP) rather than SMS wherever possible.',
        severity: 'high',
      },
      {
        id: 'p3',
        title: 'Make passwords long and random',
        description:
          'A strong password is at least 16 characters and randomly generated. Passphrases of 4–5 random words also work well.',
        severity: 'medium',
      },
      {
        id: 'p4',
        title: 'Change compromised passwords immediately',
        description:
          'Check haveibeenpwned.com regularly. If your email appears in a breach, change the password for that service right away.',
        severity: 'high',
      },
    ],
  },
  {
    id:    'phishing',
    label: 'Phishing',
    icon:  <Link size={18} color={CYAN} strokeWidth={2} />,
    color: CYAN,
    tips: [
      {
        id: 'ph1',
        title: 'Verify links before clicking',
        description:
          'Hover over (or long-press on mobile) links to see the real URL. Scan suspicious links with CyBot before opening them.',
        severity: 'high',
      },
      {
        id: 'ph2',
        title: 'Check the sender address carefully',
        description:
          'Phishing emails often spoof display names. Always check the actual email domain — "support@paypa1.com" is not PayPal.',
        severity: 'high',
      },
      {
        id: 'ph3',
        title: 'Be sceptical of urgent requests',
        description:
          'Attackers create urgency ("Your account will be closed!"). Slow down, verify independently, and never provide credentials via email.',
        severity: 'medium',
      },
      {
        id: 'ph4',
        title: 'Enable anti-phishing in your browser',
        description:
          'Modern browsers flag known phishing sites. Keep Safe Browsing (Chrome/Edge) or Enhanced Tracking Protection (Firefox) turned on.',
        severity: 'low',
      },
    ],
  },
  {
    id:    'network',
    label: 'Network',
    icon:  <Wifi size={18} color={GREEN} strokeWidth={2} />,
    color: GREEN,
    tips: [
      {
        id: 'n1',
        title: 'Avoid public Wi-Fi for sensitive tasks',
        description:
          'Never access banking, email, or work accounts on open public Wi-Fi. Use a trusted VPN if you must connect on the go.',
        severity: 'high',
      },
      {
        id: 'n2',
        title: 'Use a VPN on untrusted networks',
        description:
          'A VPN encrypts your traffic between your device and the VPN server. Choose a provider with a no-logs policy and a kill switch.',
        severity: 'medium',
      },
      {
        id: 'n3',
        title: 'Change your router default credentials',
        description:
          'Most home routers ship with admin/admin or admin/password. Change both the admin password and the Wi-Fi passphrase right away.',
        severity: 'high',
      },
      {
        id: 'n4',
        title: 'Keep router firmware up to date',
        description:
          'Routers receive security patches. Enable automatic updates or check monthly via the router admin panel.',
        severity: 'medium',
      },
    ],
  },
  {
    id:    'device',
    label: 'Device',
    icon:  <Smartphone size={18} color="#BF7FFF" strokeWidth={2} />,
    color: '#BF7FFF',
    tips: [
      {
        id: 'd1',
        title: 'Keep your OS and apps updated',
        description:
          'Software updates patch security vulnerabilities. Enable automatic updates on your phone and computer.',
        severity: 'high',
      },
      {
        id: 'd2',
        title: 'Use full-disk encryption',
        description:
          'Android and iOS encrypt storage by default when a PIN/passphrase is set. On desktops use BitLocker (Windows) or FileVault (Mac).',
        severity: 'medium',
      },
      {
        id: 'd3',
        title: 'Lock your screen automatically',
        description:
          'Set your device to lock after 30–60 seconds of inactivity. Use a strong PIN, fingerprint, or face ID.',
        severity: 'medium',
      },
      {
        id: 'd4',
        title: 'Install apps only from official stores',
        description:
          'Sideloaded APKs and apps from unknown sources are a common malware vector. Stick to the App Store or Play Store.',
        severity: 'high',
      },
    ],
  },
  {
    id:    'privacy',
    label: 'Privacy',
    icon:  <Eye size={18} color={RED} strokeWidth={2} />,
    color: RED,
    tips: [
      {
        id: 'pr1',
        title: 'Audit app permissions regularly',
        description:
          'Go to Settings → Apps and revoke location, microphone, and camera permissions from apps that don\'t need them.',
        severity: 'medium',
      },
      {
        id: 'pr2',
        title: 'Use a privacy-focused browser',
        description:
          'Brave, Firefox with uBlock Origin, or Safari with ITP all reduce third-party tracking compared to bare Chrome.',
        severity: 'low',
      },
      {
        id: 'pr3',
        title: 'Minimise what you share on social media',
        description:
          'Oversharing (birthdate, phone, location) fuels social engineering attacks. Keep your profile on private where possible.',
        severity: 'medium',
      },
      {
        id: 'pr4',
        title: 'Use a unique email alias per service',
        description:
          'Services like SimpleLogin or Apple\'s Hide My Email let you generate per-service aliases, limiting breach exposure.',
        severity: 'low',
      },
    ],
  },
  {
    id:    'general',
    label: 'General',
    icon:  <ShieldCheck size={18} color={CYAN} strokeWidth={2} />,
    color: CYAN,
    tips: [
      {
        id: 'g1',
        title: 'Back up your data regularly',
        description:
          'Follow the 3-2-1 rule: 3 copies, 2 different media types, 1 off-site (cloud). Test your backups periodically.',
        severity: 'medium',
      },
      {
        id: 'g2',
        title: 'Be wary of USB drives you didn\'t load yourself',
        description:
          'A malicious USB device can compromise a machine within seconds. Never plug in drives you found or received unexpectedly.',
        severity: 'high',
      },
      {
        id: 'g3',
        title: 'Use encrypted messaging apps',
        description:
          'Signal, WhatsApp, and iMessage use end-to-end encryption. Prefer them over SMS for sensitive conversations.',
        severity: 'low',
      },
      {
        id: 'g4',
        title: 'Log out of accounts when done',
        description:
          'Especially on shared or public computers, always sign out after use. Session hijacking is easier when sessions stay alive.',
        severity: 'medium',
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityColor(s: Tip['severity']) {
  if (s === 'high')   return RED;
  if (s === 'medium') return YELLOW;
  return GREEN;
}

function severityLabel(s: Tip['severity']) {
  if (s === 'high')   return 'HIGH';
  if (s === 'medium') return 'MEDIUM';
  return 'LOW';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SecurityTipsScreen() {
  const navigation              = useNavigation<any>();
  const insets                  = useSafeAreaInsets();
  const [activeId, setActiveId] = useState<string>(CATEGORIES[0].id);

  const active = CATEGORIES.find(c => c.id === activeId)!;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.canGoBack() && navigation.goBack()}
        >
          <ArrowLeft size={22} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>SECURITY TIPS</Text>
        <View style={styles.headerBtn} />
      </View>

      {/* ── Category tabs (horizontal scroll) ─────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsContainer}
        style={styles.tabsScroll}
      >
        {CATEGORIES.map(cat => {
          const isActive = cat.id === activeId;
          return (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.tab,
                isActive && { backgroundColor: cat.color + '22', borderColor: cat.color },
              ]}
              onPress={() => setActiveId(cat.id)}
              activeOpacity={0.75}
            >
              {cat.icon}
              <Text style={[styles.tabLabel, isActive && { color: cat.color }]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Tips list ──────────────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Section header */}
        <View style={styles.sectionHeader}>
          {active.icon}
          <Text style={[styles.sectionTitle, { color: active.color }]}>
            {active.label} Security
          </Text>
          <Text style={styles.sectionCount}>{active.tips.length} tips</Text>
        </View>

        {active.tips.map((tip, idx) => {
          const sColor = severityColor(tip.severity);
          return (
            <View key={tip.id} style={styles.tipCard}>
              {/* Left accent bar */}
              <View style={[styles.accentBar, { backgroundColor: sColor }]} />

              <View style={styles.tipBody}>
                {/* Top row */}
                <View style={styles.tipTopRow}>
                  <View style={styles.tipNumberCircle}>
                    <Text style={styles.tipNumber}>{idx + 1}</Text>
                  </View>
                  <Text style={styles.tipTitle}>{tip.title}</Text>
                  <View style={[styles.severityBadge, { borderColor: sColor }]}>
                    <AlertTriangle size={9} color={sColor} strokeWidth={2.5} />
                    <Text style={[styles.severityText, { color: sColor }]}>
                      {severityLabel(tip.severity)}
                    </Text>
                  </View>
                </View>

                {/* Description */}
                <Text style={styles.tipDesc}>{tip.description}</Text>

                {/* Done indicator */}
                <View style={styles.tipFooter}>
                  <CheckCircle size={13} color={active.color} strokeWidth={2} />
                  <Text style={[styles.tipFooterText, { color: active.color }]}>
                    Actionable tip
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: BG },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 20,
    height:            56,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,229,255,0.1)',
    backgroundColor:   BG,
  },
  headerBtn:   { padding: 6, minWidth: 36 },
  headerTitle: { color: CYAN, fontSize: 15, fontWeight: '900', letterSpacing: 3 },

  // Tabs
  tabsScroll:     { flexGrow: 0, flexShrink: 0 },
  tabsContainer:  {
    flexDirection:  'row',
    paddingHorizontal: 16,
    paddingVertical:   14,
    gap:               10,
  },
  tab: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              6,
    paddingHorizontal: 14,
    paddingVertical:   8,
    borderRadius:     20,
    borderWidth:      1,
    borderColor:      'rgba(255,255,255,0.08)',
    backgroundColor:  CARD,
  },
  tabLabel: { color: MUTED, fontSize: 12, fontWeight: '700' },

  // Scroll
  scroll:      { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },

  // Section header
  sectionHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
    marginBottom:   4,
    paddingLeft:    2,
  },
  sectionTitle: { fontSize: 17, fontWeight: '900', flex: 1 },
  sectionCount: { color: MUTED, fontSize: 12, fontWeight: '600' },

  // Tip card
  tipCard: {
    backgroundColor: CARD,
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     'rgba(0,229,255,0.07)',
    flexDirection:   'row',
    overflow:        'hidden',
  },
  accentBar: { width: 3, borderRadius: 3 },
  tipBody:   { flex: 1, padding: 14, gap: 10 },

  tipTopRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  tipNumberCircle: {
    width:           24,
    height:          24,
    borderRadius:    12,
    backgroundColor: 'rgba(0,229,255,0.1)',
    justifyContent:  'center',
    alignItems:      'center',
  },
  tipNumber: { color: CYAN, fontSize: 11, fontWeight: '900' },
  tipTitle: {
    flex:       1,
    color:      '#fff',
    fontSize:   14,
    fontWeight: '700',
    lineHeight: 20,
  },

  severityBadge: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              3,
    borderWidth:      1,
    borderRadius:     6,
    paddingHorizontal: 6,
    paddingVertical:   2,
  },
  severityText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },

  tipDesc: {
    color:      '#AAA',
    fontSize:   13,
    lineHeight: 20,
  },

  tipFooter: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
    marginTop:     2,
  },
  tipFooterText: { fontSize: 11, fontWeight: '600' },
});
