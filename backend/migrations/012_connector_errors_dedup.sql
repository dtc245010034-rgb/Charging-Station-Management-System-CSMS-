ALTER TABLE connector_errors
  ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS connector_errors_dedup_idx
  ON connector_errors (connector_id, error_code, recorded_at DESC);
