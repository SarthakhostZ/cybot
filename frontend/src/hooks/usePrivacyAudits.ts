/**
 * src/hooks/usePrivacyAudits.ts
 *
 * Paginated privacy audit history from the Django API.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/services/api';

export interface AuditRecord {
  id: string;
  user_id: string;
  email_scanned: string;
  breach_count: number;
  paste_count: number;
  risk_level: string;
  data_classes: string[];
  recommendations: string[];
  raw_breaches: string[];
  created_at: string;
}

interface State {
  audits:     AuditRecord[];
  hasNext:    boolean;
  loading:    boolean;
  refreshing: boolean;
  error:      string | null;
}

export function usePrivacyAudits() {
  const [state, setState] = useState<State>({
    audits:     [],
    hasNext:    false,
    loading:    true,
    refreshing: false,
    error:      null,
  });

  const pageRef        = useRef(1);
  const loadingMoreRef = useRef(false);

  const fetchPage = useCallback(async (page: number, reset = false) => {
    try {
      const { data } = await api.get('/privacy/audit/', {
        params: { page: String(page), per_page: '10' },
      });
      setState((prev) => ({
        ...prev,
        audits:     reset ? data.data : [...prev.audits, ...data.data],
        hasNext:    data.meta.has_next,
        loading:    false,
        refreshing: false,
        error:      null,
      }));
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        loading:    false,
        refreshing: false,
        error:      err?.response?.data?.error ?? 'Failed to load audit history',
      }));
    } finally {
      loadingMoreRef.current = false;
    }
  }, []);

  useEffect(() => { fetchPage(1, true); }, [fetchPage]);

  function refresh() {
    pageRef.current = 1;
    setState((prev) => ({ ...prev, refreshing: true }));
    fetchPage(1, true);
  }

  function loadMore() {
    if (!state.hasNext || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    pageRef.current += 1;
    fetchPage(pageRef.current, false);
  }

  // Push a newly created audit to the front of the list
  function prepend(audit: AuditRecord) {
    setState((prev) => ({ ...prev, audits: [audit, ...prev.audits] }));
  }

  return { ...state, refresh, loadMore, prepend };
}
