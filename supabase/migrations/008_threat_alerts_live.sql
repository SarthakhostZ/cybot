-- ============================================================
-- Migration 008: threat_alerts table (Live Threats)
--
-- Creates the threat_alerts table with the schema expected by
-- the Django backend. The v1 definition in 001_create_tables.sql
-- used different column names (ai_confidence, reported_by) and
-- was never applied to the live DB — this replaces it entirely.
--
-- Run in: Supabase Dashboard → SQL Editor
-- Prerequisites: 001_create_tables.sql must have run first
--   (it creates the set_updated_at() trigger function).
-- ============================================================

-- ─── Drop old table if it exists with wrong schema ────────────
DROP TABLE IF EXISTS public.threat_alerts CASCADE;

-- ─── threat_alerts ─────────────────────────────────────────────
CREATE TABLE public.threat_alerts (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
    title         TEXT         NOT NULL,
    description   TEXT         NOT NULL DEFAULT '',
    severity      TEXT         NOT NULL DEFAULT 'LOW'
                               CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    threat_type   TEXT         NOT NULL DEFAULT 'other'
                               CHECK (threat_type IN (
                                   'malware', 'phishing', 'data_breach', 'ransomware',
                                   'ddos', 'insider_threat', 'vulnerability', 'other'
                               )),
    confidence    NUMERIC(6,4) NOT NULL DEFAULT 1.0
                               CHECK (confidence BETWEEN 0.0 AND 1.0),
    source_ip     INET,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    ml_model_used TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Indexes ───────────────────────────────────────────────────
CREATE INDEX idx_threat_alerts_active_created
    ON public.threat_alerts (is_active, created_at DESC);

CREATE INDEX idx_threat_alerts_user
    ON public.threat_alerts (user_id, created_at DESC);

CREATE INDEX idx_threat_alerts_severity_active
    ON public.threat_alerts (severity, created_at DESC)
    WHERE is_active = TRUE;

-- ─── Auto-update updated_at trigger ───────────────────────────
DROP TRIGGER IF EXISTS threat_alerts_updated_at ON public.threat_alerts;
CREATE TRIGGER threat_alerts_updated_at
    BEFORE UPDATE ON public.threat_alerts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Row Level Security ────────────────────────────────────────
ALTER TABLE public.threat_alerts ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read all threats
DROP POLICY IF EXISTS "threat_alerts: authenticated select" ON public.threat_alerts;
CREATE POLICY "threat_alerts: authenticated select"
    ON public.threat_alerts FOR SELECT
    TO authenticated
    USING (TRUE);

-- Any authenticated user can insert (e.g. from URL scan)
DROP POLICY IF EXISTS "threat_alerts: user insert" ON public.threat_alerts;
CREATE POLICY "threat_alerts: user insert"
    ON public.threat_alerts FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own threats (ignore/resolve).
-- Admins and analysts can update any threat.
DROP POLICY IF EXISTS "threat_alerts: owner or analyst update" ON public.threat_alerts;
CREATE POLICY "threat_alerts: owner or analyst update"
    ON public.threat_alerts FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role IN ('admin', 'analyst')
        )
    );

-- ─── Realtime (INSERT + UPDATE events for the live feed) ──────
-- Supabase creates supabase_realtime automatically; we just add
-- threat_alerts so clients get live INSERT and UPDATE events.
ALTER PUBLICATION supabase_realtime ADD TABLE public.threat_alerts;

-- ─── get_threat_stats() RPC ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_threat_stats()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSON;
BEGIN
    SELECT json_build_object(
        'total_threats',  COUNT(*),
        'active_threats', COUNT(*) FILTER (WHERE is_active),
        'critical_count', COUNT(*) FILTER (WHERE severity = 'CRITICAL'),
        'high_count',     COUNT(*) FILTER (WHERE severity = 'HIGH'),
        'medium_count',   COUNT(*) FILTER (WHERE severity = 'MEDIUM'),
        'low_count',      COUNT(*) FILTER (WHERE severity = 'LOW'),
        'avg_confidence', ROUND(AVG(confidence)::NUMERIC, 4)
    ) INTO result
    FROM public.threat_alerts;
    RETURN result;
END;
$$;
