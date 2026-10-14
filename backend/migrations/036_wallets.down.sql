DROP TRIGGER IF EXISTS wallet_ledger_no_truncate ON wallet_ledger;
DROP TRIGGER IF EXISTS wallet_ledger_immutability ON wallet_ledger;
DROP TABLE IF EXISTS wallet_ledger;
DROP TABLE IF EXISTS wallets;
DROP FUNCTION IF EXISTS reject_wallet_ledger_mutation();
DROP FUNCTION IF EXISTS reject_wallet_ledger_truncate();
