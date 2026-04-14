/**
 * src/hooks/useAuth.ts
 *
 * Thin re-export layer — kept for backward-compatibility with any direct
 * imports.  All new code should consume useAuthContext() from AuthContext.tsx.
 *
 * The full implementation (session listener, auto-refresh, all auth actions)
 * lives in src/contexts/AuthContext.tsx.
 */

export { useAuthContext as useAuth } from '@/contexts/AuthContext';

// ─── Standalone helpers (usable outside React components) ─────────────────────

import { supabase } from '@/lib/supabase';

export async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
