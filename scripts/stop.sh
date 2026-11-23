#!/bin/zsh
# Stop all Veda servers
# Usage: ./scripts/stop.sh

echo "============================================"
echo "  VEDA — Stopping all servers"
echo "============================================"

echo ""
pkill -f "uvicorn" 2>/dev/null && echo "✅ Backend stopped" || echo "⚠️  Backend not running"
pkill -f "expo" 2>/dev/null && echo "✅ Expo stopped" || echo "⚠️  Expo not running"
pkill -f "metro" 2>/dev/null && echo "✅ Metro stopped" || echo "⚠️  Metro not running"
xcrun simctl shutdown all 2>/dev/null && echo "✅ Simulators shut down" || echo "⚠️  No simulators running"

echo ""
echo "  Ports:"
lsof -i :8000 2>/dev/null | head -1 && echo "  ⚠️  Port 8000 still in use" || echo "  ✅ Port 8000 free"
lsof -i :8081 2>/dev/null | head -1 && echo "  ⚠️  Port 8081 still in use" || echo "  ✅ Port 8081 free"

echo ""
echo "============================================"
echo "  ✅ All stopped"
echo "============================================"
