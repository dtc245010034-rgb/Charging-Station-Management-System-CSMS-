DROP INDEX IF EXISTS wallet_ledger_subscription_fee_key;
ALTER TABLE wallet_ledger DROP COLUMN IF EXISTS subscription_id;

-- Khôi phục session_invoices trigger
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
       AND NEW.tariff_id = OLD.tariff_id
       AND NEW.tariff_snapshot = OLD.tariff_snapshot
       AND NEW.timezone = OLD.timezone
       AND NEW.rounding_rule = OLD.rounding_rule
       AND NEW.total_dong = OLD.total_dong
       AND NEW.period_date = OLD.period_date
       AND NEW.issued_at = OLD.issued_at THEN
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

ALTER TABLE session_invoices
  DROP COLUMN IF EXISTS tariff_source,
  DROP COLUMN IF EXISTS subscription_id;
