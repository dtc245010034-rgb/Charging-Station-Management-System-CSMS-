-- S-14 / K-01: nhớ câu trả lời cho từng (trụ, messageId) để tin gửi lại không chạy handler lần hai.
-- response NULL = tin đang được xử lý (hoặc tiến trình chết giữa chừng); chỉ lưu khi handler thành công.
CREATE TABLE IF NOT EXISTS ocpp_messages (
  charge_point_code VARCHAR(50) NOT NULL,
  message_id        VARCHAR(64) NOT NULL,
  action            VARCHAR(50) NOT NULL,
  payload_hash      CHAR(64) NOT NULL,
  response          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (charge_point_code, message_id)
);

CREATE INDEX IF NOT EXISTS idx_ocpp_messages_created_at ON ocpp_messages (created_at);
