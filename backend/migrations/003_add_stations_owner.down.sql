-- Rollback owner_id foreign key
ALTER TABLE stations DROP CONSTRAINT IF EXISTS fk_stations_owner;
ALTER TABLE stations DROP COLUMN IF EXISTS owner_id;

-- Rollback index
DROP INDEX IF EXISTS idx_stations_owner_id;

-- Rollback is_active column
ALTER TABLE stations DROP COLUMN IF EXISTS is_active;
