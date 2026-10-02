ALTER TABLE charge_points
  ADD COLUMN heartbeat_interval INTEGER NOT NULL DEFAULT 60 CHECK (heartbeat_interval > 0);