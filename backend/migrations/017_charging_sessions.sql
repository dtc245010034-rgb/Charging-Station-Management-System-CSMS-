CREATE TABLE IF NOT EXISTS charging_sessions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  charge_point_id BIGINT NOT NULL REFERENCES charge_points(id) ON DELETE CASCADE,
  connector_id BIGINT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  connector_no INTEGER NOT NULL,
  id_tag_id BIGINT REFERENCES id_tags(id) ON DELETE SET NULL,
  id_tag_masked VARCHAR(20),
  driver_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  meter_start BIGINT NOT NULL,
  meter_stop BIGINT,
  started_at TIMESTAMPTZ NOT NULL,
  stopped_at TIMESTAMPTZ,
  stop_reason TEXT,
  status TEXT NOT NULL CHECK (status IN ('CHARGING', 'COMPLETED', 'ABNORMAL')),
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  review_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS charging_sessions_one_charging_per_connector
  ON charging_sessions (connector_id)
  WHERE status = 'CHARGING';

CREATE UNIQUE INDEX IF NOT EXISTS charging_sessions_natural_key_idx
  ON charging_sessions (
    charge_point_id,
    connector_no,
    COALESCE(id_tag_id, 0),
    COALESCE(id_tag_masked, ''),
    meter_start,
    started_at
  );

CREATE INDEX IF NOT EXISTS charging_sessions_driver_status_idx
  ON charging_sessions (driver_id, status);

CREATE INDEX IF NOT EXISTS charging_sessions_status_updated_at_idx
  ON charging_sessions (status, updated_at);
