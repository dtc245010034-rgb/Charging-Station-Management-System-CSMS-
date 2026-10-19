ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS no_show_fee_dong BIGINT NOT NULL DEFAULT 0 CHECK (no_show_fee_dong BETWEEN 0 AND 1000000);

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS no_show_fee_dong BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancel_status TEXT NOT NULL DEFAULT 'NONE' CHECK (cancel_status IN ('NONE', 'PENDING', 'SENT', 'FAILED')),
  ADD COLUMN IF NOT EXISTS cancel_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_wallet_ledger_reservation'
  ) THEN
    ALTER TABLE wallet_ledger
      ADD CONSTRAINT fk_wallet_ledger_reservation
      FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE RESTRICT;
  END IF;
END $$;
