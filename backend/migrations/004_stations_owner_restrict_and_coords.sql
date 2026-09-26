-- Enforce ownership only after legacy rows have been checked explicitly.
ALTER TABLE stations ADD COLUMN IF NOT EXISTS owner_id BIGINT;
ALTER TABLE stations ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
DECLARE
  unowned_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO unowned_count FROM stations WHERE owner_id IS NULL;
  IF unowned_count > 0 THEN
    RAISE EXCEPTION 'Cannot enforce station ownership: % station(s) have no owner_id', unowned_count;
  END IF;
END$$;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
    WHERE rel.relname = 'stations'
      AND con.contype = 'f'
      AND att.attname = 'owner_id'
  LOOP
    EXECUTE format('ALTER TABLE stations DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END$$;

ALTER TABLE stations ADD CONSTRAINT fk_stations_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE stations ALTER COLUMN owner_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS stations_owner_id_idx ON stations(owner_id);

UPDATE stations
SET is_active = status IN ('ACTIVE', 'MAINTENANCE');

CREATE OR REPLACE FUNCTION sync_station_is_active()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.is_active := NEW.status IN ('ACTIVE', 'MAINTENANCE');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stations_status_is_active_sync ON stations;
CREATE TRIGGER stations_status_is_active_sync
  BEFORE INSERT OR UPDATE OF status, is_active ON stations
  FOR EACH ROW
  EXECUTE FUNCTION sync_station_is_active();

-- Convert latitude/longitude to REAL if the columns exist. Use safe check and cast.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stations' AND column_name = 'latitude') THEN
    ALTER TABLE stations ALTER COLUMN latitude TYPE REAL USING latitude::REAL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stations' AND column_name = 'longitude') THEN
    ALTER TABLE stations ALTER COLUMN longitude TYPE REAL USING longitude::REAL;
  END IF;
END$$;

-- Keep the status check and owner assignment policy explicit.
