/**
 * src/screens/CyberNewsScreen.tsx
 *
 * Cybersecurity News Feed — real-time headlines from trusted RSS sources.
 *
 * States: loading (skeleton) → data (news cards) → empty → error + retry
 * Tap a card → opens the original article in the device browser.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Newspaper, RotateCcw, ExternalLink } from 'lucide-react-native';
import { useCyberNews, NewsCategory, NewsArticle, timeAgo } from '@/hooks/useCyberNews';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const CYAN   = '#00E5FF';
const BG     = '#080810';
const CARD   = '#0F0F1A';
const BORDER = 'rgba(0,229,255,0.07)';

const CAT_COLOR: Record<string, string> = {
  BREACH:  '#ef4444',
  MALWARE: '#f59e0b',
  PATCH:   '#22c55e',
  ALERT:   '#dc2626',
  OTHER:   '#555',
  ALL:     CYAN,
};

const FILTERS: NewsCategory[] = ['ALL', 'BREACH', 'MALWARE', 'PATCH', 'ALERT'];

// ─── Sub-components ────────────────────────────────────────────────────────────

function LiveDot() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.15, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  return <Animated.View style={[styles.liveDot, { opacity }]} />;
}

function SkeletonPulse({ style }: { style: object }) {
  const opacity = useRef(new Animated.Value(0.25)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.55, duration: 850, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.25, duration: 850, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  return <Animated.View style={[style, { opacity }]} />;
}

function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.cardInner}>
        <SkeletonPulse style={styles.skThumb} />
        <View style={styles.skContent}>
          <View style={styles.skTopRow}>
            <SkeletonPulse style={styles.skBadge} />
            <SkeletonPulse style={styles.skTime} />
          </View>
          <SkeletonPulse style={styles.skSource} />
          <SkeletonPulse style={styles.skTitle} />
          <SkeletonPulse style={styles.skTitle2} />
          <SkeletonPulse style={styles.skSummary} />
        </View>
      </View>
    </View>
  );
}

function ImageThumb({ uri, color }: { uri: string | null; color: string }) {
  const [failed, setFailed] = useState(false);

  if (!uri || failed) {
    // Fallback: source-coloured placeholder with newspaper icon
    return (
      <View style={[styles.thumb, { backgroundColor: color + '22', borderColor: color + '33' }]}>
        <Newspaper size={24} color={color} strokeWidth={1.5} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={styles.thumb}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

interface NewsCardProps {
  item: NewsArticle;
}

function NewsCard({ item }: NewsCardProps) {
  const catColor = CAT_COLOR[item.category] ?? '#555';

  function openArticle() {
    Linking.openURL(item.source_url).catch(() => {});
  }

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.76} onPress={openArticle}>
      <View style={styles.cardInner}>

        {/* Left: thumbnail */}
        <ImageThumb uri={item.image_url} color={item.source_color} />

        {/* Right: content */}
        <View style={styles.cardContent}>

          {/* Row 1: category badge + time */}
          <View style={styles.cardTopRow}>
            <View style={[styles.catBadge, { backgroundColor: catColor + '20', borderColor: catColor + '40' }]}>
              <Text style={[styles.catText, { color: catColor }]}>{item.category}</Text>
            </View>
            <Text style={styles.timeText}>{timeAgo(item.published_at)}</Text>
          </View>

          {/* Row 2: source name */}
          <Text style={[styles.sourceText, { color: item.source_color }]} numberOfLines={1}>
            {item.source_name}
          </Text>

          {/* Row 3: headline */}
          <Text style={styles.titleText} numberOfLines={2}>{item.title}</Text>

          {/* Row 4: summary */}
          {!!item.summary && (
            <Text style={styles.summaryText} numberOfLines={2}>{item.summary}</Text>
          )}

          {/* Row 5: read more */}
          <View style={styles.readRow}>
            <Text style={styles.readText}>Read full story</Text>
            <ExternalLink size={11} color={CYAN} strokeWidth={2.5} />
          </View>

        </View>
      </View>
    </TouchableOpacity>
  );
}

function EmptyState() {
  return (
    <View style={styles.centerState}>
      <View style={styles.emptyIconWrap}>
        <Newspaper size={40} color={CYAN} strokeWidth={1.5} />
      </View>
      <Text style={styles.emptyTitle}>No news right now</Text>
      <Text style={styles.emptySubtitle}>Pull down to refresh</Text>
    </View>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.centerState}>
      <Text style={styles.errorTitle}>Unable to load news</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.75}>
        <RotateCcw size={14} color="#000" strokeWidth={2.5} />
        <Text style={styles.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function CyberNewsScreen() {
  const [category, setCategory] = useState<NewsCategory>('ALL');
  const { articles, loading, refreshing, error, refresh, loadMore } = useCyberNews(category);

  function renderItem({ item }: { item: NewsArticle }) {
    return <NewsCard item={item} />;
  }

  const showSkeleton = loading && articles.length === 0;
  const showError    = !!error && articles.length === 0;
  const showEmpty    = !loading && !error && articles.length === 0;

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Cyber News</Text>
        <LiveDot />
      </View>

      {/* Subtitle */}
      <Text style={styles.headerSub}>Global cybersecurity headlines</Text>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, category === f && styles.filterTabActive]}
            onPress={() => setCategory(f)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterTabText, category === f && styles.filterTabTextActive]}>
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Body */}
      {showSkeleton ? (
        <View style={{ padding: 16, gap: 10 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : showError ? (
        <ErrorState message={error!} onRetry={refresh} />
      ) : showEmpty ? (
        <EmptyState />
      ) : (
        <FlatList
          data={articles}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={CYAN} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.35}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, paddingTop: 60 },

  // Header
  headerRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 4, gap: 10 },
  headerTitle: { fontSize: 15, fontWeight: '900', color: CYAN, letterSpacing: 3 },
  liveDot:     { width: 9, height: 9, borderRadius: 5, backgroundColor: CYAN },
  headerSub:   { color: '#5A5A7A', fontSize: 12, fontWeight: '600', paddingHorizontal: 16, marginBottom: 14 },

  // Filters
  filterRow:           { flexDirection: 'row', paddingHorizontal: 12, gap: 6, marginBottom: 14 },
  filterTab:           {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
  },
  filterTabActive:     { backgroundColor: CYAN, borderColor: CYAN },
  filterTabText:       { color: '#5A5A7A', fontSize: 12, fontWeight: '700' },
  filterTabTextActive: { color: '#000' },

  // Card
  card: {
    backgroundColor: CARD,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  cardInner: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },

  // Thumbnail
  thumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: '#12121E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },

  // Card content
  cardContent: { flex: 1, justifyContent: 'space-between' },
  cardTopRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },

  catBadge: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  catText:  { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },

  timeText:   { color: '#444', fontSize: 10, fontWeight: '600' },
  sourceText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 4 },
  titleText:  { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 18, marginBottom: 4 },
  summaryText: { color: '#555', fontSize: 11, lineHeight: 16, marginBottom: 6 },

  readRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  readText: { color: CYAN, fontSize: 11, fontWeight: '700' },

  // List
  listContent: { padding: 16, paddingBottom: 40 },

  // Skeleton
  skThumb:   { width: 80, height: 80, borderRadius: 10, backgroundColor: '#12121E', flexShrink: 0 },
  skContent: { flex: 1, gap: 6 },
  skTopRow:  { flexDirection: 'row', justifyContent: 'space-between' },
  skBadge:   { width: 60, height: 16, borderRadius: 4, backgroundColor: '#222' },
  skTime:    { width: 40, height: 12, borderRadius: 4, backgroundColor: '#1a1a1a' },
  skSource:  { width: 80, height: 10, borderRadius: 4, backgroundColor: '#1a1a1a' },
  skTitle:   { width: '90%', height: 13, borderRadius: 4, backgroundColor: '#222' },
  skTitle2:  { width: '70%', height: 13, borderRadius: 4, backgroundColor: '#1a1a1a' },
  skSummary: { width: '85%', height: 11, borderRadius: 4, backgroundColor: '#1a1a1a' },

  // Center states
  centerState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(245,240,0,0.08)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
  },
  emptyTitle:    { color: '#fff', fontSize: 17, fontWeight: '800' },
  emptySubtitle: { color: '#444', fontSize: 13, fontWeight: '600' },

  errorTitle:   { color: '#ef4444', fontSize: 16, fontWeight: '800', marginBottom: 6 },
  errorMessage: { color: '#666', fontSize: 13, textAlign: 'center', marginBottom: 20, paddingHorizontal: 32 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: CYAN, borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 11,
  },
  retryText: { color: '#000', fontSize: 14, fontWeight: '800' },
});
