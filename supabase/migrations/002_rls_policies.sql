-- ============================================================
-- Migration 002: Row Level Security policies
-- ============================================================

-- ─── Enable RLS on all tables ─────────────────────────────────
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threat_alerts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_audits    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blockchain_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_logs         ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════
-- profiles
-- ════════════════════════════════════════════════════════════
-- Users can only read their own profile
CREATE POLICY "profiles: select own"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

-- Users can only update their own profile
CREATE POLICY "profiles: update own"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- The trigger function (SECURITY DEFINER) handles INSERT — no user INSERT policy needed

-- ════════════════════════════════════════════════════════════
-- threat_alerts
-- ════════════════════════════════════════════════════════════
-- All authenticated users can read active threats
CREATE POLICY "threat_alerts: authenticated select"
    ON public.threat_alerts FOR SELECT
    TO authenticated
    USING (TRUE);

-- Only admins and analysts can insert threats
CREATE POLICY "threat_alerts: admin/analyst insert"
    ON public.threat_alerts FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role IN ('admin', 'analyst')
        )
    );

-- Only admins can update threats
CREATE POLICY "threat_alerts: admin update"
    ON public.threat_alerts FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ════════════════════════════════════════════════════════════
-- privacy_audits
-- ════════════════════════════════════════════════════════════
-- Users see only their own audits
CREATE POLICY "privacy_audits: select own"
    ON public.privacy_audits FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own audits (backend validates)
CREATE POLICY "privacy_audits: insert own"
    ON public.privacy_audits FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════
-- blockchain_records
-- ════════════════════════════════════════════════════════════
-- All authenticated users can read all records (public audit trail)
CREATE POLICY "blockchain_records: authenticated select"
    ON public.blockchain_records FOR SELECT
    TO authenticated
    USING (TRUE);

-- Users can insert their own records (backend validates hash)
CREATE POLICY "blockchain_records: insert own"
    ON public.blockchain_records FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = submitter);

-- ════════════════════════════════════════════════════════════
-- chat_logs
-- ════════════════════════════════════════════════════════════
-- Users see only their own chat logs
CREATE POLICY "chat_logs: select own"
    ON public.chat_logs FOR SELECT
    USING (auth.uid() = user_id);

-- Backend inserts logs — using service_role key (bypasses RLS)
-- No user INSERT policy needed here
