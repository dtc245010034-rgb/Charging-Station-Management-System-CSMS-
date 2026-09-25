ALTER TABLE audit_logs DROP COLUMN IF EXISTS ip;
DROP INDEX IF EXISTS charge_points_station_id_idx;
DROP INDEX IF EXISTS stations_owner_id_idx;
ALTER TABLE stations DROP COLUMN IF EXISTS is_active;
ALTER TABLE stations DROP COLUMN IF EXISTS owner_id;
