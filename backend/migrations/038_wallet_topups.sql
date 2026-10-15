CREATE TABLE wallet_topups (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_dong BIGINT NOT NULL CHECK (amount_dong > 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED')),
  order_ref TEXT NOT NULL UNIQUE,
  gateway TEXT NOT NULL DEFAULT 'SANDBOX',
  gateway_txn_id TEXT NULL UNIQUE,
  failure_reason TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  CONSTRAINT wallet_topups_driver_idempotency_key UNIQUE (driver_id, idempotency_key)
);

CREATE INDEX wallet_topups_driver_created_idx
  ON wallet_topups (driver_id, created_at DESC, id DESC);

CREATE INDEX wallet_topups_status_expires_idx
  ON wallet_topups (status, expires_at)
  WHERE status = 'PENDING';
