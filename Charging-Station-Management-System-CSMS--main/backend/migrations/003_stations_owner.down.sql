ALTER TABLE audit_logs DROP COLUMN ip;
DROP INDEX charge_points_station_id_idx;
DROP INDEX stations_owner_id_idx;
ALTER TABLE stations DROP COLUMN owner_id;
