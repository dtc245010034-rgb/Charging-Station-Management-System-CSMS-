-- Bổ sung thông tin thiết bị cho charge_points và cờ trạm bị khoá (S-08 / T-16, T-17)
ALTER TABLE charge_points
  ADD COLUMN IF NOT EXISTS vendor TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS firmware_version TEXT;

ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
