-- Phase 2: extend geofence_events to support temporary geofence type.
-- Temporary geofences are AI-created, client-side only; their events are not
-- sent to the backend, but the constraint is relaxed here in case that changes.
alter table geofence_events
  drop constraint if exists geofence_events_geofence_type_check;

alter table geofence_events
  add constraint geofence_events_geofence_type_check
  check (geofence_type in ('home', 'work', 'custom', 'temporary'));

-- Phase 2: trusted contacts for the safety & sharing framework.
-- No messaging is wired here; this table stores the contact data contract only.
create table if not exists trusted_contacts (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references customers(id) on delete cascade,
  name            text not null,
  phone           text not null,
  relationship    text,
  created_at      timestamptz not null default now()
);

create index if not exists trusted_contacts_customer_idx on trusted_contacts(customer_id);
