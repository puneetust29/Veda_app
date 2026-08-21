-- Gmail API integration.
--
-- Mirrors the Google Calendar credential storage pattern: refresh tokens live
-- server-side only, and are managed identically via the same OAuth flow.
-- Same PKCE security and table access patterns as google_calendar_credentials.

-- One Gmail connection per customer (one-to-one with gmail_credentials).
create table if not exists gmail_credentials (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null unique references customers (id) on delete cascade,
    -- Long-lived. Google only issues this on first consent, so losing it means re-consenting.
    refresh_token text not null,
    -- Short-lived cache; always re-derived from refresh_token when stale.
    access_token text,
    access_token_expires_at timestamptz,
    scope text not null default '',
    google_account_email text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table gmail_credentials enable row level security;

-- Synced Gmail messages from the user's inbox.
create table if not exists gmail_messages (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references customers (id) on delete cascade,
    -- Gmail's internal message ID (unique within Gmail, not globally).
    gmail_message_id text not null,
    -- Sender email address.
    sender text,
    -- Email subject line.
    subject text,
    -- Email body (plain text or HTML); can be large so TEXT is appropriate.
    body text,
    -- When the email was received (Gmail's internalDate).
    received_at timestamptz,
    -- Gmail labels (e.g., ["INBOX", "UNREAD", "STARRED"]).
    labels text[],
    -- Whether the user has marked this message as read in Gmail.
    is_read boolean default false,
    -- When we last synced this message from Gmail.
    synced_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    -- Ensure we don't duplicate the same Gmail message per customer.
    unique (customer_id, gmail_message_id)
);

alter table gmail_messages enable row level security;

-- Fast lookups by customer.
create index if not exists idx_gmail_messages_customer
    on gmail_messages (customer_id);

-- Recent emails first (common query pattern).
create index if not exists idx_gmail_messages_received
    on gmail_messages (customer_id, received_at desc);

-- Faster unread queries.
create index if not exists idx_gmail_messages_unread
    on gmail_messages (customer_id, is_read);
