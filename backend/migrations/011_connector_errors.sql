CREATE TABLE connector_errors (
  id BIGSERIAL PRIMARY KEY,
  connector_id BIGINT NOT NULL REFERENCES connectors(id),
  error_code TEXT NOT NULL,
  vendor_error_code TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX connector_errors_connector_time_idx
  ON connector_errors (connector_id, occurred_at);
