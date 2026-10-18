ALTER TABLE stations
  DROP COLUMN IF EXISTS power_profile,
  DROP COLUMN IF EXISTS power_limit_kw;
