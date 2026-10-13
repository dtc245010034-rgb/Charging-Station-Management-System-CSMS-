ALTER TABLE charging_sessions
  ADD COLUMN IF NOT EXISTS billing_status TEXT NULL,
  ADD COLUMN IF NOT EXISTS billing_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS billing_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_next_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS billing_idle_from TIMESTAMPTZ NULL;

UPDATE charging_sessions
SET billing_status = 'SKIPPED',
    billing_reason = 'EXISTING_COMPLETED_BEFORE_TARIFF'
WHERE status = 'COMPLETED'
  AND billing_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_charging_sessions_billing_status ON charging_sessions (billing_status);
CREATE INDEX IF NOT EXISTS idx_charging_sessions_billing_next_at ON charging_sessions (billing_next_at) WHERE billing_status = 'ERROR';

CREATE TABLE session_invoices (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL UNIQUE REFERENCES charging_sessions(id) ON DELETE RESTRICT,
  driver_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  station_id BIGINT NOT NULL REFERENCES stations(id) ON DELETE RESTRICT,
  tariff_id BIGINT NOT NULL REFERENCES tariffs(id) ON DELETE RESTRICT,
  tariff_snapshot JSONB NOT NULL,
  timezone TEXT NOT NULL,
  rounding_rule TEXT NOT NULL DEFAULT 'PER_SEGMENT_HALF_UP',
  total_dong BIGINT NOT NULL CHECK (total_dong >= 0),
  period_date DATE NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_session_invoices_driver ON session_invoices (driver_id, issued_at DESC);
CREATE INDEX idx_session_invoices_station ON session_invoices (station_id, issued_at DESC);

CREATE TABLE invoice_lines (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES session_invoices(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ENERGY', 'IDLE')),
  local_date DATE NOT NULL,
  from_at TIMESTAMPTZ NOT NULL,
  to_at TIMESTAMPTZ NOT NULL,
  wh BIGINT NOT NULL DEFAULT 0 CHECK (wh >= 0),
  price_per_kwh BIGINT NULL,
  minutes INTEGER NULL,
  per_min_dong BIGINT NULL,
  amount_dong BIGINT NOT NULL CHECK (amount_dong >= 0),
  CONSTRAINT uq_invoice_lines_seq UNIQUE (invoice_id, seq)
);

CREATE INDEX idx_invoice_lines_invoice ON invoice_lines (invoice_id, seq);

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

CREATE OR REPLACE FUNCTION reject_invoice_lines_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'invoice_lines is immutable (UPDATE or DELETE forbidden)'
    USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION reject_invoices_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'TRUNCATE forbidden on invoice tables'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER session_invoices_immutability
BEFORE UPDATE OR DELETE ON session_invoices
FOR EACH ROW
EXECUTE FUNCTION reject_session_invoices_mutation();

CREATE TRIGGER session_invoices_no_truncate
BEFORE TRUNCATE ON session_invoices
FOR EACH STATEMENT
EXECUTE FUNCTION reject_invoices_truncate();

CREATE TRIGGER invoice_lines_immutability
BEFORE UPDATE OR DELETE ON invoice_lines
FOR EACH ROW
EXECUTE FUNCTION reject_invoice_lines_mutation();

CREATE TRIGGER invoice_lines_no_truncate
BEFORE TRUNCATE ON invoice_lines
FOR EACH STATEMENT
EXECUTE FUNCTION reject_invoices_truncate();
