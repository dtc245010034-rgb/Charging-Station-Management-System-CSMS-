CREATE INDEX audit_logs_driver_metadata_driver_id_idx
  ON audit_logs ((metadata ->> 'driver_id'));
