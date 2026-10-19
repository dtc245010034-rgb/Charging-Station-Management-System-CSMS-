CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS subscription_plans (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_dong BIGINT NOT NULL CHECK (price_dong > 0),
  duration_days SMALLINT NOT NULL CHECK (duration_days BETWEEN 1 AND 366) DEFAULT 30,
  idle_grace_min INTEGER NULL,
  idle_per_min_dong BIGINT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscription_plan_periods (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  start_minute SMALLINT NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute SMALLINT NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  price_per_kwh_dong BIGINT NOT NULL CHECK (price_per_kwh_dong >= 0),
  label TEXT NOT NULL,
  CHECK (end_minute > start_minute)
);

CREATE INDEX IF NOT EXISTS idx_subscription_plan_periods_plan ON subscription_plan_periods (plan_id, start_minute);

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  plan_id BIGINT NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  price_dong BIGINT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT subscriptions_driver_idempotency_key UNIQUE (driver_id, idempotency_key),
  CONSTRAINT subscriptions_no_overlap EXCLUDE USING gist (driver_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_driver_active ON subscriptions (driver_id, starts_at, ends_at);

-- Trigger bất biến cho subscription_plans: chỉ cho phép chuyển active từ TRUE sang FALSE
CREATE OR REPLACE FUNCTION reject_subscription_plans_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.active = TRUE AND NEW.active = FALSE
       AND OLD.id = NEW.id
       AND OLD.code = NEW.code
       AND OLD.name = NEW.name
       AND OLD.price_dong = NEW.price_dong
       AND OLD.duration_days = NEW.duration_days
       AND OLD.idle_grace_min IS NOT DISTINCT FROM NEW.idle_grace_min
       AND OLD.idle_per_min_dong IS NOT DISTINCT FROM NEW.idle_per_min_dong
       AND OLD.created_by IS NOT DISTINCT FROM NEW.created_by
       AND OLD.created_at = NEW.created_at THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'subscription_plans is append-only except retiring active status'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER subscription_plans_append_only
BEFORE UPDATE OR DELETE ON subscription_plans
FOR EACH ROW
EXECUTE FUNCTION reject_subscription_plans_mutation();

CREATE TRIGGER subscription_plans_no_truncate
BEFORE TRUNCATE ON subscription_plans
FOR EACH STATEMENT
EXECUTE FUNCTION reject_subscription_plans_mutation();

-- Trigger bất biến cho subscription_plan_periods
CREATE OR REPLACE FUNCTION reject_subscription_plan_periods_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'subscription_plan_periods is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER subscription_plan_periods_append_only
BEFORE UPDATE OR DELETE ON subscription_plan_periods
FOR EACH ROW
EXECUTE FUNCTION reject_subscription_plan_periods_mutation();

CREATE TRIGGER subscription_plan_periods_no_truncate
BEFORE TRUNCATE ON subscription_plan_periods
FOR EACH STATEMENT
EXECUTE FUNCTION reject_subscription_plan_periods_mutation();

-- Trigger bất biến cho subscriptions
CREATE OR REPLACE FUNCTION reject_subscriptions_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'subscriptions is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER subscriptions_append_only
BEFORE UPDATE OR DELETE ON subscriptions
FOR EACH ROW
EXECUTE FUNCTION reject_subscriptions_mutation();

CREATE TRIGGER subscriptions_no_truncate
BEFORE TRUNCATE ON subscriptions
FOR EACH STATEMENT
EXECUTE FUNCTION reject_subscriptions_mutation();
