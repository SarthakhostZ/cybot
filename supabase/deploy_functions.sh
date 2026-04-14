#!/usr/bin/env bash
# supabase/deploy_functions.sh
#
# Deploys all Edge Functions and sets required secrets.
# Run: chmod +x deploy_functions.sh && ./deploy_functions.sh
#
# Prerequisites:
#   - Supabase CLI installed (brew install supabase/tap/supabase)
#   - supabase link --project-ref YOUR_PROJECT_REF  (already done)
#   - Environment variables below must be exported in your shell

set -euo pipefail

: "${SUPABASE_PROJECT_REF:?  Set SUPABASE_PROJECT_REF}"
: "${DJANGO_API_URL:?         Set DJANGO_API_URL (e.g. https://api.cybot.example.com)}"
: "${INTERNAL_SERVICE_KEY:?   Set INTERNAL_SERVICE_KEY}"
: "${EXPO_ACCESS_TOKEN:?      Set EXPO_ACCESS_TOKEN (from expo.dev account)}"

echo "==> Deploying Edge Functions to project: $SUPABASE_PROJECT_REF"

# ─── Deploy functions ─────────────────────────────────────────────────────────
supabase functions deploy notify-threat   --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
supabase functions deploy scheduled-scan  --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
supabase functions deploy ml-inference    --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt

echo "==> Functions deployed"

# ─── Set secrets ──────────────────────────────────────────────────────────────
supabase secrets set \
  DJANGO_API_URL="$DJANGO_API_URL" \
  INTERNAL_SERVICE_KEY="$INTERNAL_SERVICE_KEY" \
  EXPO_ACCESS_TOKEN="$EXPO_ACCESS_TOKEN" \
  --project-ref "$SUPABASE_PROJECT_REF"

echo "==> Secrets set"

# ─── Run migration 006 ────────────────────────────────────────────────────────
echo "==> Pushing migration 006 (push_tokens table)..."
supabase db push --project-ref "$SUPABASE_PROJECT_REF"

echo "==> Phase 4 deploy complete."
echo ""
echo "    Verify Edge Functions:"
echo "    https://supabase.com/dashboard/project/$SUPABASE_PROJECT_REF/functions"
echo ""
echo "    Cron schedule (scheduled-scan @ 02:00 UTC) is set in config.toml."
echo "    Check: Dashboard → Edge Functions → scheduled-scan → Cron"
