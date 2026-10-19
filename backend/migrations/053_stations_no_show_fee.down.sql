DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_wallet_ledger_reservation'
  ) THEN
    ALTER TABLE wallet_ledger DROP CONSTRAINT fk_wallet_ledger_reservation;
  END IF;
END $$;

ALTER TABLE reservations
  DROP COLUMN IF EXISTS no_show_fee_dong,
  DROP COLUMN IF EXISTS cancel_status,
  DROP COLUMN IF EXISTS cancel_attempts,
  DROP COLUMN IF EXISTS cancelled_at,
  DROP COLUMN IF EXISTS expired_at;

ALTER TABLE stations
  DROP COLUMN IF EXISTS no_show_fee_dong;
