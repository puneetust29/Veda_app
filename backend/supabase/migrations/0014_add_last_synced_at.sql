-- Add last_synced_at column to track overall calendar sync time
ALTER TABLE customers ADD COLUMN last_synced_at TIMESTAMP WITH TIME ZONE;
