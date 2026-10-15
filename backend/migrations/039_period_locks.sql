-- Migration 039: Trigger khoá kỳ cho session_invoices, invoice_lines, wallet_ledger, charging_sessions

-- 1. Trigger cho session_invoices: BEFORE INSERT
CREATE OR REPLACE FUNCTION check_period_lock_session_invoices()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_period_closed(NEW.period_date) THEN
    RAISE EXCEPTION 'accounting period is closed for date %', NEW.period_date
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_period_lock_session_invoices
BEFORE INSERT ON session_invoices
FOR EACH ROW
EXECUTE FUNCTION check_period_lock_session_invoices();

-- 2. Trigger cho invoice_lines: BEFORE INSERT
CREATE OR REPLACE FUNCTION check_period_lock_invoice_lines()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_date DATE;
BEGIN
  SELECT period_date INTO v_period_date FROM session_invoices WHERE id = NEW.invoice_id;
  IF v_period_date IS NOT NULL AND is_period_closed(v_period_date) THEN
    RAISE EXCEPTION 'accounting period is closed for invoice % (date %)', NEW.invoice_id, v_period_date
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_period_lock_invoice_lines
BEFORE INSERT ON invoice_lines
FOR EACH ROW
EXECUTE FUNCTION check_period_lock_invoice_lines();

-- 3. Trigger cho wallet_ledger: BEFORE INSERT
CREATE OR REPLACE FUNCTION check_period_lock_wallet_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_period_closed(NEW.period_date) THEN
    RAISE EXCEPTION 'accounting period is closed for date %', NEW.period_date
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_period_lock_wallet_ledger
BEFORE INSERT ON wallet_ledger
FOR EACH ROW
EXECUTE FUNCTION check_period_lock_wallet_ledger();

-- 4. Trigger cho charging_sessions: BEFORE UPDATE
-- Chặn sửa bất kỳ cột nào NGOÀI nhóm ngoại lệ {driver_id, id_tag_id, id_tag_masked, updated_at}
-- nếu stopped_at (ngày địa phương giờ trạm) rơi vào kỳ đã chốt
CREATE OR REPLACE FUNCTION check_period_lock_charging_sessions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_tz TEXT;
  v_local_date DATE;
BEGIN
  IF OLD.stopped_at IS NOT NULL THEN
    SELECT s.timezone INTO v_tz
    FROM charge_points cp
    JOIN stations s ON s.id = cp.station_id
    WHERE cp.id = OLD.charge_point_id;

    IF v_tz IS NULL THEN
      v_tz := 'Asia/Ho_Chi_Minh';
    END IF;

    v_local_date := (OLD.stopped_at AT TIME ZONE v_tz)::date;

    IF is_period_closed(v_local_date) THEN
      -- Kiểm tra xem có cột nào ngoài nhóm ngoại lệ bị đổi không
      IF (NEW.id IS DISTINCT FROM OLD.id)
         OR (NEW.charge_point_id IS DISTINCT FROM OLD.charge_point_id)
         OR (NEW.connector_id IS DISTINCT FROM OLD.connector_id)
         OR (NEW.connector_no IS DISTINCT FROM OLD.connector_no)
         OR (NEW.meter_start IS DISTINCT FROM OLD.meter_start)
         OR (NEW.meter_stop IS DISTINCT FROM OLD.meter_stop)
         OR (NEW.started_at IS DISTINCT FROM OLD.started_at)
         OR (NEW.stopped_at IS DISTINCT FROM OLD.stopped_at)
         OR (NEW.stop_reason IS DISTINCT FROM OLD.stop_reason)
         OR (NEW.status IS DISTINCT FROM OLD.status)
         OR (NEW.needs_review IS DISTINCT FROM OLD.needs_review)
         OR (NEW.review_reason IS DISTINCT FROM OLD.review_reason)
         OR (NEW.billing_status IS DISTINCT FROM OLD.billing_status)
         OR (NEW.billing_reason IS DISTINCT FROM OLD.billing_reason)
         OR (NEW.billing_attempts IS DISTINCT FROM OLD.billing_attempts)
         OR (NEW.billing_next_at IS DISTINCT FROM OLD.billing_next_at)
         OR (NEW.billing_idle_from IS DISTINCT FROM OLD.billing_idle_from)
         OR (NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
        RAISE EXCEPTION 'charging_sessions in closed period % is read-only (only anonymization allowed)', v_local_date
          USING ERRCODE = '55000';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_period_lock_charging_sessions
BEFORE UPDATE ON charging_sessions
FOR EACH ROW
EXECUTE FUNCTION check_period_lock_charging_sessions();
