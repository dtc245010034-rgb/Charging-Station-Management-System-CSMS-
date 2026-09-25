-- Ensure owner_id column exists
ALTER TABLE stations ADD COLUMN IF NOT EXISTS owner_id BIGINT;

-- Replace existing FK with ON DELETE RESTRICT to block deleting an owner who still has stations
ALTER TABLE stations DROP CONSTRAINT IF EXISTS fk_stations_owner;
ALTER TABLE stations ADD CONSTRAINT fk_stations_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT;

-- Ensure index for owner_id
CREATE INDEX IF NOT EXISTS idx_stations_owner_id ON stations(owner_id);

-- Ensure is_active column exists (active status)
ALTER TABLE stations ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

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

-- Keep status column and checks as-is; this migration only adjusts owner FK and coordinate types.
