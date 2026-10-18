CREATE TABLE reservation_cancellation_queue (
  reservation_id BIGINT PRIMARY KEY REFERENCES reservations(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENT', 'REJECTED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX reservation_cancellation_queue_pending_idx
  ON reservation_cancellation_queue (next_attempt_at, reservation_id)
  WHERE status = 'PENDING';
