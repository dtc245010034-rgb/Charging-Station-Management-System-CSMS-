-- Thêm subscription_id và tariff_source vào session_invoices, cho phép tariff_id NULL
ALTER TABLE session_invoices
  ADD COLUMN IF NOT EXISTS subscription_id BIGINT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS tariff_source TEXT NOT NULL DEFAULT 'STATION' CHECK (tariff_source IN ('STATION', 'SUBSCRIPTION')),
  ALTER COLUMN tariff_id DROP NOT NULL;

-- Cập nhật trigger bất biến trên session_invoices để hỗ trợ anonymize driver_id với subscription_id & tariff_source
CREATE OR REPLACE FUNCTION reject_session_invoices_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.driver_id IS NOT NULL AND NEW.driver_id IS NULL
       AND NEW.id = OLD.id
       AND NEW.session_id = OLD.session_id
       AND NEW.station_id = OLD.station_id
       AND NEW.tariff_id IS NOT DISTINCT FROM OLD.tariff_id
       AND NEW.tariff_snapshot = OLD.tariff_snapshot
       AND NEW.timezone = OLD.timezone
       AND NEW.rounding_rule = OLD.rounding_rule
       AND NEW.total_dong = OLD.total_dong
       AND NEW.period_date = OLD.period_date
       AND NEW.issued_at = OLD.issued_at
       AND NEW.subscription_id IS NOT DISTINCT FROM OLD.subscription_id
       AND NEW.tariff_source = OLD.tariff_source THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'session_invoices is immutable (only driver_id anonymization to NULL allowed)'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'session_invoices is immutable (DELETE forbidden)'
      USING ERRCODE = '55000';
  END IF;

  RETURN NULL;
END;
$$;

-- Thêm subscription_id vào wallet_ledger kèm chỉ mục duy nhất từng phần cho SUBSCRIPTION_FEE
ALTER TABLE wallet_ledger
  ADD COLUMN IF NOT EXISTS subscription_id BIGINT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_subscription_fee_key
  ON wallet_ledger (subscription_id)
  WHERE entry_type = 'SUBSCRIPTION_FEE';
