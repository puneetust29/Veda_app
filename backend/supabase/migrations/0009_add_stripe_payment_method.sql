-- Add stripe_payment_method_id column to customers table
-- Stores the Stripe PaymentMethod token for one-click payments
ALTER TABLE customers ADD COLUMN stripe_payment_method_id TEXT UNIQUE DEFAULT NULL;
