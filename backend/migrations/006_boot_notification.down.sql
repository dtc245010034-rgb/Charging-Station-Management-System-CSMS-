-- Hoàn tác migration 006 (S-08)
ALTER TABLE charge_points
  DROP COLUMN IF EXISTS firmware_version;

ALTER TABLE stations
  DROP COLUMN IF EXISTS locked_at;
