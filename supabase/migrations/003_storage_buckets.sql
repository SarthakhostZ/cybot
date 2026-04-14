-- ============================================================
-- Migration 003: Storage buckets + access policies
-- ============================================================

-- ─── avatars (public read, authenticated write) ───────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'avatars',
    'avatars',
    TRUE,    -- public read
    5242880, -- 5 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view avatars (public bucket)
CREATE POLICY "avatars: public select"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'avatars');

-- Authenticated users can upload/update only their own avatar
-- Path convention: {user_id}/avatar.{ext}
CREATE POLICY "avatars: owner insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::TEXT
    );

CREATE POLICY "avatars: owner update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::TEXT
    );

CREATE POLICY "avatars: owner delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::TEXT
    );

-- ─── threat-reports (private, user-scoped) ────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'threat-reports',
    'threat-reports',
    FALSE,    -- private
    52428800, -- 50 MB
    ARRAY['application/pdf', 'application/json', 'text/plain']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "threat-reports: owner select"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'threat-reports'
        AND (storage.foldername(name))[1] = auth.uid()::TEXT
    );

CREATE POLICY "threat-reports: owner insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'threat-reports'
        AND (storage.foldername(name))[1] = auth.uid()::TEXT
    );

CREATE POLICY "threat-reports: owner delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'threat-reports'
        AND (storage.foldername(name))[1] = auth.uid()::TEXT
    );

-- ─── ml-models (admin only) ───────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
    'ml-models',
    'ml-models',
    FALSE,
    524288000  -- 500 MB for large model files
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "ml-models: admin select"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'ml-models'
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "ml-models: admin insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'ml-models'
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );
