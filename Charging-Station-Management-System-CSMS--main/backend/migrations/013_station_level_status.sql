ALTER TABLE charge_points
  ADD COLUMN IF NOT EXISTS ocpp_status TEXT,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT,
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;

ALTER TABLE connector_errors
  ALTER COLUMN connector_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS charge_point_id BIGINT REFERENCES charge_points(id),
  ADD CONSTRAINT connector_errors_target_chk
    CHECK ((connector_id IS NOT NULL)::int + (charge_point_id IS NOT NULL)::int = 1);

CREATE INDEX IF NOT EXISTS connector_errors_cp_dedup_idx
  ON connector_errors (charge_point_id, error_code, recorded_at DESC)
  WHERE charge_point_id IS NOT NULL;
