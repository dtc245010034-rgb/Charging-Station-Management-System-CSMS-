-- Prepare the station ownership contract without silently assigning legacy rows.
ALTER TABLE stations ADD COLUMN IF NOT EXISTS owner_id BIGINT;
ALTER TABLE stations ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip TEXT;

CREATE INDEX IF NOT EXISTS stations_owner_id_idx ON stations (owner_id);
CREATE INDEX IF NOT EXISTS charge_points_station_id_idx ON charge_points (station_id);
