-- Per-user Uber session tokens obtained via uber-mcp OAuth/PKCE flow.
-- One row per customer; upserted on each successful login/refresh.
create table if not exists uber_sessions (
    id             uuid        primary key default gen_random_uuid(),
    customer_id    uuid        not null references customers (id) on delete cascade,
    user_sub       text        not null,
    access_token   text        not null,
    refresh_token  text        not null,
    client_id      text        not null,
    expires_at     timestamptz not null,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    unique (customer_id)
);

create index if not exists idx_uber_sessions_customer on uber_sessions (customer_id);
