-- Sở hữu trạm (S-03). NOT NULL: DB đã có trạm phải reset (docker compose down -v) vì không có chủ để gán.
ALTER TABLE stations ADD COLUMN owner_id BIGINT NOT NULL REFERENCES users(id);
CREATE INDEX stations_owner_id_idx ON stations (owner_id);
CREATE INDEX charge_points_station_id_idx ON charge_points (station_id);
-- IP của yêu cầu, dùng cho nhật ký ACCESS_DENIED.
ALTER TABLE audit_logs ADD COLUMN ip TEXT;
