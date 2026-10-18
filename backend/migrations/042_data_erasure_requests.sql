CREATE TABLE data_erasure_requests (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_reason TEXT,
  completed_at TIMESTAMPTZ,
  result JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (
      jsonb_typeof(result) = 'object'
      AND result - ARRAY['sessions', 'invoices', 'idTags', 'notifications', 'emails'] = '{}'::jsonb
    )
);

CREATE UNIQUE INDEX data_erasure_requests_one_open_per_driver
  ON data_erasure_requests (driver_id)
  WHERE status IN ('REQUESTED', 'APPROVED');

CREATE INDEX data_erasure_requests_status_requested_idx
  ON data_erasure_requests (status, requested_at);
