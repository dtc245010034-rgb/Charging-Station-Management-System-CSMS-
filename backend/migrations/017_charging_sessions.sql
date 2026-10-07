CREATE TABLE charging_sessions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  charge_point_id BIGINT NOT NULL REFERENCES charge_points(id) ON DELETE RESTRICT,
  connector_id BIGINT NOT NULL REFERENCES connectors(id) ON DELETE RESTRICT,
  connector_no INTEGER NOT NULL,
  id_tag_id BIGINT REFERENCES id_tags(id) ON DELETE SET NULL,
  id_tag_masked VARCHAR(20) NOT NULL,
  driver_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  meter_start BIGINT NOT NULL CHECK (meter_start >= 0),
  meter_stop BIGINT CHECK (meter_stop >= 0),
  started_at TIMESTAMPTZ NOT NULL,
  stopped_at TIMESTAMPTZ,
  stop_reason TEXT,
  status TEXT NOT NULL CHECK (status IN ('CHARGING', 'COMPLETED', 'ABNORMAL', 'NEEDS_REVIEW')),
  review_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX charging_sessions_one_open_per_connector
  ON charging_sessions (connector_id)
  WHERE status IN ('CHARGING', 'NEEDS_REVIEW');

CREATE INDEX charging_sessions_driver_status_idx ON charging_sessions (driver_id, status);
CREATE INDEX charging_sessions_status_updated_idx ON charging_sessions (status, updated_at);