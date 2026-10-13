DROP TRIGGER IF EXISTS tariff_periods_no_truncate ON tariff_periods;
DROP TRIGGER IF EXISTS tariff_periods_append_only ON tariff_periods;
DROP TRIGGER IF EXISTS tariffs_no_truncate ON tariffs;
DROP TRIGGER IF EXISTS tariffs_append_only ON tariffs;
DROP FUNCTION IF EXISTS reject_tariffs_mutation();
DROP TABLE IF EXISTS tariff_periods;
DROP TABLE IF EXISTS tariffs;
