-- Geofence definitions (server-side mirror of the mobile AsyncStorage copy).
-- The source of truth for active geofences lives on-device; this table lets AI
-- agents read the customer's configured places without an app-to-server sync step.
create table if not exists geofences (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  label       text not null,
  type        text not null check (type in ('home', 'work', 'custom')),
  latitude    double precision not null,
  longitude   double precision not null,
  radius_meters integer not null default 200,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists geofences_customer_id_idx on geofences(customer_id);

-- Geofence crossing events. Only enter/exit timestamps are stored — no
-- continuous GPS track. AI agents can query this table to understand a
-- customer's recent location context (e.g. "arrived home 20 mins ago").
create table if not exists geofence_events (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references customers(id) on delete cascade,
  event_type      text not null check (event_type in ('GEOFENCE_ENTER', 'GEOFENCE_EXIT')),
  geofence_id     text not null,
  geofence_label  text not null,
  geofence_type   text not null check (geofence_type in ('home', 'work', 'custom')),
  event_timestamp timestamptz not null,
  latitude        double precision not null,
  longitude       double precision not null,
  recorded_at     timestamptz not null default now()
);

create index if not exists geofence_events_customer_idx on geofence_events(customer_id);
create index if not exists geofence_events_timestamp_idx on geofence_events(event_timestamp desc);
