-- Add stripe_customer_id column to customers table
-- Stores the Stripe Customer ID to avoid creating duplicate customers
ALTER TABLE customers ADD COLUMN stripe_customer_id TEXT UNIQUE DEFAULT NULL;
