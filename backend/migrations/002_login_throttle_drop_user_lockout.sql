-- Khoá đăng nhập chuyển sang bảng login_throttle (theo email và IP), bỏ cột trên users.
ALTER TABLE users DROP COLUMN failed_attempts;
ALTER TABLE users DROP COLUMN locked_until;
