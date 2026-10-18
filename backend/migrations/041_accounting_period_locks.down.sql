DROP TRIGGER IF EXISTS charging_sessions_period_lock ON charging_sessions;
DROP FUNCTION IF EXISTS reject_closed_session_update();
DROP TRIGGER IF EXISTS wallet_ledger_period_lock ON wallet_ledger;
DROP TRIGGER IF EXISTS invoice_lines_period_lock ON invoice_lines;
DROP TRIGGER IF EXISTS session_invoices_period_lock ON session_invoices;
DROP FUNCTION IF EXISTS reject_closed_period_insert();
DROP INDEX IF EXISTS session_invoices_period_date_idx;
