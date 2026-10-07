-- S-17 / S-18 (T-36 / Q2 / D13): Bảng lưu tin mồ côi orphan_messages
CREATE TABLE IF NOT EXISTS orphan_messages (
  id BIGSERIAL PRIMARY KEY,
  charge_point_id BIGINT REFERENCES charge_points(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  reason TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orphan_messages_charge_point_action
  ON orphan_messages (charge_point_id, action);
CREATE INDEX IF NOT EXISTS idx_orphan_messages_received_at
  ON orphan_messages (received_at);
