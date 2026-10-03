DROP INDEX IF EXISTS connector_errors_dedup_idx;
ALTER TABLE connector_errors
  DROP COLUMN IF EXISTS recorded_at;
