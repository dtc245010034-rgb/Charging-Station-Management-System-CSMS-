-- S-17 (T-36): Bảng phiên sạc charging_sessions
CREATE TABLE IF NOT EXISTS charging_sessions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  charge_point_id BIGINT NOT NULL REFERENCES charge_points(id) ON DELETE RESTRICT,
  connector_id BIGINT NOT NULL REFERENCES connectors(id) ON DELETE RESTRICT,
  connector_no INTEGER NOT NULL,
  id_tag_id BIGINT REFERENCES id_tags(id) ON DELETE SET NULL,
  id_tag_masked VARCHAR(20) NOT NULL,
  driver_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  meter_start BIGINT NOT NULL,
  meter_stop BIGINT,
  started_at TIMESTAMPTZ NOT NULL,
  stopped_at TIMESTAMPTZ,
  stop_reason VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'CHARGING' CHECK (status IN ('CHARGING', 'COMPLETED', 'ABNORMAL')),
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  review_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- D1: Mỗi đầu nối chỉ có một phiên CHARGING tại một thời điểm
CREATE UNIQUE INDEX IF NOT EXISTS idx_charging_sessions_active_connector
  ON charging_sessions (connector_id)
  WHERE status = 'CHARGING';

-- D4: Chỉ mục tự nhiên chống trùng StartTransaction phát lại ngoài cửa sổ
CREATE UNIQUE INDEX IF NOT EXISTS idx_charging_sessions_natural_key
  ON charging_sessions (charge_point_id, connector_no, id_tag_masked, meter_start, started_at);

-- Chỉ mục hỗ trợ truy vấn phiên của tài xế và kiểm tra định kỳ
CREATE INDEX IF NOT EXISTS idx_charging_sessions_driver_status
  ON charging_sessions (driver_id, status);

CREATE INDEX IF NOT EXISTS idx_charging_sessions_status_updated
  ON charging_sessions (status, updated_at);

CREATE INDEX IF NOT EXISTS idx_charging_sessions_charge_point_id
  ON charging_sessions (charge_point_id);
