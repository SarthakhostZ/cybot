-- ============================================================
-- Migration: 007_create_link_scans.sql
-- LinkGuard — persistent URL scan results table
-- ============================================================

CREATE TABLE IF NOT EXISTS link_scans (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID            REFERENCES auth.users(id) ON DELETE CASCADE,
    url             TEXT            NOT NULL,
    url_hash        VARCHAR(64)     NOT NULL,
    client_score    INTEGER         NOT NULL,
    backend_score   INTEGER,
    ai_score        INTEGER,
    final_score     INTEGER,
    verdict         VARCHAR(20)     NOT NULL,          -- safe | suspicious | dangerous
    flags           JSONB           DEFAULT '[]',
    ai_explanation  TEXT,
    domain_age_days INTEGER,
    google_safe_browsing JSONB,
    redirect_chain  JSONB,
    ssl_valid       BOOLEAN,
    created_at      TIMESTAMPTZ     DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_link_scans_user_id     ON link_scans (user_id);
CREATE INDEX IF NOT EXISTS idx_link_scans_url_hash    ON link_scans (url_hash);
CREATE INDEX IF NOT EXISTS idx_link_scans_created_at  ON link_scans (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_link_scans_verdict     ON link_scans (verdict);

-- Enable Row Level Security
ALTER TABLE link_scans ENABLE ROW LEVEL SECURITY;

-- Users can only read their own scans
CREATE POLICY "users_select_own_scans"
    ON link_scans FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own scans (Django backend writes with service_role key,
-- but allow direct insert from client for offline-first flows)
CREATE POLICY "users_insert_own_scans"
    ON link_scans FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Service role (Django backend) can read/write all rows
CREATE POLICY "service_role_full_access"
    ON link_scans FOR ALL
    USING (auth.role() = 'service_role');

-- Stat view for dashboard widget
CREATE OR REPLACE VIEW link_scan_stats AS
    SELECT
        user_id,
        COUNT(*)                                             AS total_scans,
        COUNT(*) FILTER (WHERE verdict = 'dangerous')        AS threats_blocked,
        COUNT(*) FILTER (WHERE verdict = 'suspicious')       AS suspicious_count,
        COUNT(*) FILTER (WHERE verdict = 'safe')             AS safe_count,
        MAX(created_at)                                      AS last_scan_at
    FROM link_scans
    GROUP BY user_id;
