CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('SESSION_ENDED', 'SESSION_REMOTE_STOPPED', 'IDLE_FEE_STARTED')),
  session_id BIGINT NOT NULL REFERENCES charging_sessions(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMPTZ NULL,
  CONSTRAINT notifications_session_kind_unique UNIQUE (session_id, kind)
);

CREATE INDEX notifications_user_created_idx
  ON notifications (user_id, created_at DESC, id DESC);

CREATE INDEX notifications_user_unread_idx
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE TABLE email_outbox (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMPTZ NULL
);

CREATE INDEX email_outbox_pending_idx
  ON email_outbox (created_at ASC)
  WHERE status = 'PENDING';
