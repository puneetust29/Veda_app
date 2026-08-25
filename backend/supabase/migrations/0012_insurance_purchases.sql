-- Create insurance_purchases table to track active travel insurance plans

create table if not exists insurance_purchases (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references customers (id) on delete cascade,
    plan_id integer not null,
    payment_intent_id text not null unique,
    status text not null check (status in ('pending', 'active', 'expired', 'cancelled')),
    purchased_at timestamptz not null default now(),
    plan_details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Index for faster lookups by customer
create index if not exists idx_insurance_purchases_customer_id
  on insurance_purchases(customer_id);

-- Index for faster lookups by status
create index if not exists idx_insurance_purchases_status
  on insurance_purchases(status);

-- Unique constraint: one active insurance per customer (allow expired/cancelled to coexist)
create unique index if not exists idx_insurance_purchases_customer_active
  on insurance_purchases(customer_id)
  where status = 'active';
