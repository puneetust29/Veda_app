-- Fix: Add proper unique constraint for gmail upsert operations
-- The partial index from 0008 doesn't work with ON CONFLICT syntax

-- Drop the partial index if it exists
DROP INDEX IF EXISTS idx_calendar_events_gmail_message_unique;

-- Create a proper unique constraint (not partial)
-- This allows the ON CONFLICT clause to work correctly
ALTER TABLE calendar_events
ADD CONSTRAINT uq_calendar_events_gmail_message
UNIQUE (customer_id, gmail_message_id)
WHERE gmail_message_id IS NOT NULL;
