ALTER TABLE charging_sessions
  DROP COLUMN IF EXISTS manual_closed_by,
  DROP COLUMN IF EXISTS manual_close_reason;
