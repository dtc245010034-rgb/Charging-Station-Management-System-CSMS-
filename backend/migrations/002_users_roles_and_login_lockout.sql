-- Add failed_attempts and locked_until columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_constraint_1;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN', 'MANAGER', 'OPERATOR', 'FINANCE', 'DRIVER', 'STATION_OWNER', 'ACCOUNTANT'));

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create user_roles junction table
CREATE TABLE IF NOT EXISTS user_roles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, role_id)
);

-- Seed exactly 5 roles: tài xế, chủ trạm, vận hành viên, kế toán, quản trị
INSERT INTO roles (code, name, description)
VALUES
  ('DRIVER', 'Tài xế', 'Người lái xe điện sử dụng dịch vụ sạc'),
  ('STATION_OWNER', 'Chủ trạm', 'Chủ sở hữu hoặc đối tác nhượng quyền trạm sạc'),
  ('OPERATOR', 'Vận hành viên', 'Nhân viên vận hành và giám sát trạm sạc trực tiếp'),
  ('ACCOUNTANT', 'Kế toán', 'Nhân viên kế toán và quản trị tài chính, biểu giá'),
  ('ADMIN', 'Quản trị', 'Quản trị viên toàn quyền hệ thống')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Map any existing admin users to ADMIN role in user_roles
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.code = 'ADMIN'
WHERE u.role = 'ADMIN'
ON CONFLICT (user_id, role_id) DO NOTHING;
