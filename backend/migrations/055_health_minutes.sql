CREATE TABLE health_minutes (
  minute_at TIMESTAMPTZ PRIMARY KEY,
  ocpp_calls BIGINT NOT NULL DEFAULT 0 CHECK (ocpp_calls >= 0),
  ocpp_errors BIGINT NOT NULL DEFAULT 0 CHECK (ocpp_errors >= 0),
  latency_sum_ms BIGINT NOT NULL DEFAULT 0 CHECK (latency_sum_ms >= 0),
  cps_online INTEGER NOT NULL DEFAULT 0 CHECK (cps_online >= 0),
  cps_total INTEGER NOT NULL DEFAULT 0 CHECK (cps_total >= 0),
  sessions_active INTEGER NOT NULL DEFAULT 0 CHECK (sessions_active >= 0),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
