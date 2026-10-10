ALTER TABLE id_tags
  ADD COLUMN is_virtual BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO id_tags (tag, user_id, status, is_virtual)
SELECT
  'V' || upper(substr(md5(users.id::text || clock_timestamp()::text || random()::text), 1, 18)),
  users.id,
  'ACTIVE',
  TRUE
FROM users
JOIN user_roles ON user_roles.user_id = users.id
JOIN roles ON roles.id = user_roles.role_id
WHERE roles.code = 'DRIVER'
  AND NOT EXISTS (
    SELECT 1 FROM id_tags WHERE id_tags.user_id = users.id AND id_tags.is_virtual
  );

CREATE UNIQUE INDEX id_tags_one_virtual_per_user
  ON id_tags (user_id)
  WHERE is_virtual AND user_id IS NOT NULL;

CREATE TABLE remote_start_requests (
  id BIGSERIAL PRIMARY KEY,
  connector_id BIGINT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  charge_point_id BIGINT NOT NULL REFERENCES charge_points(id) ON DELETE CASCADE,
  driver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_tag_id BIGINT NOT NULL REFERENCES id_tags(id) ON DELETE RESTRICT,
  session_id INTEGER REFERENCES charging_sessions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'STARTED', 'REJECTED', 'TIMED_OUT', 'ERROR')),
  deadline TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX remote_start_one_pending_per_connector
  ON remote_start_requests (connector_id)
  WHERE status = 'PENDING';

CREATE INDEX remote_start_requests_driver_created
  ON remote_start_requests (driver_id, created_at DESC);
