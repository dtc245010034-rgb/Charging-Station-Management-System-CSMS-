CREATE TABLE tariffs (
  id BIGSERIAL PRIMARY KEY,
  station_id BIGINT NOT NULL REFERENCES stations(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version >= 1),
  effective_from DATE NOT NULL,
  idle_grace_min INTEGER NOT NULL DEFAULT 0 CHECK (idle_grace_min >= 0),
  idle_per_min_dong BIGINT NOT NULL DEFAULT 0 CHECK (idle_per_min_dong >= 0),
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_tariffs_station_version UNIQUE (station_id, version),
  CONSTRAINT uq_tariffs_station_effective_from UNIQUE (station_id, effective_from)
);

CREATE TABLE tariff_periods (
  id BIGSERIAL PRIMARY KEY,
  tariff_id BIGINT NOT NULL REFERENCES tariffs(id) ON DELETE RESTRICT,
  start_minute INTEGER NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
  end_minute INTEGER NOT NULL CHECK (end_minute > 0 AND end_minute <= 1440),
  price_per_kwh_dong BIGINT NOT NULL CHECK (price_per_kwh_dong >= 0),
  label TEXT,
  CONSTRAINT chk_tariff_period_order CHECK (start_minute < end_minute)
);

CREATE INDEX idx_tariffs_station_effective ON tariffs (station_id, effective_from DESC);
CREATE INDEX idx_tariff_periods_tariff_id ON tariff_periods (tariff_id);

CREATE OR REPLACE FUNCTION reject_tariffs_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'tariffs and tariff_periods are append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER tariffs_append_only
BEFORE UPDATE OR DELETE ON tariffs
FOR EACH ROW
EXECUTE FUNCTION reject_tariffs_mutation();

CREATE TRIGGER tariffs_no_truncate
BEFORE TRUNCATE ON tariffs
FOR EACH STATEMENT
EXECUTE FUNCTION reject_tariffs_mutation();

CREATE TRIGGER tariff_periods_append_only
BEFORE UPDATE OR DELETE ON tariff_periods
FOR EACH ROW
EXECUTE FUNCTION reject_tariffs_mutation();

CREATE TRIGGER tariff_periods_no_truncate
BEFORE TRUNCATE ON tariff_periods
FOR EACH STATEMENT
EXECUTE FUNCTION reject_tariffs_mutation();
