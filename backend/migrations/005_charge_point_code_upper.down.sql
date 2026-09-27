-- Chỉ gỡ CHECK. Không thể khôi phục chữ hoa/thường gốc của mã đã bị UPDATE ở bản tiến.
ALTER TABLE charge_points DROP CONSTRAINT charge_points_code_upper_check;
