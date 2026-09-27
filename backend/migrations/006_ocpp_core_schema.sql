CREATE TABLE IF NOT EXISTS charge_points_ocpp (
  id BIGSERIAL PRIMARY KEY,
  charge_point_code TEXT NOT NULL UNIQUE,
  vendor TEXT,
  model TEXT,
  serial_number TEXT,
  firmware_version TEXT,
  meter_type TEXT,
  meter_serial_number TEXT,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  connection_state TEXT NOT NULL DEFAULT 'DISCONNECTED',
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS connectors_ocpp (
  id BIGSERIAL PRIMARY KEY,
  charge_point_id BIGINT NOT NULL REFERENCES charge_points_ocpp(id) ON DELETE CASCADE,
  connector_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  error_code TEXT,
  last_status_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (charge_point_id, connector_id)
);

CREATE TABLE IF NOT EXISTS charging_sessions_ocpp (
  id BIGSERIAL PRIMARY KEY,
  charge_point_id BIGINT NOT NULL REFERENCES charge_points_ocpp(id) ON DELETE CASCADE,
  connector_id INTEGER NOT NULL,
  transaction_id BIGINT NOT NULL,
  id_tag TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  meter_start BIGINT,
  meter_stop BIGINT,
  stop_reason TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (charge_point_id, transaction_id)
);

CREATE TABLE IF NOT EXISTS meter_samples_ocpp (
  id BIGSERIAL PRIMARY KEY,
  charge_point_id BIGINT NOT NULL REFERENCES charge_points_ocpp(id) ON DELETE CASCADE,
  connector_id INTEGER NOT NULL,
  transaction_id BIGINT,
  sample_time TIMESTAMPTZ NOT NULL,
  value NUMERIC,
  context TEXT,
  format TEXT,
  measurand TEXT,
  phase TEXT,
  location TEXT,
  unit TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ocpp_events_raw (
  id BIGSERIAL PRIMARY KEY,
  charge_point_id BIGINT REFERENCES charge_points_ocpp(id) ON DELETE SET NULL,
  connector_id INTEGER,
  transaction_id BIGINT,
  message_type INTEGER NOT NULL,
  action TEXT,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS charge_points_ocpp_last_seen_idx ON charge_points_ocpp(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS connectors_ocpp_status_idx ON connectors_ocpp(status);
CREATE INDEX IF NOT EXISTS charging_sessions_ocpp_status_idx ON charging_sessions_ocpp(status);
CREATE INDEX IF NOT EXISTS meter_samples_ocpp_transaction_idx ON meter_samples_ocpp(transaction_id, sample_time);
CREATE INDEX IF NOT EXISTS ocpp_events_raw_received_at_idx ON ocpp_events_raw(received_at DESC);
