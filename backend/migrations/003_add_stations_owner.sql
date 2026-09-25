-- Add owner_id foreign key to stations table
ALTER TABLE stations ADD COLUMN IF NOT EXISTS owner_id BIGINT;
ALTER TABLE stations ADD CONSTRAINT fk_stations_owner 
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

-- Add index for owner_id to improve query performance
CREATE INDEX IF NOT EXISTS idx_stations_owner_id ON stations(owner_id);

-- Add is_active column for active status
ALTER TABLE stations ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Update existing coordinate columns to REAL type (if needed)
-- Note: If migration from NUMERIC is needed, use the down migration first
