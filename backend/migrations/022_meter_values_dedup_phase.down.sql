DROP INDEX IF EXISTS idx_meter_values_session_reported_desc;
DROP INDEX IF EXISTS idx_meter_values_session_reported_measurand_phase_context;

CREATE UNIQUE INDEX IF NOT EXISTS idx_meter_values_session_measurand_sampled
  ON meter_values (session_id, measurand, sampled_at);

ALTER TABLE meter_values
  DROP COLUMN IF EXISTS source_message_id,
  DROP COLUMN IF EXISTS context,
  DROP COLUMN IF EXISTS phase,
  DROP COLUMN IF EXISTS reported_at;
