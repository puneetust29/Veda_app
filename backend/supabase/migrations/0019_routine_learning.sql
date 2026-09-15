-- Routine learning aggregates — opt-in server-side mirror of on-device stats.
-- All learning is performed on-device; this table holds voluntary syncs only.
-- No raw GPS or individual timestamps are stored here — only aggregated counts.
create table if not exists place_visit_aggregates (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references customers(id) on delete cascade,
  geofence_id     text not null,
  geofence_label  text not null,
  geofence_type   text not null check (geofence_type in ('home', 'work', 'custom', 'temporary')),
  total_visits    integer not null default 0,
  avg_dwell_minutes numeric(8,2),
  last_visit_at   timestamptz,
  synced_at       timestamptz not null default now(),
  unique (customer_id, geofence_id)
);

create index if not exists place_visit_aggregates_customer_idx
  on place_visit_aggregates(customer_id);

-- Detected commute patterns — computed on-device, optionally synced.
create table if not exists commute_patterns (
  id                      uuid primary key default gen_random_uuid(),
  customer_id             uuid not null references customers(id) on delete cascade,
  from_geofence_id        text not null,
  from_label              text not null,
  to_geofence_id          text not null,
  to_label                text not null,
  avg_duration_minutes    numeric(8,2) not null,
  occurrences             integer not null default 1,
  confidence              numeric(4,3) not null default 0,
  last_observed_at        timestamptz,
  synced_at               timestamptz not null default now(),
  unique (customer_id, from_geofence_id, to_geofence_id)
);

create index if not exists commute_patterns_customer_idx
  on commute_patterns(customer_id);
