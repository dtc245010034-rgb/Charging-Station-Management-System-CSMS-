-- S-19 (T-40 / D13): Bảng số đo meter_values
CREATE TABLE IF NOT EXISTS meter_values (
  id BIGSERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES charging_sessions(id) ON DELETE CASCADE,
  sampled_at TIMESTAMPTZ NOT NULL,
  measurand VARCHAR(50) NOT NULL DEFAULT 'Energy.Active.Import.Register',
  value NUMERIC NOT NULL,
  unit VARCHAR(20) NOT NULL DEFAULT 'Wh',
  raw_unit VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meter_values_session_measurand_sampled
  ON meter_values (session_id, measurand, sampled_at);

CREATE INDEX IF NOT EXISTS idx_meter_values_session_sampled_desc
  ON meter_values (session_id, sampled_at DESC);
