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
  ArrowLeft, Settings, Pencil,
  Shield, Clock, History, Lock, Lightbulb, ChevronRight,
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

const YELLOW    = '#F5F000';
const DARK_CARD = '#1a1a1a';

function formatMemberSince(isoDate: string | undefined): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
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
        .single(),
      api.get<ScanStats>('/linkguard/stats/').catch(() => null),
    ]).then(([{ data: profileData }, statsRes]) => {
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
        <ActivityIndicator size="large" color={YELLOW} />
      </View>
    );
  }

  // Prefer profile full_name, then Supabase user_metadata, then email prefix
  const displayName =
    profile?.full_name?.trim() ||
    user?.user_metadata?.full_name?.trim() ||
    user?.email?.split('@')[0] ||
    'User';

  const securityLevel =
    (profile?.security_score ?? 0) >= 70 ? 'ADVANCED' :
    (profile?.security_score ?? 0) >= 40 ? 'STANDARD' : 'BASIC';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* ── Header ───────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.canGoBack() && navigation.goBack()}
          style={styles.headerBtn}
        >
          <ArrowLeft size={22} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity style={styles.headerBtn}>
          <Settings size={22} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Avatar & Identity ──────────────────────────────────────── */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarRing}>
            {user && (
              <AvatarUploader
                userId={user.id}
                currentUrl={profile?.avatar_url ?? null}
                size={100}
                onUploaded={handleAvatarUploaded}
              />
            )}
            <View style={styles.editBadge}>
              <Pencil size={12} color="#000" strokeWidth={2.5} />
            </View>
          </View>

          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.emailText}>{user?.email ?? ''}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.roleText}>{(profile?.role ?? 'user').toUpperCase()}</Text>
          </View>
        </View>

        {/* ── Stats Bento ───────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: YELLOW }]}>
              {stats?.total_scans ?? 0}
            </Text>
            <Text style={styles.statLabel}>SCANS</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: '#FF5252' }]}>
              {stats?.threats_blocked ?? 0}
            </Text>
            <Text style={styles.statLabel}>THREATS</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: '#4CAF50' }]}>
              {stats?.safe_count ?? 0}
            </Text>
            <Text style={styles.statLabel}>SAFE</Text>
          </View>
        </View>

        {/* ── Account Info ──────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Account Info</Text>
          <View style={styles.infoList}>
            <View style={[styles.infoRow, styles.infoRowBorder]}>
              <View style={styles.infoLeft}>
                <Shield size={20} color="#6b6b6b" strokeWidth={1.75} />
                <Text style={styles.infoName}>Security Level</Text>
              </View>
              <Text style={[styles.infoValue, { color: YELLOW, fontWeight: '900' }]}>
                {securityLevel}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <View style={styles.infoLeft}>
                <Clock size={20} color="#6b6b6b" strokeWidth={1.75} />
                <Text style={styles.infoName}>Member Since</Text>
              </View>
              <Text style={styles.infoValue}>
                {formatMemberSince(user?.created_at)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Actions ───────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Actions</Text>
          <View style={styles.actionList}>
            <TouchableOpacity
              style={styles.actionBtnWhite}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('ScanHistory')}
            >
              <View style={styles.actionLeft}>
                <History size={20} color="#000" strokeWidth={2} />
                <Text style={styles.actionTextBlack}>View Scan History</Text>
              </View>
              <ChevronRight size={18} color="rgba(0,0,0,0.3)" strokeWidth={2} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtnDark} activeOpacity={0.85}>
              <View style={styles.actionLeft}>
                <Lock size={20} color="#fff" strokeWidth={2} />
                <Text style={styles.actionTextWhite}>Privacy Settings</Text>
              </View>
              <ChevronRight size={18} color="rgba(255,255,255,0.3)" strokeWidth={2} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtnDark} activeOpacity={0.85}>
              <View style={styles.actionLeft}>
                <Lightbulb size={20} color="#fff" strokeWidth={2} />
                <Text style={styles.actionTextWhite}>Security Tips</Text>
              </View>
              <ChevronRight size={18} color="rgba(255,255,255,0.3)" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Sign Out ──────────────────────────────────────────────── */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.9}>
          <Text style={styles.signOutText}>SIGN OUT</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#000' },
  loader: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 24 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#000',
  },
  headerBtn:   { padding: 6 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.2 },

  avatarSection: { alignItems: 'center', marginBottom: 32, marginTop: 8 },
  avatarRing: {
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 2.5,
    borderColor: YELLOW,
    padding: 5,
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  editBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: YELLOW,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  displayName: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -0.5, marginBottom: 4 },
  emailText:   { color: '#6b6b6b', fontSize: 13, fontWeight: '500', marginBottom: 10 },
  rolePill: {
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  roleText: { color: '#000', fontSize: 10, fontWeight: '900', letterSpacing: 2 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  statCard: {
    flex: 1,
    backgroundColor: DARK_CARD,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  statNumber: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  statLabel:  { color: '#6b6b6b', fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginTop: 3 },

  section:      { marginBottom: 28 },
  sectionLabel: {
    color: YELLOW,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginBottom: 14,
    paddingLeft: 2,
  },

  infoList:     { gap: 0 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  infoLeft:  { flexDirection: 'row', alignItems: 'center', gap: 14 },
  infoName:  { color: '#fff', fontSize: 14, fontWeight: '600' },
  infoValue: { color: '#6b6b6b', fontSize: 14, fontWeight: '500' },

  actionList: { gap: 10 },
  actionBtnWhite: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  actionBtnDark: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: DARK_CARD,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  actionLeft:      { flexDirection: 'row', alignItems: 'center', gap: 14 },
  actionTextBlack: { color: '#000', fontSize: 15, fontWeight: '700' },
  actionTextWhite: { color: '#fff', fontSize: 15, fontWeight: '700' },

  signOutBtn: {
    backgroundColor: YELLOW,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: YELLOW,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 6,
  },
  signOutText: { color: '#000', fontSize: 14, fontWeight: '900', letterSpacing: 2.5 },
});
