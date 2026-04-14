-- ============================================================
-- Schema verification queries
-- Run in Supabase SQL Editor to confirm everything is correct.
-- All checks should return 0 rows in the "FAILURES" column.
-- ============================================================

-- ─── 1. Tables exist ──────────────────────────────────────────
SELECT table_name, table_schema
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
      'profiles', 'threat_alerts', 'privacy_audits',
      'blockchain_records', 'chat_logs'
  )
ORDER BY table_name;
-- Expected: 5 rows

-- ─── 2. RLS is enabled on all tables ──────────────────────────
SELECT
    relname   AS table_name,
    relrowsecurity AS rls_enabled,
    CASE WHEN relrowsecurity THEN 'OK' ELSE 'FAIL — RLS OFF' END AS status
FROM pg_class
WHERE relname IN (
    'profiles', 'threat_alerts', 'privacy_audits',
    'blockchain_records', 'chat_logs'
)
ORDER BY relname;
-- Expected: all rows show rls_enabled = true

-- ─── 3. RLS policies exist ────────────────────────────────────
SELECT
    tablename,
    policyname,
    cmd,
    roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
-- Expected: ~10 policies across the 5 tables

-- ─── 4. Realtime publication includes threat_alerts ───────────
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
-- Expected: threat_alerts (and blockchain_records) are listed

-- ─── 5. Triggers exist ────────────────────────────────────────
SELECT
    trigger_name,
    event_object_table AS table_name,
    action_timing,
    event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;
-- Expected: on_auth_user_created, profiles_updated_at,
--           blockchain_records_updated_at, trg_update_score_on_audit

-- ─── 6. Functions exist ───────────────────────────────────────
SELECT
    routine_name,
    routine_type,
    security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
      'handle_new_user',
      'set_updated_at',
      'recalculate_security_score',
      'update_score_on_audit',
      'get_threat_stats',
      'set_user_role'
  )
ORDER BY routine_name;
-- Expected: 6 rows

-- ─── 7. Views exist ───────────────────────────────────────────
SELECT table_name AS view_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN (
      'threat_severity_summary',
      'recent_active_threats',
      'user_security_dashboard'
  )
ORDER BY table_name;
-- Expected: 3 rows

-- ─── 8. Indexes exist ─────────────────────────────────────────
SELECT
    indexname,
    tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
-- Expected: 8+ custom indexes

-- ─── 9. Storage buckets exist ─────────────────────────────────
SELECT id, name, public, file_size_limit
FROM storage.buckets
WHERE id IN ('avatars', 'threat-reports', 'ml-models')
ORDER BY id;
-- Expected: 3 rows (avatars=public, others=private)

-- ─── 10. Quick RLS simulation ─────────────────────────────────
-- Simulate a profile read as an anonymous user (should return 0 rows)
SET LOCAL role TO anon;
SELECT COUNT(*) AS anon_can_see_profiles FROM public.profiles;
-- Expected: 0 (anon cannot read profiles)
RESET role;

-- Confirm threat_alerts are readable to authenticated (via SELECT policy)
-- (Cannot simulate auth.uid() here — verify via frontend / Postman instead)
