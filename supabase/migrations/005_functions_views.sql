-- ============================================================
-- Migration 005: Database functions, triggers, and views
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- A. Security Score Automation
--    Recalculates a user's security_score whenever a new
--    privacy_audit is inserted.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.recalculate_security_score(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_score        INTEGER := 100;
    v_breach_count INTEGER := 0;
    v_risk_level   TEXT    := 'UNKNOWN';
    v_audit_age    INTEGER := 0;  -- days since last audit
BEGIN
    -- Get most recent audit
    SELECT
        breach_count,
        risk_level,
        EXTRACT(DAY FROM NOW() - created_at)::INTEGER
    INTO v_breach_count, v_risk_level, v_audit_age
    FROM public.privacy_audits
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        -- No audit yet: neutral score
        RETURN 50;
    END IF;

    -- Deduct for breaches (up to -40 pts)
    v_score := v_score - LEAST(v_breach_count * 8, 40);

    -- Deduct for risk level
    v_score := v_score - CASE v_risk_level
        WHEN 'CRITICAL' THEN 30
        WHEN 'HIGH'     THEN 20
        WHEN 'MEDIUM'   THEN 10
        WHEN 'LOW'      THEN 0
        ELSE 5  -- UNKNOWN = slight penalty
    END;

    -- Deduct for stale audit (> 30 days old)
    IF v_audit_age > 30 THEN
        v_score := v_score - LEAST((v_audit_age - 30) / 5, 15);
    END IF;

    RETURN GREATEST(LEAST(v_score, 100), 0);
END;
$$;

-- Trigger: auto-update profile.security_score on new audit
CREATE OR REPLACE FUNCTION public.update_score_on_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.profiles
    SET security_score = public.recalculate_security_score(NEW.user_id),
        updated_at     = NOW()
    WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_score_on_audit ON public.privacy_audits;
CREATE TRIGGER trg_update_score_on_audit
    AFTER INSERT ON public.privacy_audits
    FOR EACH ROW EXECUTE FUNCTION public.update_score_on_audit();


-- ════════════════════════════════════════════════════════════
-- B. updated_at triggers for all mutable tables
-- ════════════════════════════════════════════════════════════

-- privacy_audits is insert-only (audits are never mutated), so
-- no updated_at needed.

-- blockchain_records: tx_hash and verified are updated on-chain confirmation
ALTER TABLE public.blockchain_records
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS blockchain_records_updated_at ON public.blockchain_records;
CREATE TRIGGER blockchain_records_updated_at
    BEFORE UPDATE ON public.blockchain_records
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ════════════════════════════════════════════════════════════
-- C. Views for dashboard queries
-- ════════════════════════════════════════════════════════════

-- C1. Threat severity summary (anonymous-safe: no user data)
CREATE OR REPLACE VIEW public.threat_severity_summary AS
SELECT
    severity,
    COUNT(*)                             AS total,
    COUNT(*) FILTER (WHERE is_active)    AS active,
    ROUND(AVG(ai_confidence) * 100, 1)  AS avg_confidence_pct,
    MAX(detected_at)                     AS latest_detected_at
FROM public.threat_alerts
GROUP BY severity
ORDER BY
    CASE severity
        WHEN 'CRITICAL' THEN 1
        WHEN 'HIGH'     THEN 2
        WHEN 'MEDIUM'   THEN 3
        WHEN 'LOW'      THEN 4
    END;

-- C2. Recent active threats (last 24 h) — used by HomeScreen quick-view
CREATE OR REPLACE VIEW public.recent_active_threats AS
SELECT
    id,
    title,
    severity,
    threat_type,
    ai_confidence,
    detected_at
FROM public.threat_alerts
WHERE is_active = TRUE
  AND detected_at >= NOW() - INTERVAL '24 hours'
ORDER BY detected_at DESC;

-- C3. User security dashboard view (RLS will enforce ownership)
CREATE OR REPLACE VIEW public.user_security_dashboard AS
SELECT
    p.id                                      AS user_id,
    p.full_name,
    p.security_score,
    p.role,
    COUNT(DISTINCT pa.id)                     AS total_audits,
    MAX(pa.created_at)                        AS last_audit_at,
    COALESCE(SUM(pa.breach_count), 0)         AS total_breaches,
    COUNT(DISTINCT cl.id)                     AS total_chats,
    COUNT(DISTINCT br.id)                     AS total_blockchain_records
FROM public.profiles p
LEFT JOIN public.privacy_audits    pa ON pa.user_id  = p.id
LEFT JOIN public.chat_logs         cl ON cl.user_id  = p.id
LEFT JOIN public.blockchain_records br ON br.submitter = p.id
GROUP BY p.id, p.full_name, p.security_score, p.role;

-- Enable RLS on views (views inherit table RLS by default in Postgres,
-- but explicitly granting ensures correct access in Supabase).
GRANT SELECT ON public.threat_severity_summary  TO authenticated;
GRANT SELECT ON public.recent_active_threats    TO authenticated;
GRANT SELECT ON public.user_security_dashboard  TO authenticated;


-- ════════════════════════════════════════════════════════════
-- D. Threat stats RPC (callable from supabase-js as .rpc())
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_threat_stats()
RETURNS TABLE (
    severity        TEXT,
    total           BIGINT,
    active          BIGINT,
    avg_confidence  NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT
        severity,
        COUNT(*)                           AS total,
        COUNT(*) FILTER (WHERE is_active)  AS active,
        ROUND(AVG(ai_confidence), 4)       AS avg_confidence
    FROM public.threat_alerts
    GROUP BY severity
    ORDER BY total DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_threat_stats() TO authenticated;


-- ════════════════════════════════════════════════════════════
-- E. Admin helper: promote user to analyst / admin role
--    Only callable with service_role key (not exposed to clients)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_user_role(
    p_user_id UUID,
    p_role    TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_role NOT IN ('user', 'analyst', 'admin') THEN
        RAISE EXCEPTION 'Invalid role: %', p_role;
    END IF;

    UPDATE public.profiles
    SET role       = p_role,
        updated_at = NOW()
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User % not found in profiles', p_user_id;
    END IF;
END;
$$;

-- Only service_role can call this (no GRANT to authenticated)
REVOKE EXECUTE ON FUNCTION public.set_user_role(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_user_role(UUID, TEXT) FROM authenticated;


-- ════════════════════════════════════════════════════════════
-- F. Additional performance indexes
-- ════════════════════════════════════════════════════════════

-- Threat alerts: filter by type is common in the ML pipeline
CREATE INDEX IF NOT EXISTS idx_threat_alerts_type
    ON public.threat_alerts (threat_type, detected_at DESC);

-- Threat alerts: high-confidence active threats (dashboard sort)
CREATE INDEX IF NOT EXISTS idx_threat_alerts_confidence
    ON public.threat_alerts (ai_confidence DESC)
    WHERE is_active = TRUE;

-- Privacy audits: breach count queries for reporting
CREATE INDEX IF NOT EXISTS idx_privacy_audits_breach_count
    ON public.privacy_audits (user_id, breach_count DESC);

-- Blockchain records: unverified records (for confirmation polling)
CREATE INDEX IF NOT EXISTS idx_blockchain_unverified
    ON public.blockchain_records (verified, created_at)
    WHERE verified = FALSE;

-- chat_logs: full-text search baseline (Phase 7 will add tsvector)
CREATE INDEX IF NOT EXISTS idx_chat_logs_created
    ON public.chat_logs (user_id, created_at DESC);
