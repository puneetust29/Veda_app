-- Real Google Calendar integration.
--
-- The OAuth tokens live server-side only: the mobile app never sees a Google
-- access token, it just calls this backend. That keeps the refresh token (which
-- does not expire) off the device entirely, and means revoking one customer's
-- access is a single row delete.
--
-- Same convention as 0001/0002: accessed exclusively via the backend's
-- service_role key, RLS on with no anon/authenticated policies.

-- One Google connection per customer.
create table if not exists google_calendar_credentials (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null unique references customers (id) on delete cascade,
    -- Long-lived. Google only issues this on first consent (or with
    -- prompt=consent), so losing it means re-consenting.
    refresh_token text not null,
    -- Short-lived cache; always re-derived from refresh_token when stale, so it
    -- is safe for this to be null or expired.
    access_token text,
    access_token_expires_at timestamptz,
    scope text not null default '',
    google_account_email text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table google_calendar_credentials enable row level security;

-- In-flight OAuth handshakes. Holds the PKCE verifier between /connect and
-- /callback, because the callback arrives as a fresh browser request with no
-- session. Rows are single-use: deleted on redemption, and expired rows are
-- swept opportunistically.
create table if not exists google_oauth_states (
    state text primary key,
    customer_id uuid not null references customers (id) on delete cascade,
    code_verifier text not null,
    -- Where the callback page should send the browser when consent finishes, so
    -- the in-app browser closes itself. Client-supplied and scheme-allowlisted
    -- (see sanitize_app_redirect), because Expo Go returns to exp:// while a
    -- dev/standalone build returns to veda://. Null falls back to the configured
    -- GOOGLE_POST_AUTH_REDIRECT.
    app_redirect text,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null
);

alter table google_oauth_states enable row level security;

create index if not exists idx_google_oauth_states_expires_at
    on google_oauth_states (expires_at);

-- Lets synced Google events reconcile against the rows the agents already read
-- instead of duplicating on every sync.
alter table calendar_events add column if not exists google_event_id text;
alter table calendar_events add column if not exists source text not null default 'mock';

-- Deliberately NOT a partial index (`where google_event_id is not null`), even
-- though that reads more precisely. Postgres cannot infer a partial index as the
-- arbiter for `on conflict (customer_id, google_event_id)` unless the statement
-- repeats the index predicate, and PostgREST's `on_conflict=` parameter has no
-- way to express one -- so the sync upsert would fail with 42P10.
--
-- A plain unique index is safe here because Postgres treats NULLs as distinct by
-- default (NULLS DISTINCT): the seeded mock rows all have a null google_event_id
-- and any number of them can coexist per customer, unaffected by this index.
drop index if exists uq_calendar_events_google_event;

create unique index if not exists uq_calendar_events_google_event
    on calendar_events (customer_id, google_event_id);
