DROP INDEX IF EXISTS idx_meter_values_session_reported_desc;
DROP INDEX IF EXISTS idx_meter_values_session_reported_measurand_phase_context;
DROP INDEX IF EXISTS idx_meter_values_stream_latest;

-- Xóa các bản ghi trùng lặp (nhiều phase/context tại cùng sampled_at) trước khi tạo lại unique index cũ
DELETE FROM meter_values a USING meter_values b
WHERE a.session_id = b.session_id
  AND a.measurand = b.measurand
  AND a.sampled_at = b.sampled_at
  AND a.id < b.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_meter_values_session_measurand_sampled
  ON meter_values (session_id, measurand, sampled_at);

ALTER TABLE meter_values
  DROP COLUMN IF EXISTS source_message_id,
  DROP COLUMN IF EXISTS context,
  DROP COLUMN IF EXISTS phase,
  DROP COLUMN IF EXISTS reported_at;
