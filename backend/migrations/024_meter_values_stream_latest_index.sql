-- S-20 / GYM-46: index cho findLatestMeterValues (mẫu mới nhất theo từng luồng session/measurand/phase/context)
CREATE INDEX IF NOT EXISTS idx_meter_values_stream_latest
  ON meter_values (session_id, measurand, phase, context, sampled_at DESC, id DESC);
