CREATE TABLE connector_status_events (
  id BIGSERIAL PRIMARY KEY,
  charge_point_id BIGINT NOT NULL REFERENCES charge_points(id) ON DELETE CASCADE,
  connector_id BIGINT REFERENCES connectors(id) ON DELETE CASCADE,
  connector_no INTEGER NOT NULL,
  ocpp_status TEXT NOT NULL,
  error_code TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_connector_status_events_conn_occurred
  ON connector_status_events (connector_id, occurred_at);
