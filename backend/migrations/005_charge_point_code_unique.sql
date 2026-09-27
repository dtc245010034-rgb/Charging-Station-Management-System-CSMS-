UPDATE charge_points
SET code = UPPER(TRIM(code))
WHERE code IS NOT NULL AND code <> UPPER(TRIM(code));

CREATE UNIQUE INDEX IF NOT EXISTS charge_points_code_normalized_key
ON charge_points (UPPER(TRIM(code)));
