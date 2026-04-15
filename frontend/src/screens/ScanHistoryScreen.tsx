/**
 * src/screens/ScanHistoryScreen.tsx
 *
 * Paginated list of all URL scans the user has performed.
 * Fetches from GET /api/v1/linkguard/history/
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation }     from '@react-navigation/native';
import { ArrowLeft, ShieldCheck, ShieldAlert, ShieldX, ExternalLink } from 'lucide-react-native';
import { api } from '@/services/api';

const CYAN = '#00E5FF';
const BG   = '#080810';
const CARD = '#0F0F1A';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScanItem {
  scan_id:     string;
  url?:        string;
  url_hash?:   string;
  status?:     string;   // Safe | Suspicious | Unsafe
  verdict?:    string;   // safe | suspicious | dangerous
  final_score?: number;
  scanned_at?:  string;
}

interface HistoryResponse {
  results:      ScanItem[];
  count:        number;
  num_pages:    number;
  current_page: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function verdictColor(verdict: string) {
  if (verdict === 'safe')      return '#4CAF50';
  if (verdict === 'suspicious') return CYAN;
  return '#FF5252';
}

function VerdictIcon({ verdict, size = 18 }: { verdict: string; size?: number }) {
  const color = verdictColor(verdict);
  if (verdict === 'safe')       return <ShieldCheck  size={size} color={color} strokeWidth={2} />;
  if (verdict === 'suspicious') return <ShieldAlert  size={size} color={color} strokeWidth={2} />;
  return                               <ShieldX      size={size} color={color} strokeWidth={2} />;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
    + '  ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function truncateUrl(url: string | undefined | null, max = 40) {
  if (!url) return '(no url)';
  try {
    const u = new URL(url);
    const display = u.hostname + u.pathname;
    return display.length > max ? display.slice(0, max) + '…' : display;
  } catch {
    return url.length > max ? url.slice(0, max) + '…' : url;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScanHistoryScreen() {
  const navigation = useNavigation<any>();
  const insets     = useSafeAreaInsets();

  const [items, setItems]         = useState<ScanItem[]>([]);
  const [page, setPage]           = useState(1);
  const [numPages, setNumPages]   = useState(1);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (pageNum: number, replace = false) => {
    try {
      const res = await api.get<HistoryResponse>(`/linkguard/history/?page=${pageNum}`);
      const data = res.data;

      // Backend may return a plain array or a paginated object — handle both.
      const results: ScanItem[] = Array.isArray(data)
        ? (data as unknown as ScanItem[])
        : Array.isArray(data?.results)
          ? data.results
          : [];

      setTotal(typeof data?.count === 'number' ? data.count : results.length);
      setNumPages(typeof data?.num_pages === 'number' ? data.num_pages : 1);
      setPage(typeof data?.current_page === 'number' ? data.current_page : pageNum);
      setItems(prev => replace ? results : [...prev, ...results]);
    } catch (err: any) {
      // silently swallow; empty state is shown when items stays []
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchPage(1, true).finally(() => setLoading(false));
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await fetchPage(1, true);
    setRefreshing(false);
  }

  async function onEndReached() {
    if (loadingMore || page >= numPages) return;
    setLoadingMore(true);
    await fetchPage(page + 1, false);
    setLoadingMore(false);
  }

  // ── Render item ─────────────────────────────────────────────────────────────

  function renderItem({ item }: { item: ScanItem }) {
    const verdict = item.verdict ?? (item.status?.toLowerCase() ?? 'safe');
    const color   = verdictColor(verdict);
    const status  = item.status ?? item.verdict ?? 'unknown';
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <VerdictIcon verdict={verdict} size={20} />
          <Text style={styles.cardUrl} numberOfLines={1}>
            {truncateUrl(item.url ?? item.url_hash)}
          </Text>
          <View style={[styles.scorePill, { backgroundColor: color + '22' }]}>
            <Text style={[styles.scoreText, { color }]}>{item.final_score ?? '—'}</Text>
          </View>
        </View>

        <View style={styles.cardBottom}>
          <View style={[styles.statusBadge, { borderColor: color }]}>
            <Text style={[styles.statusText, { color }]}>{status.toUpperCase()}</Text>
          </View>
          <Text style={styles.dateText}>{item.scanned_at ? formatDate(item.scanned_at) : '—'}</Text>
        </View>
      </View>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────────────

  function EmptyState() {
    return (
      <View style={styles.empty}>
        <ExternalLink size={48} color="#333" strokeWidth={1.5} />
        <Text style={styles.emptyTitle}>No scans yet</Text>
        <Text style={styles.emptySub}>
          Start scanning links from the Home screen to see your history here.
        </Text>
      </View>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.canGoBack() && navigation.goBack()}
          style={styles.headerBtn}
        >
          <ArrowLeft size={22} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan History</Text>
        <View style={styles.headerBtn}>
          {total > 0 && (
            <Text style={styles.headerCount}>{total} scans</Text>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={CYAN} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.scan_id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.list,
            items.length === 0 && styles.listEmpty,
            { paddingBottom: insets.bottom + 24 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={CYAN}
              colors={[CYAN]}
            />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={<EmptyState />}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={CYAN} style={styles.footerSpinner} />
            ) : null
          }
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,229,255,0.1)',
    backgroundColor: BG,
  },
  headerBtn:   { padding: 6, minWidth: 50 },
  headerTitle: { color: CYAN, fontSize: 15, fontWeight: '900', letterSpacing: 3 },
  headerCount: { color: '#5A5A7A', fontSize: 12, fontWeight: '600', textAlign: 'right' },

  list:      { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  listEmpty: { flex: 1, justifyContent: 'center' },

  card: {
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.07)',
    gap: 10,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardUrl: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  scorePill: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  scoreText: { fontSize: 12, fontWeight: '900' },

  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  dateText:   { color: '#555', fontSize: 11 },

  empty: {
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  emptySub:   { color: '#555', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  footerSpinner: { marginVertical: 20 },
});
