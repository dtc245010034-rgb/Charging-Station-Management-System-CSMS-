# CSMS Backend

Yêu cầu Node.js `22.5+` và PostgreSQL 14+ (hoặc Docker Compose).

MVP backend cho hệ thống quản lý trạm sạc: JWT/RBAC, SQLite, quản lý trạm/trụ/connector, phiên sạc, meter values, biểu giá, thanh toán, bảo trì, dashboard, đối soát, audit log và WebSocket OCPP-style.

## Chạy bằng Docker Compose

Từ thư mục gốc project:

```powershell
docker compose up --build
```

Ứng dụng chạy tại `http://localhost:3000`, PostgreSQL chạy tại `localhost:5432`. Container app tự chạy migration trước khi mở cổng.

Rollback migration cuối:

```powershell
docker compose exec app npm run migrate:down
```

## Chạy local trên Windows

```powershell
cd backend
npm install
copy .env.example .env
npm run migrate
npm run dev
```

API chạy tại `http://localhost:3000`. Kiểm tra bằng `GET /api/health`.

Tài khoản mặc định được tạo khi database khởi tạo:

- Email: `admin@csms.vn`
- Password: `admin123456`
- Role: `ADMIN`

Gửi JWT nhận từ `/api/auth/login` trong header `Authorization: Bearer <token>` cho các API cần đăng nhập.

## API chính

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET/POST /api/stations`, `GET/PATCH /api/stations/:id`
- `GET /api/charge-points`, `GET /api/charge-points/:id`
- `POST /api/stations/:stationId/charge-points`, `PATCH /api/charge-points/:id`
- `GET /api/sessions`, `POST /api/sessions/start`, `POST /api/sessions/:id/meter-values`, `POST /api/sessions/:id/stop`
- `GET/POST /api/tariffs`, `GET/POST /api/payments`
- `GET/POST /api/maintenance`, `GET /api/dashboard`, `GET /api/reconciliation`, `GET /api/audit-logs`

Migration đầu tiên nằm tại `migrations/001_initial_schema.sql`, rollback tại `migrations/001_initial_schema.down.sql`. Đây là mẫu quy ước cho các migration sau: tên `snake_case`, khóa chính `id`, và cột `created_at`/`updated_at`.

`charge_points.code` có UNIQUE trực tiếp trong PostgreSQL. Nếu trụ đã có phiên sạc, backend từ chối đổi mã. Mỗi trụ tự tạo connector 1-4 với trạng thái `UNKNOWN`.

WebSocket dùng OCPP-style MVP tại `ws://localhost:3000/ocpp/:chargePointCode`, hỗ trợ `BootNotification`, `Heartbeat`, `StatusNotification` và `Authorize`.
