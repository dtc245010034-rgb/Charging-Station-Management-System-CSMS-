DROP INDEX IF EXISTS idx_charging_sessions_remote_stop_deadline;

ALTER TABLE charging_sessions
  DROP COLUMN IF EXISTS remote_stop_completed_at,
  DROP COLUMN IF EXISTS remote_stop_requested_by,
  DROP COLUMN IF EXISTS remote_stop_deadline,
  DROP COLUMN IF EXISTS remote_stop_requested_at,
  DROP COLUMN IF EXISTS remote_stop_status;