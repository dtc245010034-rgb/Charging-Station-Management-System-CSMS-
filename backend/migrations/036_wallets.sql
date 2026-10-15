CREATE TABLE wallets (
  driver_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  balance_dong BIGINT NOT NULL DEFAULT 0,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  locked_reason TEXT,
  locked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE wallet_ledger (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL CHECK (
    entry_type IN (
      'TOPUP_GATEWAY',
      'TOPUP_MANUAL',
      'SESSION_DEBIT',
      'ADJUSTMENT',
      'RESERVATION_FEE',
      'SUBSCRIPTION_FEE'
    )
  ),
  amount_dong BIGINT NOT NULL,
  balance_after_dong BIGINT NOT NULL,
  session_id INTEGER REFERENCES charging_sessions(id) ON DELETE RESTRICT,
  topup_id BIGINT,
  reservation_id BIGINT,
  receipt_code TEXT,
  reason TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  period_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX wallet_ledger_driver_created_idx
  ON wallet_ledger (driver_id, created_at DESC, id DESC);
CREATE UNIQUE INDEX wallet_ledger_session_debit_key
  ON wallet_ledger (session_id)
  WHERE entry_type = 'SESSION_DEBIT';
CREATE UNIQUE INDEX wallet_ledger_manual_receipt_key
  ON wallet_ledger (receipt_code)
  WHERE entry_type = 'TOPUP_MANUAL';
CREATE UNIQUE INDEX wallet_ledger_gateway_topup_key
  ON wallet_ledger (topup_id)
  WHERE entry_type = 'TOPUP_GATEWAY';
CREATE UNIQUE INDEX wallet_ledger_reservation_fee_key
  ON wallet_ledger (reservation_id)
  WHERE entry_type = 'RESERVATION_FEE';

CREATE OR REPLACE FUNCTION reject_wallet_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'wallet_ledger is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER wallet_ledger_append_only
BEFORE UPDATE OR DELETE ON wallet_ledger
FOR EACH ROW
EXECUTE FUNCTION reject_wallet_ledger_mutation();

CREATE TRIGGER wallet_ledger_no_truncate
BEFORE TRUNCATE ON wallet_ledger
FOR EACH STATEMENT
EXECUTE FUNCTION reject_wallet_ledger_mutation();

REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE wallet_ledger FROM PUBLIC;
