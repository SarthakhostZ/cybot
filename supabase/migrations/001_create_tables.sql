-- ============================================================
-- Migration 001: Create core tables
-- Run in: Supabase SQL Editor or via supabase db push
-- ============================================================

-- ─── profiles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name   TEXT,
    phone       TEXT,
    avatar_url  TEXT,
    security_score INTEGER DEFAULT 50 CHECK (security_score BETWEEN 0 AND 100),
    role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'analyst')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
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

-- ─── Auto-create profile on auth.users INSERT ─────────────────
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

-- ─── threat_alerts ────────────────────────────────────────────
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

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_threat_alerts_active_detected
    ON public.threat_alerts (is_active, detected_at DESC);

-- ─── privacy_audits ───────────────────────────────────────────
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

-- ─── blockchain_records ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.blockchain_records (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_hash   CHAR(64) NOT NULL,              -- SHA-256 hex
    tx_hash     TEXT,                            -- on-chain tx hash (NULL until confirmed)
    submitter   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    verified    BOOLEAN NOT NULL DEFAULT FALSE,
    chain       TEXT NOT NULL DEFAULT 'polygon',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blockchain_data_hash
    ON public.blockchain_records (data_hash);

-- ─── chat_logs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_message  TEXT NOT NULL,
    ai_response   TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_logs_user
    ON public.chat_logs (user_id, created_at DESC);
