-- Migration 0020: Saved places for Location Intelligence Platform
-- Saved places live primarily in AsyncStorage (on-device).
-- This table enables optional cross-device sync; it is never the source of truth.
-- Raw GPS coordinates are never stored here — only semantic labels and place IDs.

CREATE TABLE IF NOT EXISTS saved_places (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id  uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    label        text NOT NULL,
    category     text NOT NULL,
    place_id     text,           -- Google Places place_id; nullable (user-named places have none)
    geofence_id  text,           -- links to on-device geofence id (not a FK — device-side ID)
    is_favorite  boolean NOT NULL DEFAULT false,
    added_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_places_customer_idx ON saved_places(customer_id);
CREATE INDEX IF NOT EXISTS saved_places_favorite_idx ON saved_places(customer_id, is_favorite) WHERE is_favorite = true;
