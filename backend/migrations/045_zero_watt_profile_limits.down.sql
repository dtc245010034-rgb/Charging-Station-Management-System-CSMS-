DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM charging_profile_log WHERE limit_w = 0) THEN
    RAISE EXCEPTION 'Cannot roll back migration 045 while zero-watt charging profiles exist';
  END IF;
END
$$;

ALTER TABLE charging_profile_log
  DROP CONSTRAINT charging_profile_log_limit_w_nonnegative_check;

ALTER TABLE charging_profile_log
  ADD CONSTRAINT charging_profile_log_limit_w_check CHECK (limit_w > 0);
