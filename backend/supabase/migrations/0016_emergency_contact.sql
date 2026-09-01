-- Add emergency contact fields to customers table
alter table customers add column if not exists emergency_contact_name text;
alter table customers add column if not exists emergency_contact_phone text;
