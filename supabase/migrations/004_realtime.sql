-- ============================================================
-- Migration 004: Supabase Realtime
-- Enables Realtime on threat_alerts so clients receive live
-- INSERT/UPDATE/DELETE events via WebSocket subscriptions.
-- ============================================================

-- ─── Add threat_alerts to the realtime publication ────────────
-- Supabase creates the `supabase_realtime` publication automatically.
-- We extend it to include specific tables rather than using FOR ALL TABLES
-- (which would replicate all tables including sensitive ones).

ALTER PUBLICATION supabase_realtime ADD TABLE public.threat_alerts;

-- Optional: also replicate blockchain_records so clients can watch
-- verification confirmations in real-time.
ALTER PUBLICATION supabase_realtime ADD TABLE public.blockchain_records;

-- ─── Verify ───────────────────────────────────────────────────
-- After running, check what tables are in the publication:
-- SELECT schemaname, tablename
-- FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime';
