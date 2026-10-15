DROP TRIGGER IF EXISTS trg_period_lock_charging_sessions ON charging_sessions;
DROP FUNCTION IF EXISTS check_period_lock_charging_sessions();

DROP TRIGGER IF EXISTS trg_period_lock_wallet_ledger ON wallet_ledger;
DROP FUNCTION IF EXISTS check_period_lock_wallet_ledger();

DROP TRIGGER IF EXISTS trg_period_lock_invoice_lines ON invoice_lines;
DROP FUNCTION IF EXISTS check_period_lock_invoice_lines();

DROP TRIGGER IF EXISTS trg_period_lock_session_invoices ON session_invoices;
DROP FUNCTION IF EXISTS check_period_lock_session_invoices();
