# Veda AI Companion App

A telecom AI roaming companion POC with a FastAPI backend and React Native mobile frontend.

## Prerequisites

- **Python 3.9+** (for backend)
- **Node.js 18+** (for mobile app)
- **npm** or **yarn** (for package management)

## Project Structure

```
Veda_app/
├── backend/          # FastAPI application
│   ├── app/
│   ├── requirements.txt
│   └── tests/
└── mobile/           # Expo/React Native app
    ├── src/
    ├── package.json
    └── .env.example
```

---

## Backend Setup

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Environment

Create a `.env` file in the `backend/` directory with the necessary environment variables. Reference your existing configuration or ask your team lead for the required keys.

### 3. Run the Server

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The backend will be available at `http://localhost:8000`

**Health check:** Visit `http://localhost:8000/health` to verify the server is running.

---

## Mobile App Setup

### 1. Install Dependencies

```bash
cd mobile
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Update `.env` with your backend URL:

```
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000
```

### 3. Run the App

Start the Expo development server:

```bash
npm start
```

Then choose your platform:

- **iOS Simulator:** Press `i`
- **Android Emulator:** Press `a`
- **Web:** Press `w`
- **Physical Device:** Scan the QR code with the Expo Go app

---

## Signing In (POC Dev Login)

This is a POC, so real Supabase phone/OTP verification is stubbed out. The sign-in screen calls a
`dev-login` endpoint that skips OTP entirely.

1. On the sign-in screen, enter any phone number (e.g. `+15550001111`, matching the field's
   placeholder).
2. Tap **Sign in** — no OTP code is required.
3. The backend looks up a customer with that phone number and, if none exists yet, auto-creates
   one on the fly with placeholder details (`full_name: "New Customer"`, `telecom_plan: "Standard
   Mobile"`). Use the same number again later to sign back into that same dummy customer.

Notes:

- This only works because the backend's dev-login route (`POST /auth/dev-login`) is disabled
  whenever `ENVIRONMENT=production` — it's a dev/POC-only shortcut, not a real auth bypass.
- Any phone number works; there's no single fixed "seed" user, each unique number gets its own
  auto-created customer record.

---

## Common Commands

### Backend

```bash
# Run with auto-reload
uvicorn app.main:app --reload

# Run tests
pytest

# Run specific test
pytest tests/test_agent_graph.py -v
```

### Mobile

```bash
# Start dev server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Run on web
npm run web
```

---

## Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| Backend won't start | Check Python version is 3.9+, verify all dependencies installed with `pip install -r requirements.txt` |
| Port 8000 already in use | Kill the process or specify a different port: `uvicorn app.main:app --port 8001` |
| Mobile app can't connect to backend | Verify `.env` has correct `EXPO_PUBLIC_API_BASE_URL` pointing to your backend URL |
| Dependencies not installing | Try deleting `node_modules` and `package-lock.json`, then run `npm install` again |
| Expo app not connecting | Make sure backend and mobile are on the same network, or use `http://localhost:8000` if testing on same machine |

---

## Useful Links

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)

---

## Questions?

Reach out to the team or check the project documentation for more details.
