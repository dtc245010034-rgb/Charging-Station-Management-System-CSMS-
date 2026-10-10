ALTER TABLE charging_sessions
  ADD COLUMN remote_stop_status TEXT
    CHECK (remote_stop_status IS NULL OR remote_stop_status IN ('SENDING', 'ACCEPTED', 'REJECTED', 'ERROR', 'TIMED_OUT', 'STOPPED')),
  ADD COLUMN remote_stop_requested_at TIMESTAMPTZ,
  ADD COLUMN remote_stop_deadline TIMESTAMPTZ,
  ADD COLUMN remote_stop_requested_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN remote_stop_completed_at TIMESTAMPTZ;

CREATE INDEX idx_charging_sessions_remote_stop_deadline
  ON charging_sessions (remote_stop_deadline)
  WHERE remote_stop_status = 'ACCEPTED';