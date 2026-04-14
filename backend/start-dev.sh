#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Cybot backend — development server
#
# Binds to 0.0.0.0:8000 so physical devices and emulators on the same
# network can reach the API.  Never use this script in production.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PORT="${1:-8000}"

# ── Detect local LAN IP ───────────────────────────────────────────────────────
if command -v ipconfig &>/dev/null; then
  # macOS
  LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null \
    || ipconfig getifaddr en1 2>/dev/null \
    || echo "127.0.0.1")
else
  # Linux
  LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
fi

FRONTEND_ENV="../frontend/.env"

# ── Auto-update frontend .env with current IP ─────────────────────────────────
if [[ -f "$FRONTEND_ENV" && "$LOCAL_IP" != "127.0.0.1" ]]; then
  NEW_URL="http://${LOCAL_IP}:${PORT}/api/v1"
  if grep -q "EXPO_PUBLIC_API_BASE_URL" "$FRONTEND_ENV"; then
    # Replace existing line (macOS + Linux compatible)
    sed -i.bak "s|EXPO_PUBLIC_API_BASE_URL=.*|EXPO_PUBLIC_API_BASE_URL=${NEW_URL}|" "$FRONTEND_ENV" \
      && rm -f "${FRONTEND_ENV}.bak"
    echo "Updated frontend/.env → EXPO_PUBLIC_API_BASE_URL=${NEW_URL}"
  fi
fi

echo ""
echo "  Cybot Dev Backend"
echo "  ─────────────────────────────────────────"
echo "  Local:    http://127.0.0.1:${PORT}/api/v1"
echo "  Network:  http://${LOCAL_IP}:${PORT}/api/v1"
echo "  ─────────────────────────────────────────"
echo "  Set EXPO_PUBLIC_API_BASE_URL=http://${LOCAL_IP}:${PORT}/api/v1"
echo "  in frontend/.env if not auto-updated above."
echo ""

# ── Activate venv if present ──────────────────────────────────────────────────
if [[ -f "venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source venv/bin/activate
fi

exec python manage.py runserver "0.0.0.0:${PORT}"
