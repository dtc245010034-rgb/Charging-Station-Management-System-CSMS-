DROP TRIGGER IF EXISTS subscriptions_no_truncate ON subscriptions;
DROP TRIGGER IF EXISTS subscriptions_append_only ON subscriptions;
DROP FUNCTION IF EXISTS reject_subscriptions_mutation();
DROP TABLE IF EXISTS subscriptions CASCADE;

DROP TRIGGER IF EXISTS subscription_plan_periods_no_truncate ON subscription_plan_periods;
DROP TRIGGER IF EXISTS subscription_plan_periods_append_only ON subscription_plan_periods;
DROP FUNCTION IF EXISTS reject_subscription_plan_periods_mutation();
DROP TABLE IF EXISTS subscription_plan_periods CASCADE;

DROP TRIGGER IF EXISTS subscription_plans_no_truncate ON subscription_plans;
DROP TRIGGER IF EXISTS subscription_plans_append_only ON subscription_plans;
DROP FUNCTION IF EXISTS reject_subscription_plans_mutation();
DROP TABLE IF EXISTS subscription_plans CASCADE;
