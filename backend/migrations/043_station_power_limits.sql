ALTER TABLE stations
  ADD COLUMN power_limit_w INTEGER CHECK (power_limit_w > 0);

ALTER TABLE connectors
  ADD COLUMN rated_power_w INTEGER CHECK (rated_power_w > 0);
