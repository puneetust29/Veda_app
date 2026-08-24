#!/usr/bin/env bash
# stop.sh — stop all Veda local servers.
# Run from the project root: ./stop.sh

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Veda Dev — stopping local servers"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

lsof -ti:8000 | xargs kill -9 2>/dev/null && echo "  Backend  :8000  stopped" || echo "  Backend  :8000  was not running"
lsof -ti:8081 | xargs kill -9 2>/dev/null && echo "  Expo     :8081  stopped" || echo "  Expo     :8081  was not running"

echo ""
echo "  All servers stopped."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
