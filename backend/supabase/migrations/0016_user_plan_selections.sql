-- Create user_selections table to track roaming and travel insurance approvals
-- Allows users' previous selections to be shown with checkmarks on subsequent logins

CREATE TABLE IF NOT EXISTS user_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  roaming_plan_id INTEGER,
  travel_insurance_plan_id INTEGER,
  selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure one selection record per customer
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_selections_customer_id
  ON user_selections(customer_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_selections_created_at
  ON user_selections(selected_at DESC);
