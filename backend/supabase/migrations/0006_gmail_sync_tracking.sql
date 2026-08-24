-- Add last_gmail_synced_at column to customers table for incremental Gmail sync support
ALTER TABLE customers
ADD COLUMN last_gmail_synced_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN customers.last_gmail_synced_at IS
'Timestamp of the last successful Gmail inbox sync. NULL = never synced. Used for incremental sync to only fetch new messages.';
