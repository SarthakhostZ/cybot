-- ============================================================
-- Cybot — Complete Schema (all-in-one)
-- Paste the sections below into the Supabase SQL Editor in order,
-- or run: supabase db push  (after supabase link)
--
-- ORDER:
--   Section 1 — Tables + triggers           (migration 001)
--   Section 2 — RLS policies                (migration 002)
--   Section 3 — Storage buckets             (migration 003)
--   Section 4 — Realtime                    (migration 004)
--   Section 5 — Functions, views, indexes   (migration 005)
-- ============================================================


-- ============================================================
-- SECTION 1: Tables + auto-profile trigger
-- ============================================================

-- profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name      TEXT,
    phone          TEXT,
    avatar_url     TEXT,
    security_score INTEGER DEFAULT 50 CHECK (security_score BETWEEN 0 AND 100),
    role           TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'analyst')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', '')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- threat_alerts
CREATE TABLE IF NOT EXISTS public.threat_alerts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title         TEXT NOT NULL,
    description   TEXT NOT NULL,
    severity      TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    threat_type   TEXT NOT NULL,
    ai_confidence NUMERIC(5,4) DEFAULT 0.0 CHECK (ai_confidence BETWEEN 0.0 AND 1.0),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reported_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_threat_alerts_active_detected
    ON public.threat_alerts (is_active, detected_at DESC);

-- privacy_audits
CREATE TABLE IF NOT EXISTS public.privacy_audits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email_scanned   TEXT NOT NULL,
    breach_count    INTEGER NOT NULL DEFAULT 0,
    risk_level      TEXT NOT NULL DEFAULT 'UNKNOWN'
                    CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN')),
    recommendations JSONB NOT NULL DEFAULT '[]'::JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_privacy_audits_user
    ON public.privacy_audits (user_id, created_at DESC);

-- blockchain_records
CREATE TABLE IF NOT EXISTS public.blockchain_records (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_hash   CHAR(64) NOT NULL,
    tx_hash     TEXT,
    submitter   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    verified    BOOLEAN NOT NULL DEFAULT FALSE,
    chain       TEXT NOT NULL DEFAULT 'polygon',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blockchain_data_hash
    ON public.blockchain_records (data_hash);

CREATE TRIGGER blockchain_records_updated_at
    BEFORE UPDATE ON public.blockchain_records
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- chat_logs
CREATE TABLE IF NOT EXISTS public.chat_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_message  TEXT NOT NULL,
    ai_response   TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_logs_user
    ON public.chat_logs (user_id, created_at DESC);


-- ============================================================
-- SECTION 2: RLS Policies
-- ============================================================

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threat_alerts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_audits     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blockchain_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_logs          ENABLE ROW LEVEL SECURITY;

-- profiles: read/update own only
CREATE POLICY "profiles: select own"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "profiles: update own"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- threat_alerts: all auth read; admin+analyst insert; admin update
CREATE POLICY "threat_alerts: authenticated select"
    ON public.threat_alerts FOR SELECT
    TO authenticated USING (TRUE);

CREATE POLICY "threat_alerts: admin/analyst insert"
    ON public.threat_alerts FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('admin', 'analyst')
        )
    );

CREATE POLICY "threat_alerts: admin update"
    ON public.threat_alerts FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- privacy_audits: own only
CREATE POLICY "privacy_audits: select own"
    ON public.privacy_audits FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "privacy_audits: insert own"
    ON public.privacy_audits FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- blockchain_records: all auth read; own insert
CREATE POLICY "blockchain_records: authenticated select"
    ON public.blockchain_records FOR SELECT
    TO authenticated USING (TRUE);

CREATE POLICY "blockchain_records: insert own"
    ON public.blockchain_records FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = submitter);

-- chat_logs: own only (backend inserts via service_role)
CREATE POLICY "chat_logs: select own"
    ON public.chat_logs FOR SELECT
    USING (auth.uid() = user_id);


-- ============================================================
-- SECTION 3: Storage Buckets
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('avatars',        'avatars',        TRUE,  5242880,   ARRAY['image/jpeg','image/png','image/webp','image/gif']),
    ('threat-reports', 'threat-reports', FALSE, 52428800,  ARRAY['application/pdf','application/json','text/plain']),
    ('ml-models',      'ml-models',      FALSE, 524288000, NULL)
ON CONFLICT (id) DO NOTHING;

-- avatars
CREATE POLICY "avatars: public select"   ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "avatars: owner insert"    ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
CREATE POLICY "avatars: owner update"    ON storage.objects FOR UPDATE TO authenticated USING   (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
CREATE POLICY "avatars: owner delete"    ON storage.objects FOR DELETE TO authenticated USING   (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

-- threat-reports
CREATE POLICY "threat-reports: owner select" ON storage.objects FOR SELECT TO authenticated USING   (bucket_id = 'threat-reports' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
CREATE POLICY "threat-reports: owner insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'threat-reports' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
CREATE POLICY "threat-reports: owner delete" ON storage.objects FOR DELETE TO authenticated USING   (bucket_id = 'threat-reports' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

-- ml-models (admin only)
CREATE POLICY "ml-models: admin select" ON storage.objects FOR SELECT TO authenticated USING   (bucket_id = 'ml-models' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "ml-models: admin insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'ml-models' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));


-- ============================================================
-- SECTION 4: Realtime
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.threat_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.blockchain_records;


-- ============================================================
-- SECTION 5: Functions, Views, Indexes
-- ============================================================

-- Security score calculator
CREATE OR REPLACE FUNCTION public.recalculate_security_score(p_user_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_score        INTEGER := 100;
    v_breach_count INTEGER := 0;
    v_risk_level   TEXT    := 'UNKNOWN';
    v_audit_age    INTEGER := 0;
BEGIN
    SELECT breach_count, risk_level,
           EXTRACT(DAY FROM NOW() - created_at)::INTEGER
    INTO v_breach_count, v_risk_level, v_audit_age
    FROM public.privacy_audits
    WHERE user_id = p_user_id
    ORDER BY created_at DESC LIMIT 1;

    IF NOT FOUND THEN RETURN 50; END IF;

    v_score := v_score - LEAST(v_breach_count * 8, 40);
    v_score := v_score - CASE v_risk_level
        WHEN 'CRITICAL' THEN 30 WHEN 'HIGH' THEN 20
        WHEN 'MEDIUM'   THEN 10 WHEN 'LOW'  THEN 0 ELSE 5 END;
    IF v_audit_age > 30 THEN
        v_score := v_score - LEAST((v_audit_age - 30) / 5, 15);
    END IF;
    RETURN GREATEST(LEAST(v_score, 100), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_score_on_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- Threat stats RPC
CREATE OR REPLACE FUNCTION public.get_threat_stats()
RETURNS TABLE (severity TEXT, total BIGINT, active BIGINT, avg_confidence NUMERIC)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
    SELECT severity, COUNT(*), COUNT(*) FILTER (WHERE is_active), ROUND(AVG(ai_confidence), 4)
    FROM public.threat_alerts GROUP BY severity ORDER BY total DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_threat_stats() TO authenticated;

-- Admin role setter (service_role only)
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id UUID, p_role TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF p_role NOT IN ('user','analyst','admin') THEN
        RAISE EXCEPTION 'Invalid role: %', p_role; END IF;
    UPDATE public.profiles SET role = p_role, updated_at = NOW() WHERE id = p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'User % not found', p_user_id; END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_user_role(UUID, TEXT) FROM PUBLIC, authenticated;

-- Dashboard views
CREATE OR REPLACE VIEW public.threat_severity_summary AS
SELECT severity, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active) AS active,
       ROUND(AVG(ai_confidence)*100,1) AS avg_confidence_pct, MAX(detected_at) AS latest_detected_at
FROM public.threat_alerts GROUP BY severity
ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END;

CREATE OR REPLACE VIEW public.recent_active_threats AS
SELECT id, title, severity, threat_type, ai_confidence, detected_at
FROM public.threat_alerts
WHERE is_active = TRUE AND detected_at >= NOW() - INTERVAL '24 hours'
ORDER BY detected_at DESC;

CREATE OR REPLACE VIEW public.user_security_dashboard AS
SELECT p.id AS user_id, p.full_name, p.security_score, p.role,
       COUNT(DISTINCT pa.id)  AS total_audits,   MAX(pa.created_at) AS last_audit_at,
       COALESCE(SUM(pa.breach_count),0) AS total_breaches,
       COUNT(DISTINCT cl.id)  AS total_chats,
       COUNT(DISTINCT br.id)  AS total_blockchain_records
FROM public.profiles p
LEFT JOIN public.privacy_audits     pa ON pa.user_id   = p.id
LEFT JOIN public.chat_logs          cl ON cl.user_id   = p.id
LEFT JOIN public.blockchain_records br ON br.submitter = p.id
GROUP BY p.id, p.full_name, p.security_score, p.role;

GRANT SELECT ON public.threat_severity_summary  TO authenticated;
GRANT SELECT ON public.recent_active_threats    TO authenticated;
GRANT SELECT ON public.user_security_dashboard  TO authenticated;

-- Additional indexes
CREATE INDEX IF NOT EXISTS idx_threat_alerts_type       ON public.threat_alerts (threat_type, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_threat_alerts_confidence ON public.threat_alerts (ai_confidence DESC) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_privacy_audits_breach    ON public.privacy_audits (user_id, breach_count DESC);
CREATE INDEX IF NOT EXISTS idx_blockchain_unverified    ON public.blockchain_records (verified, created_at) WHERE verified = FALSE;
