ALTER TABLE connectors
  ADD COLUMN IF NOT EXISTS ocpp_status TEXT;
