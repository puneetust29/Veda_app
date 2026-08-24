-- Add hotel event type support and unique constraint for Gmail messages

-- Update the event_type check constraint to allow 'hotel'
ALTER TABLE calendar_events DROP CONSTRAINT calendar_events_event_type_check;
ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_event_type_check
  CHECK (event_type in ('flight', 'hotel', 'other'));

-- Add a column to track source (google, device, gmail) for better deduplication
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS source text DEFAULT 'other';

-- Add a column to track external message IDs for deduplication at database level
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS gmail_message_id text;

-- Create a unique index to prevent duplicate gmail messages per customer
-- This allows the same message to be in calendar for different customers
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_gmail_message_unique
  ON calendar_events(customer_id, gmail_message_id)
  WHERE gmail_message_id IS NOT NULL;

-- Create an index for efficient filtering by event_type
CREATE INDEX IF NOT EXISTS idx_calendar_events_event_type
  ON calendar_events(customer_id, event_type);

-- Create an index for efficient filtering by source
CREATE INDEX IF NOT EXISTS idx_calendar_events_source
  ON calendar_events(customer_id, source);

COMMENT ON COLUMN calendar_events.source IS 'Source of the event: google, device, gmail, mock';
COMMENT ON COLUMN calendar_events.gmail_message_id IS 'Gmail message ID for deduplication';
