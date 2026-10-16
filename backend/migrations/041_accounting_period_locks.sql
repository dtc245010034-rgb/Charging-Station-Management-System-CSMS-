CREATE OR REPLACE FUNCTION reject_closed_period_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_date DATE;
BEGIN
  IF TG_TABLE_NAME = 'invoice_lines' THEN
    SELECT si.period_date
      INTO target_date
      FROM session_invoices si
     WHERE si.id = NEW.invoice_id;
  ELSE
    target_date := NEW.period_date;
  END IF;

  IF target_date IS NOT NULL AND is_period_closed(target_date) THEN
    RAISE EXCEPTION 'PERIOD_CLOSED'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER session_invoices_period_lock
BEFORE INSERT ON session_invoices
FOR EACH ROW
EXECUTE FUNCTION reject_closed_period_insert();

CREATE TRIGGER invoice_lines_period_lock
BEFORE INSERT ON invoice_lines
FOR EACH ROW
EXECUTE FUNCTION reject_closed_period_insert();

CREATE TRIGGER wallet_ledger_period_lock
BEFORE INSERT ON wallet_ledger
FOR EACH ROW
EXECUTE FUNCTION reject_closed_period_insert();

CREATE INDEX session_invoices_period_date_idx
  ON session_invoices (period_date);

CREATE OR REPLACE FUNCTION reject_closed_session_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  session_date DATE;
  immutable_old JSONB;
  immutable_new JSONB;
BEGIN
  IF OLD.stopped_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (OLD.stopped_at AT TIME ZONE s.timezone)::date
    INTO session_date
    FROM charge_points cp
    JOIN stations s ON s.id = cp.station_id
   WHERE cp.id = OLD.charge_point_id;

  IF session_date IS NULL OR NOT is_period_closed(session_date) THEN
    RETURN NEW;
  END IF;

  immutable_old := to_jsonb(OLD) - ARRAY[
    'driver_id', 'id_tag_id', 'id_tag_masked', 'updated_at',
    'billing_status', 'billing_reason', 'billing_attempts', 'billing_next_at'
  ];
  immutable_new := to_jsonb(NEW) - ARRAY[
    'driver_id', 'id_tag_id', 'id_tag_masked', 'updated_at',
    'billing_status', 'billing_reason', 'billing_attempts', 'billing_next_at'
  ];
  IF immutable_old IS DISTINCT FROM immutable_new THEN
    RAISE EXCEPTION 'PERIOD_CLOSED'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.driver_id IS DISTINCT FROM NEW.driver_id
     OR OLD.id_tag_id IS DISTINCT FROM NEW.id_tag_id
     OR OLD.id_tag_masked IS DISTINCT FROM NEW.id_tag_masked THEN
    IF NEW.driver_id IS NULL
       AND NEW.id_tag_id IS NULL
       AND NEW.id_tag_masked = 'ER-' || upper(to_hex(NEW.id)) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'PERIOD_CLOSED'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.billing_status = 'ERROR'
     AND NEW.billing_reason = 'PERIOD_CLOSED'
     AND NEW.billing_attempts = OLD.billing_attempts + 1
     AND NEW.billing_next_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.billing_status IS DISTINCT FROM NEW.billing_status
     OR OLD.billing_reason IS DISTINCT FROM NEW.billing_reason
     OR OLD.billing_attempts IS DISTINCT FROM NEW.billing_attempts
     OR OLD.billing_next_at IS DISTINCT FROM NEW.billing_next_at THEN
    RAISE EXCEPTION 'PERIOD_CLOSED'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER charging_sessions_period_lock
BEFORE UPDATE ON charging_sessions
FOR EACH ROW
EXECUTE FUNCTION reject_closed_session_update();
