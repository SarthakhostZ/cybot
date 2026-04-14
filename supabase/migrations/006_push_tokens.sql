-- ============================================================
-- Migration 006: Push tokens + helper RPCs for Edge Functions
-- ============================================================

-- ─── push_tokens ─────────────────────────────────────────────
-- Stores Expo push tokens per device so notify-threat can fan-out.

CREATE TABLE IF NOT EXISTS public.push_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token      TEXT NOT NULL,                       -- ExponentPushToken[...]
    platform   TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, token)                         -- one row per device
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user
    ON public.push_tokens (user_id);

CREATE TRIGGER push_tokens_updated_at
    BEFORE UPDATE ON public.push_tokens
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Users manage their own tokens
CREATE POLICY "push_tokens: select own"
    ON public.push_tokens FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "push_tokens: insert own"
    ON public.push_tokens FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_tokens: delete own"
    ON public.push_tokens FOR DELETE
    USING (auth.uid() = user_id);

-- ─── RPC: get_all_push_tokens ─────────────────────────────────
-- Called by notify-threat Edge Function (service_role).
-- Returns all tokens for active users.
CREATE OR REPLACE FUNCTION public.get_all_push_tokens()
RETURNS TABLE (
    user_id  UUID,
    token    TEXT,
    platform TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT pt.user_id, pt.token, pt.platform
    FROM public.push_tokens pt
    INNER JOIN public.profiles p ON p.id = pt.user_id
    ORDER BY pt.user_id;
$$;
-- Only callable via service_role key
REVOKE EXECUTE ON FUNCTION public.get_all_push_tokens() FROM PUBLIC, authenticated;


-- ─── RPC: get_users_needing_scan ─────────────────────────────
-- Called by scheduled-scan Edge Function (service_role).
-- Returns user UUIDs + emails for users whose last audit is older
-- than p_days_threshold days, or who have never been scanned.
CREATE OR REPLACE FUNCTION public.get_users_needing_scan(
    p_days_threshold INTEGER DEFAULT 7
)
RETURNS TABLE (
    user_id UUID,
    email   TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT
        p.id AS user_id,
        u.email
    FROM public.profiles p
    INNER JOIN auth.users u ON u.id = p.id
    WHERE
        -- Never scanned
        NOT EXISTS (
            SELECT 1 FROM public.privacy_audits pa
            WHERE pa.user_id = p.id
        )
        OR
        -- Last scan older than threshold
        (
            SELECT MAX(created_at) FROM public.privacy_audits pa
            WHERE pa.user_id = p.id
        ) < NOW() - (p_days_threshold || ' days')::INTERVAL;
$$;
REVOKE EXECUTE ON FUNCTION public.get_users_needing_scan(INTEGER) FROM PUBLIC, authenticated;


-- ─── RPC: upsert_push_token ───────────────────────────────────
-- Upserts a push token for the calling user.
-- Callable from authenticated clients (frontend).
CREATE OR REPLACE FUNCTION public.upsert_push_token(
    p_token    TEXT,
    p_platform TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_platform NOT IN ('ios', 'android', 'web') THEN
        RAISE EXCEPTION 'Invalid platform: %', p_platform;
    END IF;
    INSERT INTO public.push_tokens (user_id, token, platform)
    VALUES (auth.uid(), p_token, p_platform)
    ON CONFLICT (user_id, token) DO UPDATE
        SET platform   = EXCLUDED.platform,
            updated_at = NOW();
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_push_token(TEXT, TEXT) TO authenticated;


-- ─── RPC: delete_push_token ──────────────────────────────────
-- Removes a specific token (e.g. on sign-out from a device).
CREATE OR REPLACE FUNCTION public.delete_push_token(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.push_tokens
    WHERE user_id = auth.uid() AND token = p_token;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_push_token(TEXT) TO authenticated;
