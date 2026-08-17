-- AI Companion App: core schema
-- All tables are accessed exclusively by the FastAPI backend via the Supabase
-- service_role key, so RLS is enabled with no anon/authenticated policies
-- (service_role bypasses RLS by design).

create extension if not exists "pgcrypto";

-- Mocked telecom customer profile, keyed by the phone number used for Supabase Auth.
create table if not exists customers (
    id uuid primary key default gen_random_uuid(),
    phone_number text not null unique,
    full_name text not null,
    address text not null,
    telecom_plan text not null,
    account_number text not null,
    created_at timestamptz not null default now()
);

-- Mocked calendar events (flights, etc.) per customer.
create table if not exists calendar_events (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references customers (id) on delete cascade,
    title text not null,
    event_type text not null check (event_type in ('flight', 'other')),
    origin text,
    destination text,
    start_datetime timestamptz not null,
    end_datetime timestamptz not null,
    raw_details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

-- Mocked roaming plan catalog (stand-in for the telecom's roaming product API).
create table if not exists roaming_plans (
    id uuid primary key default gen_random_uuid(),
    country_code text not null,
    country_name text not null,
    region text not null,
    duration_days integer not null,
    data_gb numeric not null,
    price numeric not null,
    currency text not null default 'EUR',
    plan_name text not null,
    description text not null,
    created_at timestamptz not null default now()
);

-- Record of what the AI agent recommended and subscribed, including its reasoning trace.
create table if not exists subscriptions (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references customers (id) on delete cascade,
    roaming_plan_id uuid not null references roaming_plans (id),
    calendar_event_id uuid not null references calendar_events (id),
    status text not null check (status in ('proposed', 'active', 'failed')) default 'proposed',
    agent_reasoning jsonb not null default '{}'::jsonb,
    subscribed_at timestamptz
);

create index if not exists idx_calendar_events_customer on calendar_events (customer_id);
create index if not exists idx_roaming_plans_country on roaming_plans (country_code);
create index if not exists idx_subscriptions_customer on subscriptions (customer_id);

alter table customers enable row level security;
alter table calendar_events enable row level security;
alter table roaming_plans enable row level security;
alter table subscriptions enable row level security;
