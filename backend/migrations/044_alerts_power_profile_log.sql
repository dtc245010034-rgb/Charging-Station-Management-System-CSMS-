CREATE TABLE alerts (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  station_id BIGINT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  charge_point_id BIGINT REFERENCES charge_points(id) ON DELETE SET NULL,
  connector_id BIGINT REFERENCES connectors(id) ON DELETE SET NULL,
  session_id BIGINT REFERENCES charging_sessions(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  dedup_key TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMPTZ,
  closed_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX alerts_one_open_dedup_key_idx
  ON alerts (kind, dedup_key)
  WHERE closed_at IS NULL;

CREATE INDEX alerts_station_state_opened_idx
  ON alerts (station_id, closed_at, opened_at DESC);

CREATE TABLE charging_profile_log (
  id BIGSERIAL PRIMARY KEY,
  station_id BIGINT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  charge_point_id BIGINT REFERENCES charge_points(id) ON DELETE SET NULL,
  connector_id BIGINT REFERENCES connectors(id) ON DELETE SET NULL,
  session_id BIGINT REFERENCES charging_sessions(id) ON DELETE SET NULL,
  transaction_id INTEGER NOT NULL,
  limit_w INTEGER NOT NULL CHECK (limit_w > 0),
  status TEXT NOT NULL CHECK (status IN ('SENT', 'ACCEPTED', 'REJECTED', 'NOT_SUPPORTED', 'TIMEOUT', 'OFFLINE')),
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt > 0),
  trigger TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMPTZ,
  reason TEXT
);

CREATE INDEX charging_profile_log_station_requested_idx
  ON charging_profile_log (station_id, requested_at DESC);

CREATE INDEX charging_profile_log_session_idx
  ON charging_profile_log (session_id, requested_at DESC);
