#!/bin/zsh
# Start all Veda servers for local development
# Usage: ./scripts/start.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "============================================"
echo "  VEDA — Starting all servers"
echo "============================================"

# 1. Backend (Python 3.12 with browser agent support)
echo ""
echo "🔧 Starting backend..."
cd "$ROOT/backend"
if [ -d ".venv-browser" ]; then
    .venv-browser/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > /tmp/veda-backend.log 2>&1 &
    echo "   Backend PID: $! (Python 3.12 + browser agent)"
else
    .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > /tmp/veda-backend.log 2>&1 &
    echo "   Backend PID: $! (Python 3.9)"
fi

# Wait for backend to be ready
echo -n "   Waiting for backend"
for i in {1..20}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo " ✅"
        break
    fi
    echo -n "."
    sleep 1
done

# 2. iOS Simulator
echo ""
echo "📱 Booting simulator..."
# Prefer iOS 26.5 (Xcode 26.x compatible), fall back to any available
SIM_ID=$(xcrun simctl list devices available | grep "iPhone.*26\." | head -1 | grep -oE '[A-F0-9-]{36}')
if [ -z "$SIM_ID" ]; then
    SIM_ID=$(xcrun simctl list devices available | grep "iPhone.*Shutdown" | head -1 | grep -oE '[A-F0-9-]{36}')
fi
if [ -n "$SIM_ID" ]; then
    xcrun simctl boot "$SIM_ID" 2>/dev/null || true
    open -a Simulator
    SIM_NAME=$(xcrun simctl list devices | grep "$SIM_ID" | sed 's/(.*//' | xargs)
    echo "   Simulator: $SIM_NAME ✅"
else
    echo "   ⚠️  No simulator found"
fi

# 3. Mobile (Expo)
echo ""
echo "📲 Starting Expo..."
cd "$ROOT/mobile"
NODE_TLS_REJECT_UNAUTHORIZED=0 npx expo start --go --clear > /tmp/veda-expo.log 2>&1 &
echo "   Expo PID: $!"

# Wait for Metro to be ready
echo -n "   Waiting for Metro"
for i in {1..30}; do
    if curl -s http://localhost:8081/status 2>/dev/null | grep -q "running"; then
        echo " ✅"
        break
    fi
    echo -n "."
    sleep 1
done

# 4. Open app in simulator
echo ""
echo "🚀 Opening app in simulator..."
sleep 2
xcrun simctl openurl booted "exp://127.0.0.1:8081" 2>/dev/null && echo "   App launched ✅" || echo "   ⚠️  Could not open app"

echo ""
echo "============================================"
echo "  ✅ All servers running"
echo "============================================"
echo "  Backend:   http://localhost:8000"
echo "  Metro:     http://localhost:8081"
echo "  Logs:      /tmp/veda-backend.log"
echo "             /tmp/veda-expo.log"
echo ""
echo "  Stop all:  ./scripts/stop.sh"
echo "============================================"
