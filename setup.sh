#!/usr/bin/env bash
# setup.sh — one-time setup for Veda dev environment.
# Run from the project root: ./setup.sh

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Veda Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Check prerequisites ─────────────────────────────────────────────────
echo ""
echo "[1/4] Checking prerequisites..."

# Python
if ! command -v python3 &>/dev/null; then
    echo "  ✗  python3 not found — install Python 3.9+ and re-run"
    exit 1
fi
PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)
if [ "$PYTHON_MAJOR" -lt 3 ] || { [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 9 ]; }; then
    echo "  ✗  Python $PYTHON_VERSION found — need 3.9+"
    exit 1
fi
echo "  ✓  Python $PYTHON_VERSION"

# Node
if ! command -v node &>/dev/null; then
    echo "  ✗  node not found — install Node.js 18+ and re-run"
    exit 1
fi
NODE_VERSION=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "  ✗  Node v$NODE_VERSION found — need 18+"
    exit 1
fi
echo "  ✓  Node $(node --version)"

# npm
if ! command -v npm &>/dev/null; then
    echo "  ✗  npm not found — install Node.js 18+ and re-run"
    exit 1
fi
echo "  ✓  npm $(npm --version)"

# ── 2. Backend ─────────────────────────────────────────────────────────────
echo ""
echo "[2/4] Setting up backend..."

cd "$ROOT/backend"

if [ ! -d ".venv" ]; then
    echo "      Creating Python virtual environment..."
    python3 -m venv .venv
fi
echo "      Installing Python dependencies..."
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements.txt
echo "  ✓  Backend dependencies installed"

if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "  ✓  Created backend/.env from .env.example"
    echo "  ⚠  Fill in backend/.env with real secrets before running ./dev.sh"
else
    echo "  ✓  backend/.env already exists"
fi

# ── 3. Mobile ──────────────────────────────────────────────────────────────
echo ""
echo "[3/4] Setting up mobile..."

cd "$ROOT/mobile"

echo "      Installing Node dependencies..."
npm install --silent
echo "  ✓  Mobile dependencies installed"

if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "  ✓  Created mobile/.env from .env.example"
else
    echo "  ✓  mobile/.env already exists"
fi

# ── 4. Done ────────────────────────────────────────────────────────────────
echo ""
echo "[4/4] Done!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Next steps"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  1. Fill in backend/.env with real secrets"
echo "     (get this from the team)"
echo ""
echo "  2. Run the app:"
echo "     ./dev.sh"
echo ""
echo "  3. Open Expo Go on your phone and enter:"
echo "     exp://<your-machine-IP>:8081"
echo "     (dev.sh will print the exact URL)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
