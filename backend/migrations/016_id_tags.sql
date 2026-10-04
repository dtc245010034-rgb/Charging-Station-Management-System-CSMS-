-- S-15: Bảng thẻ định danh RFID id_tags phục vụ Authorize và StartTransaction (Sprint 3)
CREATE TABLE IF NOT EXISTS id_tags (
  id BIGSERIAL PRIMARY KEY,
  tag VARCHAR(20) NOT NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BLOCKED')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS id_tags_tag_key ON id_tags (UPPER(tag));
CREATE INDEX IF NOT EXISTS idx_id_tags_user_id ON id_tags (user_id);
