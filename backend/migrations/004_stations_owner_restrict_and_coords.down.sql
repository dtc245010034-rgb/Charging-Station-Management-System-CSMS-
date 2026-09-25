-- Rollback: restore previous FK behavior and coordinate types

-- Drop the restrictive FK if present
ALTER TABLE stations DROP CONSTRAINT IF EXISTS fk_stations_owner;

-- Recreate FK with ON DELETE SET NULL to restore prior behavior (if you previously had SET NULL)
ALTER TABLE stations ADD CONSTRAINT IF NOT EXISTS fk_stations_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

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

-- Note: this down migration intentionally does not DROP owner_id, idx_stations_owner_id or is_active to avoid accidental data loss.
