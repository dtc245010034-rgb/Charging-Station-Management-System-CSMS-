# CSMS Backend

Backend PostgreSQL cho hệ thống quản lý trạm sạc, phục vụ frontend từ thư mục `frontend/` (cùng origin, không build): JWT + httpOnly cookie, RBAC với 5 role, khóa tài khoản sau 5 lần sai, giới hạn đăng nhập theo IP và WebSocket OCPP 1.6J (xác thực trụ, BootNotification, Heartbeat, rate limiting, keepalive ping).

**Cách chạy, cấu hình `.env`, tạo tài khoản, kiểm thử:** xem `README.md` ở thư mục gốc. **Build, dừng, khởi động lại, sao lưu, staging:** xem `docs/OPERATIONS.md`. Tài liệu này chỉ mô tả sâu API, bảo mật và các lưu ý riêng của backend.

## Lệnh npm (trong `backend/`)

> **Điều kiện để chạy các lệnh này trực tiếp trên máy (không qua Docker):** có Postgres đang chạy và file `backend/.env` (sao từ `backend/.env.example`, điền `DATABASE_URL`, `JWT_SECRET` ≥ 32 ký tự, `APP_ORIGIN`). `.env` ở thư mục gốc là của Docker Compose và **không** được backend đọc: đó là hai file độc lập, vì `DATABASE_URL` chỉ có ở `backend/.env`. Thiếu file này sẽ báo `Cấu hình môi trường không hợp lệ hoặc thiếu: DATABASE_URL, …`. Cách nhanh nhất và là cách chuẩn của nhóm: `python run.py` và `python test.py` (Node 22 trong container, không phụ thuộc Node trên máy).

| Lệnh | Việc |
|---|---|
| `npm start` / `npm run dev` | Chạy app (`dev` tự khởi động lại khi sửa code); tự migrate trước khi mở cổng |
| `npm run migrate` / `migrate:down` | Áp migration còn thiếu / lùi một migration cuối |
| `npm run create-admin` | Tạo Quản trị đầu tiên (`ADMIN_EMAIL`, `ADMIN_PASSWORD` ≥ 12 ký tự); chạy lại không tạo trùng |
| `npm run seed-demo` | Dữ liệu demo (cần `ALLOW_DEMO_SEED=1`, `DEMO_PASSWORD`); chỉ cho demo/staging |
| `npm run start:staging` | Chuỗi khởi động staging: migrate → create-admin → (seed demo nếu bật) → server |
| `npm run lint` / `npm test` | ESLint cho `backend` + `frontend`; 200+ test (cần Postgres test ở cổng 5433 hoặc `TEST_DATABASE_URL`) |

## Lưu ý khi migrate trên DB dev đã có dữ liệu cũ

- **Baseline (một lần, Sprint 1):** migration đã được gộp thành `001_baseline`. Mọi thành viên có DB cũ phải chạy `docker compose down -v` để xoá volume rồi khởi động lại.
- **`003_stations_owner` (S-03):** `stations.owner_id` là `NOT NULL`, nên DB dev đã có trạm sẽ báo lỗi khi `migrate`. Chạy lại `docker compose down -v` một lần (dữ liệu dev không có chủ nên không thể tự gán). DB mới hoàn toàn thì không cần.
- **`004_station_management`:** chuẩn hóa độ chính xác/range tọa độ, đặt mặc định trạm mới là `INACTIVE`, tạo index tọa độ và bảng idempotency. Nếu DB đã có tọa độ ngoài dải `[-90, 90]` / `[-180, 180]`, cần sửa dữ liệu đó trước khi migrate.
- **`005_charge_point_code_upper`:** chuẩn hoá `charge_points.code` về chữ hoa. Nếu DB đã có 2 mã trụ chỉ khác hoa/thường (ví dụ `CP-1` và `cp-1`), migration dừng lại và báo lỗi — phải tự đổi 1 trong 2 mã trước khi chạy lại.

Rollback migration cuối: `npm run migrate:down` (hoặc `docker compose exec app npm run migrate:down`).

## Đăng nhập và khoá tạm

Phiên là JWT trong cookie `httpOnly` (SameSite=Lax, Secure khi production); API không trả token trong body. Sai mật khẩu trả lỗi chung "Email hoặc mật khẩu không đúng", kể cả khi email không tồn tại.

- Sai 5 lần (trong cửa sổ 15 phút) với cùng một email → khoá 15 phút, lần đăng nhập tiếp theo trả 429 kể cả khi nhập đúng.
- Sai `LOGIN_IP_MAX_FAILURES` lần (mặc định 20) từ cùng một IP → khoá IP 15 phút.
- Bộ đếm lưu ở bảng `login_throttle` (khoá `email:<sha256>` / `ip:<ip>`), nên khởi động lại vẫn còn khoá. Đếm cả email không tồn tại để không lộ email nào có tài khoản.
- IP lấy từ `req.ip`. Chạy sau reverse proxy: đặt `TRUST_PROXY` (xem "Phân quyền và bảo mật request" bên dưới), nếu không mọi request bị tính chung một IP của proxy.

## API chính

- `POST /api/auth/register` (công khai, luôn tạo tài khoản DRIVER; gửi kèm `role` → 400), `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `POST /api/admin/users` (chỉ ADMIN): tạo tài khoản với bất kỳ vai trò nào trong 5 vai trò; không tự đăng nhập tài khoản mới
- `GET/POST /api/stations`, `GET/PATCH /api/stations/:id`
- `GET /api/charge-points`, `GET /api/charge-points/:id`, `GET /api/charge-points/check-code?code=...`
- `POST /api/stations/:stationId/charge-points` (nhận `connector_count` từ 1 đến 4; mặc định 4), `PATCH /api/charge-points/:id`
- `GET /api/roles` (chỉ ADMIN): danh sách vai trò, dùng cho form tạo tài khoản.
- `GET /api/health`: công khai, trả `ok`, dùng cho healthcheck Docker/Render và chỉ báo “hệ thống ổn định” trên giao diện.
- Giao diện (`frontend/`) dùng các API trên: Chủ trạm/Quản trị tạo–sửa trạm, chọn vị trí trên bản đồ, quản lý trụ/đầu nối, kiểm tra mã trụ; Vận hành xem danh sách và trạng thái; Quản trị tạo tài khoản. Danh sách `/api/stations` và `/api/charge-points` không kèm đầu nối (chỉ chi tiết `/:id` có).

OCPP `StatusNotification` cập nhật trạng thái nội bộ của đầu nối trong `connectors.status` (`AVAILABLE`, `OCCUPIED`, `RESERVED`, `ERROR`) và lưu nguyên trạng thái thiết bị trong `connectors.ocpp_status`. Trạng thái OCPP chưa được biết vẫn được lưu nguyên văn và xếp vào `ERROR`; `connectorId: 0` áp dụng cho trụ sạc nên không cập nhật đầu nối. Mã lỗi khác `NoError` được ghi nối thêm vào `connector_errors`, kèm mã lỗi nhà sản xuất và thời điểm; lịch sử được giữ nguyên khi trạng thái đầu nối thay đổi. Đầu nối chưa khai báo được bỏ qua kèm cảnh báo đã giới hạn tần suất theo trụ.

Tọa độ lưu bằng `NUMERIC(10,8)` / `NUMERIC(11,8)` và có giới hạn địa lý, **bắt buộc** khi tạo trạm. Trạm mới luôn `INACTIVE` (gửi `status` lúc tạo → 400); tọa độ của trạm `ACTIVE` chỉ sửa được sau khi chuyển trạm về `INACTIVE`. Index B-tree trên cặp tọa độ không thay thế spatial index; tìm trạm theo bán kính cần triển khai PostGIS/GIST trước khi làm S-47.

`POST /api/stations` **bắt buộc** header `Idempotency-Key` (8–128 ký tự, thiếu → 400). Cùng key và cùng payload sẽ replay kết quả cũ; dùng lại key với payload khác trả 409. Frontend tự gửi key cho thao tác tạo trạm.

`charge_points.code` luôn được chuẩn hoá về chữ hoa trước khi lưu (kể cả khi client gửi chữ thường), khớp cách `connection-registry.js` so khớp mã trụ ở WebSocket. `power_kw` phải là số không âm (chuỗi rác hoặc số âm → 400); `status` do hệ thống quản lý, client gửi → 400.

Không có API xóa tài khoản/trạm; hiện không triển khai soft delete. FK `stations.owner_id` dùng `ON DELETE RESTRICT` để bảo toàn dữ liệu sở hữu. Schema hiện cũng chưa có `charging_sessions`, do đó chưa thể chặn đổi mã dựa trên lịch sử phiên sạc thật — xem `docs/spikes/S-05-AC3-ghi-nhan-cho-PO.md`. Trạng thái kết nối OCPP hiện được đếm trong bộ nhớ của từng process và ngăn đổi mã khi socket đang mở; trạng thái này không bền qua restart và chưa dùng được an toàn khi chạy nhiều replica.

## Phân quyền và bảo mật request

- Mọi route khai báo qua `secureRouter()` với `{ access }`; ma trận quyền nằm duy nhất ở `src/security/permissions.js`. Route thiếu `access` bị từ chối 403 (kể cả ADMIN) và có cảnh báo khi khởi động. ESLint cấm `express.Router()` trực tiếp trong `src/modules/`.
- Chống CSRF: request POST/PUT/PATCH/DELETE tới `/api` phải là `application/json` (415 nếu không) và nếu trình duyệt gửi `Origin` thì phải nằm trong `APP_ORIGIN` (403). Client không phải trình duyệt (curl) thường không có `Origin` nên vẫn qua. Nếu đổi cổng/địa chỉ truy cập (ví dụ `APP_PORT`), đặt `APP_ORIGIN` khớp.
- Phiên chỉ nhận qua cookie httpOnly, không nhận `Authorization: Bearer`.
- `TRUST_PROXY` = số reverse proxy tin cậy (mặc định 0, tức không tin `X-Forwarded-For`). Khi > 0, IP khách lấy từ `X-Forwarded-For` để khoá đăng nhập theo IP đúng — cần đặt khi chạy sau Nginx/Load Balancer, nếu không toàn bộ khách sẽ bị gộp chung IP của proxy.
- Cần Node.js >= 22.7 (`engine-strict`, ứng dụng thoát với thông báo rõ nếu thấp hơn).

## Kiểm thử

Chi tiết đầy đủ (cách chạy khi chưa có Node 22.7, chạy 1 file, đọc kết quả): xem `README.md` mục 3.

Vài điểm riêng của backend:

- Test chỉ chạy trên database có tên kết thúc bằng `_test` (đặt `TEST_DATABASE_URL` nếu dùng DB khác) — chặn cứng để không lỡ xoá nhầm DB dev.
- Cấu trúc mã: `src/app.js` (Express app), `src/server.js` (listen + WebSocket), `src/modules/<domain>/` (routes → service → repository), `src/db/`, `src/lib/`, `src/middlewares/`.
- Migration đầu tiên nằm tại `migrations/001_baseline.sql`, rollback tại `migrations/001_baseline.down.sql`. Đây là mẫu quy ước cho các migration sau: tên `snake_case`, khóa chính `id`, và cột `created_at`/`updated_at`.
- `charge_points.code` có UNIQUE trực tiếp trong PostgreSQL (trên giá trị đã chuẩn hoá chữ hoa); duplicate race được trả về 409. Mỗi trụ tạo số connector theo `connector_count` với trạng thái `UNKNOWN`.
- WebSocket OCPP tại `ws://localhost:3000/ocpp/:chargePointCode` xác thực mã trụ đã đăng ký và subprotocol `ocpp1.6`. Module frame thuần đọc/ghi `CALL`, `CALLRESULT`, `CALLERROR`; dispatcher giữ nguyên `messageId`, trả `NotImplemented` cho action chưa đăng ký, và không đóng kết nối khi frame sai. `BootNotification` kiểm tra trạng thái trạm (từ chối nếu trạm không ACTIVE hoặc bị khoá) và lưu thông tin `serial_number`, `vendor`, `model`, `firmware_version` vào DB; `Heartbeat` cập nhật `last_seen_at` cho mọi tin nhắn hợp lệ; `StatusNotification` và `Authorize` hiện vẫn là handler tạm thời. Bản ghi phiên sạc đầy đủ, kết quả các kịch bản và danh sách trường cần lưu (theo schema OCPP 1.6 chính thức): `docs/spikes/K-01-ocpp-simulator.md`.
- Mã trụ ảo và máy chủ tham chiếu để thử: `docs/spikes/k01/` (không thuộc backend, không lint/test cùng backend).
