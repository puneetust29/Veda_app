-- Agent platform hardening: idempotent subscribe + a debug trail of orchestrator runs.
-- All tables remain accessed exclusively via the FastAPI backend's service_role key
-- (RLS enabled, no anon/authenticated policies), matching 0001_init.sql's convention.

-- Lets a double-tapped "Activate" confirm reuse the same subscription row instead of
-- creating a second active one for the same trip. NULL is allowed (and excluded from
-- the uniqueness check) so existing rows inserted before this migration, and any
-- caller that doesn't supply one, are unaffected.
alter table subscriptions add column if not exists idempotency_key text;

create unique index if not exists uq_subscriptions_idempotency_key
    on subscriptions (idempotency_key)
    where idempotency_key is not null;

-- One row per orchestrator run (fire-and-forget insert), for demo-time debugging --
-- "show me exactly what the agent did" -- independent of any one agent's own domain
-- tables (e.g. subscriptions).
create table if not exists agent_runs (
    id uuid primary key default gen_random_uuid(),
    run_id uuid not null,
    agent_name text not null,
    agent_version text not null,
    customer_id uuid references customers (id) on delete cascade,
    conversation_id text,
    mode text not null check (mode in ('suggest', 'converse')),
    status text not null check (status in ('ok', 'failed', 'awaiting_approval')),
    input jsonb not null default '{}'::jsonb,
    output jsonb not null default '{}'::jsonb,
    latency_ms integer,
    error text,
    created_at timestamptz not null default now()
);

create index if not exists idx_agent_runs_customer on agent_runs (customer_id);
create index if not exists idx_agent_runs_run_id on agent_runs (run_id);

alter table agent_runs enable row level security;
