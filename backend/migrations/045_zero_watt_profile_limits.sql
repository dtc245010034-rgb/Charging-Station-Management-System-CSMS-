ALTER TABLE charging_profile_log
  DROP CONSTRAINT charging_profile_log_limit_w_check;

ALTER TABLE charging_profile_log
  ADD CONSTRAINT charging_profile_log_limit_w_nonnegative_check CHECK (limit_w >= 0);
