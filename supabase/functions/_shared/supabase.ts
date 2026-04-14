/**
 * _shared/supabase.ts
 * Shared Supabase admin client for Edge Functions.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

let _admin: SupabaseClient | null = null;

/** Returns a singleton service-role Supabase client. */
export function getAdmin(): SupabaseClient {
  if (!_admin) {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
    _admin = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return _admin;
}

/** Verify the caller's JWT against the anon key (for user-facing endpoints). */
export function getClientFromAuthHeader(authHeader: string | null): SupabaseClient {
  const url    = Deno.env.get("SUPABASE_URL")!;
  const anon   = Deno.env.get("SUPABASE_ANON_KEY")!;
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader ?? "" } },
  });
}
