-- S-21 / GYM-45: bảo vệ khóa duy nhất của meter_values theo mốc, measurand, phase và context
ALTER TABLE meter_values
  ADD COLUMN IF NOT EXISTS reported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phase VARCHAR(20),
  ADD COLUMN IF NOT EXISTS context VARCHAR(200),
  ADD COLUMN IF NOT EXISTS source_message_id VARCHAR(100);

UPDATE meter_values
SET reported_at = sampled_at
WHERE reported_at IS NULL;

DROP INDEX IF EXISTS idx_meter_values_session_measurand_sampled;

CREATE UNIQUE INDEX IF NOT EXISTS idx_meter_values_session_reported_measurand_phase_context
  ON meter_values (session_id, reported_at, measurand, phase, context);

CREATE INDEX IF NOT EXISTS idx_meter_values_session_reported_desc
  ON meter_values (session_id, reported_at DESC);
