/**
 * src/screens/ProfileScreen.tsx
 *
 * - Real user name from Supabase profile / user metadata
 * - Real scan stats (total scans, threats, safe) from /api/v1/linkguard/stats/
 * - Real "Member Since" from user.created_at
 * - "View Scan History" navigates to ScanHistoryScreen
 * - Avatar upload with 50 KB compression, saved to profiles table
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation }     from '@react-navigation/native';
import {
  Settings, Pencil, ShieldCheck,
  Shield, Clock, History, Lock, Lightbulb, ChevronRight, LogOut,
} from 'lucide-react-native';
import { supabase }       from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { api }           from '@/services/api';
import AvatarUploader    from '@/components/AvatarUploader';

interface Profile {
  id:             string;
  full_name:      string;
  avatar_url:     string | null;
  security_score: number;
  role:           string;
}

interface ScanStats {
  total_scans:      number;
  threats_blocked:  number;
  suspicious_count: number;
  safe_count:       number;
}

const CYAN      = '#00E5FF';
const BG        = '#080810';
const CARD      = '#0F0F1A';
const CARD2     = '#12121E';
const MUTED     = '#5A5A7A';
const MUTED2    = '#3A3A5A';

function formatMemberSince(isoDate: string | undefined): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function ProfileScreen() {
  const { user, signOut }     = useAuthContext();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats]     = useState<ScanStats | null>(null);
  const [loading, setLoading] = useState(true);
  const insets                = useSafeAreaInsets();
  const navigation            = useNavigation<any>();

  useEffect(() => {
    if (!user) return;

    Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, avatar_url, security_score, role')
        .eq('id', user.id)
        .single()
        .then(({ data }) => data)
        .catch(() => null),
      api.get<ScanStats>('/linkguard/stats/').catch(() => null),
    ]).then(([profileData, statsRes]) => {
      setProfile(profileData);
      if (statsRes?.data) setStats(statsRes.data);
      setLoading(false);
    });
  }, [user]);

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => { await signOut(); },
      },
    ]);
  }

  async function handleAvatarUploaded(url: string) {
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: url })
      .eq('id', user!.id);
    if (error) {
      Alert.alert('Save failed', 'Photo uploaded but could not save to profile.');
    }
    setProfile((prev) => prev ? { ...prev, avatar_url: url } : prev);
  }

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={CYAN} />
      </View>
    );
  }

  const displayName =
    profile?.full_name?.trim() ||
    user?.user_metadata?.full_name?.trim() ||
    user?.email?.split('@')[0] ||
    'User';

  const securityLevel =
    (profile?.security_score ?? 0) >= 70 ? 'Advanced' :
    (profile?.security_score ?? 0) >= 40 ? 'Standard' : 'Basic';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* ── Header ───────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <ShieldCheck size={22} color={CYAN} strokeWidth={2} />
        <Text style={styles.headerTitle}>SECURITY VAULT</Text>
        <TouchableOpacity style={styles.headerBtn}>
          <Settings size={22} color={CYAN} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Avatar & Identity ──────────────────────────────────────── */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarRing}>
              {user && (
                <AvatarUploader
                  userId={user.id}
                  currentUrl={profile?.avatar_url ?? null}
                  size={96}
                  onUploaded={handleAvatarUploaded}
                />
              )}
            </View>
            <TouchableOpacity style={styles.editBadge} activeOpacity={0.8}>
              <Pencil size={11} color={BG} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          <Text style={styles.displayName}>{displayName}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.roleText}>{(profile?.role ?? 'user').toUpperCase()}</Text>
          </View>
        </View>

        {/* ── Stats Row ─────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: CYAN }]}>
              {stats?.total_scans ?? 0}
            </Text>
            <Text style={styles.statLabel}>SCANS</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: '#FF4C6A' }]}>
              {stats?.threats_blocked ?? 0}
            </Text>
            <Text style={styles.statLabel}>THREATS</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: '#00E096' }]}>
              {stats?.safe_count ?? 0}
            </Text>
            <Text style={styles.statLabel}>SAFE</Text>
          </View>
        </View>

        {/* ── Account Info ──────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACCOUNT INFO</Text>
          <View style={styles.cardList}>

            <TouchableOpacity style={styles.listRow} activeOpacity={0.75}>
              <View style={styles.rowLeft}>
                <View style={styles.iconBox}>
                  <Shield size={16} color={CYAN} strokeWidth={2} />
                </View>
                <View>
                  <Text style={styles.rowMeta}>SECURITY LEVEL</Text>
                  <Text style={styles.rowTitle}>{securityLevel}</Text>
                </View>
              </View>
              <ChevronRight size={18} color={MUTED} strokeWidth={2} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.listRow} activeOpacity={0.75}>
              <View style={styles.rowLeft}>
                <View style={styles.iconBox}>
                  <Clock size={16} color={CYAN} strokeWidth={2} />
                </View>
                <View>
                  <Text style={styles.rowMeta}>MEMBER SINCE</Text>
                  <Text style={styles.rowTitle}>{formatMemberSince(user?.created_at)}</Text>
                </View>
              </View>
              <ChevronRight size={18} color={MUTED} strokeWidth={2} />
            </TouchableOpacity>

          </View>
        </View>

        {/* ── Actions ───────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACTIONS</Text>
          <View style={styles.cardList}>

            <TouchableOpacity
              style={styles.listRow}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('ScanHistory')}
            >
              <View style={styles.rowLeft}>
                <View style={styles.iconBox}>
                  <History size={16} color={CYAN} strokeWidth={2} />
                </View>
                <Text style={styles.rowTitle}>View Scan History</Text>
              </View>
              <ChevronRight size={18} color={MUTED} strokeWidth={2} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.listRow} activeOpacity={0.75}>
              <View style={styles.rowLeft}>
                <View style={styles.iconBox}>
                  <Lock size={16} color={CYAN} strokeWidth={2} />
                </View>
                <Text style={styles.rowTitle}>Privacy Settings</Text>
              </View>
              <ChevronRight size={18} color={MUTED} strokeWidth={2} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.listRow}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('SecurityTips')}
            >
              <View style={styles.rowLeft}>
                <View style={styles.iconBox}>
                  <Lightbulb size={16} color={CYAN} strokeWidth={2} />
                </View>
                <Text style={styles.rowTitle}>Security Tips</Text>
              </View>
              <ChevronRight size={18} color={MUTED} strokeWidth={2} />
            </TouchableOpacity>

          </View>
        </View>

        {/* ── Sign Out ──────────────────────────────────────────────── */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.85}>
          <LogOut size={18} color={BG} strokeWidth={2.5} style={{ marginRight: 10 }} />
          <Text style={styles.signOutText}>SIGN OUT</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  loader: { flex: 1, backgroundColor: BG, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,229,255,0.08)',
    backgroundColor: BG,
  },
  headerBtn:   { padding: 6 },
  headerTitle: {
    color: CYAN,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 3,
  },

  // Avatar
  avatarSection: { alignItems: 'center', marginBottom: 28, marginTop: 12 },
  avatarWrap:    { position: 'relative', marginBottom: 16 },
  avatarRing: {
    width: 112,
    height: 112,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: CYAN,
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: CYAN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
  },
  editBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: CYAN,
    width: 26,
    height: 26,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: CYAN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
  },
  displayName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  rolePill: {
    borderWidth: 1,
    borderColor: CYAN,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  roleText: {
    color: CYAN,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.5,
  },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  statCard: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.07)',
  },
  statNumber: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  statLabel:  { color: MUTED, fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginTop: 4 },

  // Sections
  section:      { marginBottom: 24 },
  sectionLabel: {
    color: MUTED,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.5,
    marginBottom: 10,
    paddingLeft: 2,
  },

  // Card list
  cardList: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.07)',
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(0,229,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowMeta:  { color: MUTED, fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 2 },
  rowTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  divider:  { height: 1, backgroundColor: 'rgba(0,229,255,0.06)', marginHorizontal: 16 },

  // Sign Out
  signOutBtn: {
    flexDirection: 'row',
    backgroundColor: CYAN,
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: CYAN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
    marginTop: 4,
  },
  signOutText: {
    color: BG,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
});
