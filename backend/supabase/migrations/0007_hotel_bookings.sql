-- Create hotel_bookings table to store confirmed hotel reservations
CREATE TABLE hotel_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  hotel_name TEXT NOT NULL,
  check_in TIMESTAMPTZ NOT NULL,
  check_out TIMESTAMPTZ NOT NULL,
  confirmation_number TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for efficient queries
CREATE INDEX idx_hotel_bookings_customer ON hotel_bookings(customer_id);
CREATE INDEX idx_hotel_bookings_checkin ON hotel_bookings(customer_id, check_in DESC);

-- Add RLS policy for data security
ALTER TABLE hotel_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own hotel bookings"
  ON hotel_bookings
  FOR SELECT
  USING (customer_id = auth.uid());

CREATE POLICY "Users can insert their own hotel bookings"
  ON hotel_bookings
  FOR INSERT
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Users can update their own hotel bookings"
  ON hotel_bookings
  FOR UPDATE
  USING (customer_id = auth.uid());

COMMENT ON TABLE hotel_bookings IS 'Stores confirmed hotel reservations linked to customers';
COMMENT ON COLUMN hotel_bookings.confirmation_number IS 'Booking reference/confirmation number from hotel or booking service';
