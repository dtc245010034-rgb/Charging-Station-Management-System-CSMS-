DROP TABLE idempotency_keys;
ALTER TABLE stations DROP CONSTRAINT stations_owner_id_fkey;
ALTER TABLE stations ADD CONSTRAINT stations_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id);
DROP INDEX stations_coordinates_idx;
ALTER TABLE stations
  DROP CONSTRAINT stations_longitude_range_check,
  DROP CONSTRAINT stations_latitude_range_check,
  ALTER COLUMN latitude DROP NOT NULL,
  ALTER COLUMN longitude DROP NOT NULL,
  ALTER COLUMN latitude TYPE NUMERIC USING latitude::numeric,
  ALTER COLUMN longitude TYPE NUMERIC USING longitude::numeric,
  ALTER COLUMN status SET DEFAULT 'ACTIVE';