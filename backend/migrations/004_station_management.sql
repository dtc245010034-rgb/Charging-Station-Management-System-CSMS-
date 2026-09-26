ALTER TABLE stations
  ALTER COLUMN latitude TYPE NUMERIC(10, 8) USING ROUND(latitude::numeric, 8),
  ALTER COLUMN longitude TYPE NUMERIC(11, 8) USING ROUND(longitude::numeric, 8),
  ALTER COLUMN status SET DEFAULT 'INACTIVE';

ALTER TABLE stations
  ADD CONSTRAINT stations_latitude_range_check CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT stations_longitude_range_check CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);

ALTER TABLE stations
  ALTER COLUMN latitude SET NOT NULL,
  ALTER COLUMN longitude SET NOT NULL;

CREATE INDEX stations_coordinates_idx ON stations (latitude, longitude);

ALTER TABLE stations DROP CONSTRAINT stations_owner_id_fkey;
ALTER TABLE stations ADD CONSTRAINT stations_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT;

CREATE TABLE idempotency_keys (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, key)
);