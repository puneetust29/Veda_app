#!/usr/bin/env bash
# dev.sh — start (or restart) all Veda local servers in one command.
# Run from the project root: ./dev.sh
# See boot-server.md for full documentation.

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_LOG="/tmp/veda_backend.log"
MOBILE_LOG="/tmp/veda_mobile.log"
NODE="/Users/287262/.nvm/versions/node/v24.19.0/bin/node"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Veda Dev — starting local servers"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Kill anything already on port 8000 / 8081 ──────────────────────────
echo ""
echo "[1/4] Stopping existing servers on :8000 and :8081..."
lsof -ti:8000 | xargs kill -9 2>/dev/null && echo "      killed :8000" || echo "      :8000 was free"
lsof -ti:8081 | xargs kill -9 2>/dev/null && echo "      killed :8081" || echo "      :8081 was free"
sleep 1

# ── 2. Detect local IP and update mobile .env ──────────────────────────────
echo ""
echo "[2/4] Detecting local IP..."
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")
echo "      IP: $LOCAL_IP"

MOBILE_ENV="$ROOT/mobile/.env"
if [ -f "$MOBILE_ENV" ]; then
    sed -i '' "s|EXPO_PUBLIC_API_BASE_URL=.*|EXPO_PUBLIC_API_BASE_URL=http://$LOCAL_IP:8000|" "$MOBILE_ENV"
    echo "      Updated mobile/.env → http://$LOCAL_IP:8000"
fi

# ── 3. Start backend ───────────────────────────────────────────────────────
echo ""
echo "[3/4] Starting backend (port 8000)..."
cd "$ROOT/backend"
nohup .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "      PID $BACKEND_PID → logs: $BACKEND_LOG"

# ── 4. Start mobile / Expo ─────────────────────────────────────────────────
echo ""
echo "[4/4] Starting Expo (port 8081)..."
cd "$ROOT/mobile"
nohup "$NODE" node_modules/.bin/expo start > "$MOBILE_LOG" 2>&1 &
MOBILE_PID=$!
echo "      PID $MOBILE_PID → logs: $MOBILE_LOG"

# ── Status ─────────────────────────────────────────────────────────────────
sleep 3
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Backend health check
if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
    echo "  Backend  :8000  ✓  healthy"
else
    echo "  Backend  :8000  ⏳ starting (check $BACKEND_LOG)"
fi

# Expo port check
if lsof -iTCP:8081 -sTCP:LISTEN -n -P > /dev/null 2>&1; then
    echo "  Expo     :8081  ✓  listening"
else
    echo "  Expo     :8081  ⏳ starting (check $MOBILE_LOG)"
fi

echo ""
echo "  Expo Go → exp://$LOCAL_IP:8081"
echo "  Backend → http://$LOCAL_IP:8000"
echo ""
echo "  Logs:  tail -f $BACKEND_LOG"
echo "         tail -f $MOBILE_LOG"
echo ""
echo "  Stop:  kill $BACKEND_PID $MOBILE_PID"
echo "    or:  lsof -ti:8000 -ti:8081 | xargs kill -9"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
