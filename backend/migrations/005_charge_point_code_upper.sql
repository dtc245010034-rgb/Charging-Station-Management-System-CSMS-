-- Chuẩn hoá mã trụ về chữ hoa để khớp với connection-registry.js (WebSocket coi mã không phân biệt hoa/thường).
DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT upper(btrim(code)) AS normalized, array_agg(code ORDER BY code) AS codes
    FROM charge_points
    GROUP BY upper(btrim(code))
    HAVING count(*) > 1
  LOOP
    RAISE EXCEPTION 'Mã trụ trùng sau khi chuẩn hoá chữ hoa: % (mã hiện có: %)', dup.normalized, dup.codes;
  END LOOP;
END $$;

UPDATE charge_points SET code = upper(btrim(code)) WHERE code <> upper(btrim(code));

ALTER TABLE charge_points
  ADD CONSTRAINT charge_points_code_upper_check CHECK (code = upper(btrim(code)));
