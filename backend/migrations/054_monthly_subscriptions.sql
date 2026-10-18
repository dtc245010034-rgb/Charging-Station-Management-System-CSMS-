CREATE TABLE subscription_plans (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  fee_dong BIGINT NOT NULL CHECK (fee_dong > 0),
  price_per_kwh_dong BIGINT NOT NULL CHECK (price_per_kwh_dong > 0),
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO subscription_plans (code, name, fee_dong, price_per_kwh_dong, duration_days)
VALUES ('VIP', 'VIP', 299000, 30000, 30);

CREATE TABLE driver_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  plan_id BIGINT NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  plan_code TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  fee_dong BIGINT NOT NULL CHECK (fee_dong > 0),
  price_per_kwh_dong BIGINT NOT NULL CHECK (price_per_kwh_dong > 0),
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > starts_at),
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT driver_subscriptions_idempotency_key UNIQUE (driver_id, idempotency_key)
);

CREATE INDEX driver_subscriptions_driver_expiry_idx
  ON driver_subscriptions (driver_id, expires_at DESC, id DESC);

ALTER TABLE wallet_ledger
  ADD COLUMN subscription_id BIGINT REFERENCES driver_subscriptions(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX wallet_ledger_subscription_fee_key
  ON wallet_ledger (subscription_id)
  WHERE entry_type = 'SUBSCRIPTION_FEE';
