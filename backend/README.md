# CSMS Backend

Yêu cầu Node.js `22.5+` và PostgreSQL 14+ (hoặc Docker Compose).

Backend PostgreSQL cho hệ thống quản lý trạm sạc, phục vụ frontend từ thư mục `frontend/` (cùng origin): JWT + httpOnly cookie, RBAC với 5 role, khóa tài khoản sau 5 lần sai, giới hạn đăng nhập theo IP và WebSocket OCPP-style.

## Chạy bằng Docker Compose

Tạo file `.env` ở thư mục gốc project với `POSTGRES_PASSWORD` và `JWT_SECRET` (≥ 32 ký tự, ví dụ `openssl rand -hex 32`), rồi:

```powershell
docker compose up --build
```

**Baseline reset (một lần, Sprint 1):** migration đã được gộp thành `001_baseline`. Mọi thành viên có DB cũ phải chạy `docker compose down -v` để xoá volume rồi khởi động lại.

**Migration `003_stations_owner` (S-03):** `stations.owner_id` là `NOT NULL`, nên DB dev đã có trạm sẽ báo lỗi khi `migrate`. Chạy lại `docker compose down -v` một lần (dữ liệu dev không có chủ nên không thể tự gán). DB mới hoàn toàn thì không cần.

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

Không có tài khoản mặc định. Tạo admin đầu tiên (đặt `ADMIN_EMAIL`, `ADMIN_PASSWORD` ≥ 12 ký tự trong `.env`):

```powershell
npm run create-admin
```

Các biến `DATABASE_URL`, `JWT_SECRET` (≥ 32 ký tự), `APP_ORIGIN` là bắt buộc; thiếu biến nào ứng dụng thoát ngay và in tên biến đó.

## Đăng nhập và khoá tạm

Phiên là JWT trong cookie `httpOnly` (SameSite=Lax, Secure khi production); API không trả token trong body. Sai mật khẩu trả lỗi chung "Email hoặc mật khẩu không đúng", kể cả khi email không tồn tại.

- Sai 5 lần (trong cửa sổ 15 phút) với cùng một email → khoá 15 phút, lần đăng nhập tiếp theo trả 429 kể cả khi nhập đúng.
- Sai `LOGIN_IP_MAX_FAILURES` lần (mặc định 20) từ cùng một IP → khoá IP 15 phút.
- Bộ đếm lưu ở bảng `login_throttle` (khoá `email:<sha256>` / `ip:<ip>`), nên khởi động lại vẫn còn khoá. Đếm cả email không tồn tại để không lộ email nào có tài khoản.
- IP lấy từ `req.ip`; nếu chạy sau reverse proxy cần cấu hình `trust proxy` (chưa có).

## API chính

- `POST /api/auth/register` (công khai, luôn tạo tài khoản DRIVER; gửi kèm `role` → 400), `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `POST /api/admin/users` (chỉ ADMIN): tạo tài khoản với bất kỳ vai trò nào trong 5 vai trò; không tự đăng nhập tài khoản mới
- `GET/POST /api/stations`, `GET/PATCH /api/stations/:id`
- `GET /api/charge-points`, `GET /api/charge-points/:id`
- `POST /api/stations/:stationId/charge-points`, `PATCH /api/charge-points/:id`
- Frontend hiện dùng trực tiếp các route auth ở trên; các route trạm và trụ sạc sẵn sàng cho dashboard mở rộng.

## Phân quyền và bảo mật request

- Mọi route khai báo qua `secureRouter()` với `{ access }`; ma trận quyền nằm duy nhất ở `src/security/permissions.js`. Route thiếu `access` bị từ chối 403 (kể cả ADMIN) và có cảnh báo khi khởi động. ESLint cấm `express.Router()` trực tiếp trong `src/modules/`.
- Chống CSRF: request POST/PUT/PATCH/DELETE tới `/api` phải là `application/json` (415 nếu không) và nếu trình duyệt gửi `Origin` thì phải nằm trong `APP_ORIGIN` (403). Client không phải trình duyệt (curl) thường không có `Origin` nên vẫn qua. Nếu đổi cổng/địa chỉ truy cập (ví dụ `APP_PORT`), đặt `APP_ORIGIN` khớp.
- Phiên chỉ nhận qua cookie httpOnly, không nhận `Authorization: Bearer`.
- `TRUST_PROXY` = số reverse proxy tin cậy (mặc định 0). Khi > 0, IP khách lấy từ `X-Forwarded-For` để khoá đăng nhập theo IP đúng.
- Cần Node.js >= 22.7 (`engine-strict`, ứng dụng thoát với thông báo rõ nếu thấp hơn).

## Kiểm thử

```powershell
docker compose up -d db_test   # Postgres test, cổng 5433, dữ liệu trong RAM
cd backend
npm run lint                    # ESLint cho backend/ và frontend/js (config ở thư mục gốc)
npm test                        # cần Node 22; mỗi test tự dựng lại schema trên DB *_test
```

Test chỉ chạy trên database có tên kết thúc bằng `_test` (đặt `TEST_DATABASE_URL` nếu dùng DB khác).

Cấu trúc mã: `src/app.js` (Express app), `src/server.js` (listen + WebSocket), `src/modules/<domain>/` (routes → service → repository), `src/db/`, `src/lib/`, `src/middlewares/`.

Migration đầu tiên nằm tại `migrations/001_baseline.sql`, rollback tại `migrations/001_baseline.down.sql`. Đây là mẫu quy ước cho các migration sau: tên `snake_case`, khóa chính `id`, và cột `created_at`/`updated_at`.

`charge_points.code` có UNIQUE trực tiếp trong PostgreSQL. Nếu trụ đã có phiên sạc, backend từ chối đổi mã. Mỗi trụ tự tạo connector 1-4 với trạng thái `UNKNOWN`.

WebSocket dùng OCPP-style MVP tại `ws://localhost:3000/ocpp/:chargePointCode`, hỗ trợ `BootNotification`, `Heartbeat`, `StatusNotification` và `Authorize`.
