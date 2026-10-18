CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE station_power_windows (
  id BIGSERIAL PRIMARY KEY,
  station_id BIGINT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  start_minute SMALLINT NOT NULL CHECK (start_minute >= 0 AND start_minute <= 1439),
  end_minute SMALLINT NOT NULL CHECK (end_minute >= 1 AND end_minute <= 1440),
  limit_w INTEGER NOT NULL CHECK (limit_w > 0),
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL,
  deleted_by BIGINT REFERENCES users(id),
  CHECK (end_minute > start_minute),
  EXCLUDE USING gist (
    station_id WITH =,
    int4range(start_minute, end_minute) WITH &&
  ) WHERE (deleted_at IS NULL)
);

CREATE INDEX idx_station_power_windows_station_active
  ON station_power_windows (station_id)
  WHERE deleted_at IS NULL;
