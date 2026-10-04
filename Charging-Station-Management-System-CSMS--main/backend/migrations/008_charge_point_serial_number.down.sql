-- Hoàn tác migration 008 (S-08)
ALTER TABLE charge_points
  DROP COLUMN IF EXISTS serial_number;

ALTER TABLE stations
  DROP COLUMN IF EXISTS locked_by;
