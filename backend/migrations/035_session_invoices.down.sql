DROP TRIGGER IF EXISTS invoice_lines_no_truncate ON invoice_lines;
DROP TRIGGER IF EXISTS invoice_lines_immutability ON invoice_lines;
DROP TRIGGER IF EXISTS session_invoices_no_truncate ON session_invoices;
DROP TRIGGER IF EXISTS session_invoices_immutability ON session_invoices;

DROP FUNCTION IF EXISTS reject_invoice_lines_mutation();
DROP FUNCTION IF EXISTS reject_session_invoices_mutation();
DROP FUNCTION IF EXISTS reject_invoices_truncate();

DROP TABLE IF EXISTS invoice_lines CASCADE;
DROP TABLE IF EXISTS session_invoices CASCADE;

DROP INDEX IF EXISTS idx_charging_sessions_billing_next_at;
DROP INDEX IF EXISTS idx_charging_sessions_billing_status;

ALTER TABLE charging_sessions
  DROP COLUMN IF EXISTS billing_idle_from,
  DROP COLUMN IF EXISTS billing_next_at,
  DROP COLUMN IF EXISTS billing_attempts,
  DROP COLUMN IF EXISTS billing_reason,
  DROP COLUMN IF EXISTS billing_status;
