-- Add current_plans column to customers table
-- Stores the mocked "recommendation card" data shown on the onboarding Welcome
-- screen (plan, bundle, device, connected lines), without a separate relational
-- schema -- kept alongside telecom_plan (used elsewhere) rather than replacing it.
ALTER TABLE customers ADD COLUMN current_plans JSONB NOT NULL DEFAULT '[]'::jsonb;
