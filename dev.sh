#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Cybot — One-command dev startup
#
# Usage:  ./dev.sh
#
# What it does:
#   1. Detects your current local IP (handles DHCP changes after reboot)
#   2. Updates frontend/.env with the correct IP
#   3. Starts the Django backend in a new Terminal tab/window
#   4. Starts Expo in the current terminal
#
# Run this every time you start development. No more "service not reachable".
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
FRONTEND_ENV="$FRONTEND_DIR/.env"
PORT="${1:-8000}"

# ── 1. Detect current local IP ────────────────────────────────────────────────
detect_ip() {
  # Try primary interface first, then secondary
  local ip
  ip=$(ipconfig getifaddr en0 2>/dev/null) && echo "$ip" && return
  ip=$(ipconfig getifaddr en1 2>/dev/null) && echo "$ip" && return
  ip=$(ipconfig getifaddr en2 2>/dev/null) && echo "$ip" && return
  # Linux fallback
  ip=$(hostname -I 2>/dev/null | awk '{print $1}') && [ -n "$ip" ] && echo "$ip" && return
  echo "127.0.0.1"
}

LOCAL_IP=$(detect_ip)
NEW_URL="http://${LOCAL_IP}:${PORT}/api/v1"

echo ""
echo "  ╔═══════════════════════════════════════════╗"
echo "  ║         CYBOT DEV STARTUP                 ║"
echo "  ╚═══════════════════════════════════════════╝"
echo ""

# ── 2. Update frontend/.env with current IP ───────────────────────────────────
if [ "$LOCAL_IP" = "127.0.0.1" ]; then
  echo "  ⚠️  Could not detect LAN IP — using 127.0.0.1"
  echo "     Physical devices may not reach the backend."
else
  echo "  ✓  Detected IP: $LOCAL_IP"
fi

if [ -f "$FRONTEND_ENV" ]; then
  # Replace existing line in-place (macOS-compatible)
  sed -i.bak "s|EXPO_PUBLIC_API_BASE_URL=.*|EXPO_PUBLIC_API_BASE_URL=${NEW_URL}|" "$FRONTEND_ENV" \
    && rm -f "${FRONTEND_ENV}.bak"
  echo "  ✓  Updated frontend/.env → $NEW_URL"
else
  echo "  ⚠️  frontend/.env not found — creating it"
  echo "EXPO_PUBLIC_API_BASE_URL=${NEW_URL}" >> "$FRONTEND_ENV"
fi

echo ""
echo "  Backend:  http://${LOCAL_IP}:${PORT}/api/v1"
echo "  Health:   http://${LOCAL_IP}:${PORT}/health/"
echo ""

# ── 3. Start Django backend in a new terminal window ──────────────────────────
START_BACKEND="cd '$BACKEND_DIR' && source venv/bin/activate 2>/dev/null || true && python manage.py runserver 0.0.0.0:${PORT}"

if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS — open new Terminal window
  osascript -e "tell application \"Terminal\" to do script \"$START_BACKEND\"" &>/dev/null \
    || (echo "  ℹ  Open a new terminal and run:" && echo "     cd backend && source venv/bin/activate && python manage.py runserver 0.0.0.0:$PORT")
else
  # Linux — try common terminal emulators
  if command -v gnome-terminal &>/dev/null; then
    gnome-terminal -- bash -c "$START_BACKEND; exec bash" &
  elif command -v xterm &>/dev/null; then
    xterm -e "$START_BACKEND" &
  else
    echo "  ℹ  Open a new terminal and run:"
    echo "     cd backend && source venv/bin/activate && python manage.py runserver 0.0.0.0:$PORT"
  fi
fi

echo "  ✓  Backend starting in new terminal window..."
echo ""

# ── 4. Give backend a moment to boot, then start Expo ────────────────────────
echo "  ✓  Starting Expo (Ctrl+C to stop)..."
echo ""

sleep 2

cd "$FRONTEND_DIR"
exec npx expo start
