ALTER TABLE charging_sessions
  ADD COLUMN manual_close_reason TEXT,
  ADD COLUMN manual_closed_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
