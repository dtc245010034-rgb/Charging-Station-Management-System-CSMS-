-- Restore the pre-004 state while leaving 003-owned columns in place.
DROP TRIGGER IF EXISTS stations_status_is_active_sync ON stations;
DROP FUNCTION IF EXISTS sync_station_is_active();

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

ALTER TABLE stations ALTER COLUMN owner_id DROP NOT NULL;

-- Revert latitude/longitude to NUMERIC if the columns exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stations' AND column_name = 'latitude') THEN
    ALTER TABLE stations ALTER COLUMN latitude TYPE NUMERIC USING latitude::NUMERIC;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stations' AND column_name = 'longitude') THEN
    ALTER TABLE stations ALTER COLUMN longitude TYPE NUMERIC USING longitude::NUMERIC;
  END IF;
END$$;
