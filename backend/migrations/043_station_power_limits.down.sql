ALTER TABLE connectors
  DROP COLUMN rated_power_w;

ALTER TABLE stations
  DROP COLUMN power_limit_w;
