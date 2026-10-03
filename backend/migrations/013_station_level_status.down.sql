DROP INDEX IF EXISTS connector_errors_cp_dedup_idx;
DELETE FROM connector_errors WHERE connector_id IS NULL;
ALTER TABLE connector_errors
  DROP CONSTRAINT IF EXISTS connector_errors_target_chk,
  DROP COLUMN IF EXISTS charge_point_id,
  ALTER COLUMN connector_id SET NOT NULL;
ALTER TABLE charge_points
  DROP COLUMN IF EXISTS status_updated_at,
  DROP COLUMN IF EXISTS last_error_code,
  DROP COLUMN IF EXISTS ocpp_status;
