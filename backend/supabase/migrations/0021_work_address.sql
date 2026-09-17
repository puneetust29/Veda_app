-- Add work address to customers (home address is the existing `address` column)
alter table customers add column if not exists work_address text;
