DROP INDEX IF EXISTS wallet_ledger_subscription_fee_key;
ALTER TABLE wallet_ledger DROP COLUMN IF EXISTS subscription_id;
DROP TABLE IF EXISTS driver_subscriptions;
DROP TABLE IF EXISTS subscription_plans;
