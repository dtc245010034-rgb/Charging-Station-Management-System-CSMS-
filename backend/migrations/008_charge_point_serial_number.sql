-- Bổ sung số sê-ri cho charge_points và locked_by cho stations (S-08 / T-16, T-16b)
ALTER TABLE charge_points
  ADD COLUMN IF NOT EXISTS serial_number TEXT;

ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS locked_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
