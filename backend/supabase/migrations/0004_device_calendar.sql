-- Device (Apple/iOS or any expo-calendar-visible) calendar sync.
--
-- Google sync is backend-driven (server holds the refresh token and pulls
-- events). Device sync is the opposite: the mobile app reads local calendars
-- via expo-calendar (which surfaces Apple Calendar, plus any other calendar
-- accounts synced to the device) and POSTs the raw events to the backend to
-- be classified and stored. Both paths write into the same calendar_events
-- table so the roaming agent doesn't care which source a flight came from.
--
-- Same convention as 0003: a plain (non-partial) unique index, since Postgres
-- treats NULLs as distinct by default, so google-sourced and mock rows (which
-- have a null device_event_id) are unaffected.
alter table calendar_events add column if not exists device_event_id text;

drop index if exists uq_calendar_events_device_event;

create unique index if not exists uq_calendar_events_device_event
    on calendar_events (customer_id, device_event_id);
