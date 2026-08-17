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
  - `routers/auth.py` — `POST /auth/sync-profile`, `GET /me`, `POST /auth/dev-login`
    (POC-only mock sign-in, see Phase 1 note below).
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
      JWTs, existing vs. auto-provisioned customer), plus `/auth/dev-login` (issues a
      token the normal auth dependency accepts; disabled when `ENVIRONMENT=production`).
      `.venv/bin/python -m pytest -q` → 11 passed. Dev deps in
      `backend/requirements-dev.txt`, config in `backend/pytest.ini`.
- [x] Create a real Supabase project; run `0001_init.sql` then `seed.sql` (2026-08-16/17,
      verified via a connectivity check: customers=1, calendar_events=3, roaming_plans=11,
      subscriptions=0).
- [x] Fill `backend/.env` (Supabase URL/service key/JWT secret). `ANTHROPIC_API_KEY` is
      still a placeholder — **blocked on a real key from Puneet**.
- [x] **Pivot:** rather than fighting Supabase's hosted-dashboard Twilio requirement just
      to use Test OTPs, added `POST /auth/dev-login` — a POC-only endpoint that mints a
      JWT signed with the same `SUPABASE_JWT_SECRET` (so it passes the exact same
      verification path as a real Supabase token) without any OTP round-trip. Gated to
      non-production via `settings.environment`. The mobile app's sign-in screen now
      calls this directly (phone number only, no OTP field) instead of going through
      Supabase Auth. Real Supabase phone/OTP + an SMS provider is a later swap-in once
      the POC needs real auth — tracked as an open decision below, not forgotten.
- [x] `uvicorn app.main:app`; smoke-tested `/health` → `/auth/dev-login` → `/me` →
      `/calendar/events` → `/roaming/plans` → `/subscriptions` against the real Supabase
      project — all correct. `/roaming/recommend` correctly reaches the Anthropic call
      and fails with `401 invalid x-api-key` (expected — placeholder key), confirming
      everything up to the LLM call is wired correctly.
- [ ] Re-test `/roaming/recommend` + `/roaming/subscribe` once a real `ANTHROPIC_API_KEY`
      is in `backend/.env`.

## Phase 2 — Deploy backend to Railway
- [ ] Create Railway project from this repo (root: `backend/`).
- [ ] Set env vars (Supabase + Anthropic secrets), confirm `Procfile` boots correctly.
- [ ] Set `CORS_ORIGINS` to the mobile app's scheme/dev URL.
- [ ] Verify `/health` on the public Railway URL.

## Phase 3 — Mobile app (Expo)
- [x] `create-expo-app` (TypeScript, blank template) in `mobile/`, navigation via
      `@react-navigation/native` + native-stack (auth-gated stack in
      `mobile/src/navigation/RootNavigator.tsx`).
- [x] Sign-in screen (`SignInScreen.tsx`): phone number only, calls the backend's
      `POST /auth/dev-login` mock sign-in directly (no Supabase JS client in the mobile
      app currently — see the Phase 1 dev-login note). Token persisted via
      `mobile/src/lib/authToken.ts` (AsyncStorage).
- [x] Dashboard screen (`DashboardScreen.tsx`): `GET /calendar/events`, renders upcoming
      flights as cards with a "roaming not enabled" CTA.
- [x] Flight detail screen (`FlightDetailScreen.tsx`): "No roaming plan enabled for this
      trip" prompt → `POST /roaming/recommend` → shows recommended plan + AI reasoning +
      judge verdict (with a "try again" path if the judge rejects) → confirm →
      `POST /roaming/subscribe` → success state.
- [x] Subscriptions/history screen (`SubscriptionsScreen.tsx`): `GET /subscriptions`.
- [x] Typechecks clean (`npx tsc --noEmit`) and Metro bundles successfully
      (`npx expo export --platform ios`, 842 modules, no errors).
- [ ] Not yet run on a simulator/device — needs `mobile/.env` filled in from
      `mobile/.env.example` (just `EXPO_PUBLIC_API_BASE_URL` now) pointing at the local
      backend or Railway URL.

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
- Real Supabase phone/OTP sign-in (with an SMS provider like Twilio) vs. keeping
  `/auth/dev-login` for the whole POC — currently mocked to avoid Twilio setup friction;
  swap back to real Supabase Auth in the mobile app + remove/keep the dev-login endpoint
  once real auth is actually needed (e.g. a stakeholder demo outside the team).
- Real calendar integration (device calendar / provider API) — timing, out of scope
  for now, mocked via Supabase `calendar_events` table.
- Real roaming product API contract — currently mocked in `roaming_plans` table;
  swap `agent/tools.py::fetch_roaming_catalog` / `subscribe_roaming_plan` for real
  HTTP calls when available.
- Real payment gateway for Phase 5.
