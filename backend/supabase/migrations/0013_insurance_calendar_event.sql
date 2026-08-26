-- Add calendar_event_id to insurance_purchases to link to specific flights

alter table insurance_purchases
add column calendar_event_id uuid references calendar_events (id) on delete cascade;

-- Create index for faster lookups by calendar event
create index if not exists idx_insurance_purchases_calendar_event
  on insurance_purchases(calendar_event_id);

-- Update unique constraint: one active insurance per customer per event
drop index if exists idx_insurance_purchases_customer_active;

create unique index if not exists idx_insurance_purchases_customer_event_active
  on insurance_purchases(customer_id, calendar_event_id)
  where status = 'active';
