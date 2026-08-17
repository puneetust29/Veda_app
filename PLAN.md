# AI Companion App — Build Plan

Telecom AI companion POC (Europe market persona). Stack: React Native (Expo) mobile app,
FastAPI backend, deployed on Railway, Supabase for Postgres + Auth (phone/OTP).

Core POC flow: read the user's calendar (mocked for now) → detect an upcoming flight →
surface a "no roaming plan enabled" prompt on the dashboard → an LLM agent picks the
best-fitting roaming plan for the destination/trip length from a mocked telecom roaming
catalog → an LLM-as-judge reviews the pick before it's allowed to subscribe → one-tap
subscribe. A second capability (destination travel-pass discovery + payment-gateway
subscribe) is intentionally deferred until the roaming flow is solid, but the agent
architecture is being built so it slots in as a second graph, not a rewrite.

## Phase 0 — Foundations (DONE)
- Supabase schema (`backend/supabase/migrations/0001_init.sql`): `customers`,
  `calendar_events`, `roaming_plans`, `subscriptions`. RLS enabled, service_role-only
  access (backend talks to Supabase with the service key, not per-user anon keys).
- Seed data (`backend/supabase/seed/seed.sql`): one demo customer + 3 mocked flights
  (Tokyo, Marrakesh, Paris) + a roaming plan catalog across JP/MA/FR/US/IN.
- FastAPI app (`backend/app/`):
  - `config.py` / `.env.example` — Supabase + Anthropic settings.
  - `deps.py` — verifies the Supabase-issued JWT, extracts phone number, lazily
    creates/looks up the linked telecom `customers` row (this **is** the sign-in
    story: no separate signup, first authenticated call auto-provisions the profile).
  - `routers/auth.py` — `POST /auth/sync-profile`, `GET /me`.
  - `routers/calendar.py` — `GET /calendar/events`, `GET /calendar/events/{id}` (mocked
    calendar read, swappable for a real calendar API later).
  - `routers/roaming.py` — `GET /roaming/plans`, `POST /roaming/recommend`,
    `POST /roaming/subscribe`.
  - `routers/subscriptions.py` — `GET /subscriptions` (history, joined with plan + event).
  - `agent/` — LangGraph graph: `extract_trip_context → fetch_catalog → recommend_plan
    (LLM) → judge (LLM-as-judge) → [retry recommend_plan | subscribe]`. This shape is
    the reusable template for future agent capabilities.
  - `Procfile` / `runtime.txt` — Railway-ready.
- [x] Committed to git and pushed to `origin/main` (2026-08-16).

## Phase 1 — Backend hardening & local proof-of-life
- [x] Commit the existing backend scaffold to git.
- [x] Pytest suite (`backend/tests/`): agent graph (approve-first-try, retry-after-judge-
      rejection, give-up-after-max-retries, subscribe) with the LLM and Supabase calls
      mocked, plus the auth/customer-provisioning dependency (valid/invalid/missing-claim
      JWTs, existing vs. auto-provisioned customer). `.venv/bin/python -m pytest -q` →
      9 passed. Dev deps in `backend/requirements-dev.txt`, config in `backend/pytest.ini`.
- [ ] Create a real Supabase project; run `0001_init.sql` then `seed.sql`.
- [ ] Fill `backend/.env` from `.env.example` (Supabase URL/service key/JWT secret,
      Anthropic API key). **Blocked on you providing these credentials.**
- [ ] Enable Supabase phone/OTP auth (or its test-phone-number mode) so a JWT can be
      minted for local testing without a real SMS provider.
- [ ] `uvicorn app.main:app --reload`; smoke-test `/health`, `/me`,
      `/calendar/events`, `/roaming/recommend`, `/roaming/subscribe` with a real token.

## Phase 2 — Deploy backend to Railway
- [ ] Create Railway project from this repo (root: `backend/`).
- [ ] Set env vars (Supabase + Anthropic secrets), confirm `Procfile` boots correctly.
- [ ] Set `CORS_ORIGINS` to the mobile app's scheme/dev URL.
- [ ] Verify `/health` on the public Railway URL.

## Phase 3 — Mobile app (Expo)
- [x] `create-expo-app` (TypeScript, blank template) in `mobile/`, navigation via
      `@react-navigation/native` + native-stack (auth-gated stack in
      `mobile/src/navigation/RootNavigator.tsx`).
- [x] Supabase JS client (`mobile/src/lib/supabase.ts`) + phone-number/OTP sign-in screen
      (`SignInScreen.tsx`); on successful OTP verify, `AuthContext` calls
      `POST /auth/sync-profile`.
- [x] Dashboard screen (`DashboardScreen.tsx`): `GET /calendar/events`, renders upcoming
      flights as cards with a "roaming not enabled" CTA.
- [x] Flight detail screen (`FlightDetailScreen.tsx`): "No roaming plan enabled for this
      trip" prompt → `POST /roaming/recommend` → shows recommended plan + AI reasoning +
      judge verdict (with a "try again" path if the judge rejects) → confirm →
      `POST /roaming/subscribe` → success state.
- [x] Subscriptions/history screen (`SubscriptionsScreen.tsx`): `GET /subscriptions`.
- [x] Typechecks clean (`npx tsc --noEmit`) and Metro bundles successfully
      (`npx expo export --platform ios`, 891 modules, no errors).
- [ ] Not yet run on a simulator/device or against a real Supabase project + backend —
      needs `mobile/.env` filled in from `mobile/.env.example` (see Phase 1) and a live
      backend URL in `EXPO_PUBLIC_API_BASE_URL`.
- [ ] Confirm Supabase phone/OTP auth is actually enabled on the project (dashboard →
      Authentication → Providers → Phone) before testing sign-in.

## Phase 4 — Polish / demo readiness
- [ ] Loading/error states, handle judge-rejection retry loop gracefully in the UI.
- [ ] Expand seed data/plan catalog as needed for the demo itinerary.
- [ ] Surface the agent's reasoning trail in the UI (transparency, builds trust in the
      "AI subscribed a plan for you" moment).

## Phase 5 — Deferred: travel-pass capability
- [ ] Second LangGraph agent, same shape as the roaming one: research destination city
      → find local travel-pass options (mocked API) → recommend → judge → subscribe via
      a mocked payment-gateway integration.
- [ ] Introduce a top-level router/planner agent that dispatches a calendar event to the
      right capability (roaming vs. travel pass vs. future ones) — this is the
      multi-agent orchestration foundation the POC is meant to establish.

## Open decisions to confirm with stakeholder (Puneet)
- Real calendar integration (device calendar / provider API) — timing, out of scope
  for now, mocked via Supabase `calendar_events` table.
- Real roaming product API contract — currently mocked in `roaming_plans` table;
  swap `agent/tools.py::fetch_roaming_catalog` / `subscribe_roaming_plan` for real
  HTTP calls when available.
- Real payment gateway for Phase 5.
