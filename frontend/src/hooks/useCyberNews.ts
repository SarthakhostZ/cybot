/**
 * src/hooks/useCyberNews.ts
 *
 * Paginated cybersecurity news feed from GET /api/v1/threats/news/
 *
 * Features:
 *  • Category filter (ALL / BREACH / MALWARE / PATCH / ALERT / OTHER)
 *  • Pull-to-refresh
 *  • Infinite scroll (load more)
 *  • timeAgo() utility
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NewsCategory = 'ALL' | 'BREACH' | 'MALWARE' | 'PATCH' | 'ALERT' | 'OTHER';

export interface NewsArticle {
  id:           string;
  title:        string;
  summary:      string;
  image_url:    string | null;
  source_name:  string;   // e.g. "BleepingComputer"
  source_color: string;   // hex colour for the source
  source_url:   string;   // article URL — open in browser on tap
  published_at: string;   // ISO timestamp
  category:     NewsCategory;
}

interface Meta {
  page:     number;
  per_page: number;
  total:    number;
  has_next: boolean;
  category: NewsCategory;
}

interface State {
  articles:   NewsArticle[];
  meta:       Meta | null;
  loading:    boolean;
  refreshing: boolean;
  error:      string | null;
}

// ─── Time utility ─────────────────────────────────────────────────────────────

export function timeAgo(isoString: string): string {
  if (!isoString) return '';
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCyberNews(category: NewsCategory = 'ALL') {
  const [state, setState] = useState<State>({
    articles:   [],
    meta:       null,
    loading:    true,
    refreshing: false,
    error:      null,
  });

  const pageRef        = useRef(1);
  const loadingMoreRef = useRef(false);

  const fetchPage = useCallback(async (page: number, reset = false) => {
    try {
      const params: Record<string, string> = {
        page:     String(page),
        per_page: '20',
      };
      if (category !== 'ALL') params.category = category;

      const { data } = await api.get('/threats/news/', { params });

      setState((prev) => ({
        ...prev,
        articles:   reset ? data.data : [...prev.articles, ...data.data],
        meta:       data.meta,
        loading:    false,
        refreshing: false,
        error:      null,
      }));
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        loading:    false,
        refreshing: false,
        error:      err?.response?.data?.error ?? 'Unable to load news',
      }));
    } finally {
      loadingMoreRef.current = false;
    }
  }, [category]);

  // Initial load / category-filter change
  useEffect(() => {
    pageRef.current = 1;
    setState((prev) => ({ ...prev, loading: true, articles: [], meta: null, error: null }));
    fetchPage(1, true);
  }, [fetchPage]);

  // ── Pagination helpers ──────────────────────────────────────────────────────

  function refresh() {
    pageRef.current = 1;
    setState((prev) => ({ ...prev, refreshing: true }));
    fetchPage(1, true);
  }

  function loadMore() {
    if (!state.meta?.has_next || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    pageRef.current += 1;
    fetchPage(pageRef.current, false);
  }

  return { ...state, refresh, loadMore };
}
