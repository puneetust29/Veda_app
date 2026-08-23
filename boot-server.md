# Boot Server Guide — Veda App

## One-Command Start / Restart

```bash
cd /Users/287262/Documents/Snehashis/repo/Veda_app && ./dev.sh
```

This single script:
- Kills any existing servers on `:8000` and `:8081`
- Detects your current local IP and updates `mobile/.env` automatically
- Starts the FastAPI backend (background, logs → `/tmp/veda_backend.log`)
- Starts the Expo dev server (background, logs → `/tmp/veda_mobile.log`)
- Prints status, Expo Go URL, and stop commands

---

## Project Structure
```
Veda_app/
├── backend/   # FastAPI app (Python/Uvicorn) → Port 8000
└── mobile/    # Expo/React Native app        → Port 8081
```

---

## Prerequisites

- Python 3.9+ with `.venv` set up under `backend/`
- Node.js via nvm: `~/.nvm/versions/node/v24.19.0`
- Run all commands from the project root unless specified

---

## Start Servers

### Backend (Port 8000)
```bash
cd backend && nohup .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 > /tmp/veda_backend.log 2>&1 &
```

### Mobile / Expo (Port 8081)
```bash
cd mobile && nohup /Users/287262/.nvm/versions/node/v24.19.0/bin/node node_modules/.bin/expo start > /tmp/veda_mobile.log 2>&1 &
```

> Both servers run in the background. Logs are written to `/tmp/veda_backend.log` and `/tmp/veda_mobile.log`.

---

## Check Server Status

```bash
lsof -iTCP -sTCP:LISTEN -n -P | grep -E '8000|8081'
```

### Health Check (Backend)
```bash
curl http://localhost:8000/health
# Expected: {"status": "ok"}
```

---

## View Logs

```bash
# Backend logs
cat /tmp/veda_backend.log

# Mobile logs
cat /tmp/veda_mobile.log
```

---

## Stop Servers

```bash
kill $(lsof -ti:8000) $(lsof -ti:8081)
```

---

## Connect via Expo Go (Physical Device)

> Your phone and Mac must be on the **same WiFi network**.

1. Find your Mac's local IP:
   ```bash
   ipconfig getifaddr en0
   ```

2. Make sure `mobile/.env` has the correct IP:
   ```
   EXPO_PUBLIC_API_BASE_URL=http://<your-ip>:8000
   ```

3. Open **Expo Go** on your phone, tap **"Enter URL manually"** and type:
   ```
   exp://<your-ip>:8081
   ```

> If your IP changes (e.g. you switch networks), repeat steps 1 & 2 and restart the servers.

---

## Current Branch
```bash
git branch --show-current
```
> At the time of writing, active branch: `feature/uber-integration`
