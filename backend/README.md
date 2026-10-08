# CSMS Backend

Backend PostgreSQL cho hệ thống quản lý trạm sạc, phục vụ frontend từ thư mục `frontend/` (cùng origin, không build): JWT + httpOnly cookie, RBAC với 5 role, khóa tài khoản sau 5 lần sai, giới hạn đăng nhập theo IP, trạng thái trụ thời gian thực (REST + SSE) và WebSocket OCPP 1.6J (xác thực mã trụ, BootNotification, Heartbeat, StatusNotification, thay thế kết nối trùng, rate limiting, keepalive ping, tắt máy sạch).

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
| `npm run lint` / `npm test` | ESLint cho `backend` + `frontend`; 280 test (cần Postgres test ở cổng 5433 hoặc `TEST_DATABASE_URL`; T-19 cần Docker; hai test N4 bỏ qua trên Windows) |

## Lưu ý khi migrate trên DB dev đã có dữ liệu cũ

- **Baseline (một lần, Sprint 1):** migration đã được gộp thành `001_baseline`. Mọi thành viên có DB cũ phải chạy `docker compose down -v` để xoá volume rồi khởi động lại.
- **`003_stations_owner` (S-03):** `stations.owner_id` là `NOT NULL`, nên DB dev đã có trạm sẽ báo lỗi khi `migrate`. Chạy lại `docker compose down -v` một lần (dữ liệu dev không có chủ nên không thể tự gán). DB mới hoàn toàn thì không cần.
- **`004_station_management`:** chuẩn hóa độ chính xác/range tọa độ, đặt mặc định trạm mới là `INACTIVE`, tạo index tọa độ và bảng idempotency. Nếu DB đã có tọa độ ngoài dải `[-90, 90]` / `[-180, 180]`, cần sửa dữ liệu đó trước khi migrate.
- **`006`–`012` (OCPP):** thêm dần thông tin Boot (006, 008), `heartbeat_interval` (007), `last_seen_at` (009), `connectors.ocpp_status` (010), bảng `connector_errors` (011) và chỉ mục khử trùng lỗi (012). Đều có `.down.sql`; đã kiểm lên → xuống tới 009 → lên lại trên DB rỗng và DB seed-demo (vòng 6).
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
- `PATCH /api/admin/stations/:id/lock` (ADMIN): khoá/mở khoá trạm (`{ "locked": true|false }`). Khoá thì mọi trụ của trạm bị đóng kết nối (mã 1008, `terminate` sau 1–2 giây nếu trụ treo), trụ và đầu nối về `UNKNOWN`, và `BootNotification` kế tiếp bị `Rejected`.
- `GET/POST /api/stations`, `GET/PATCH /api/stations/:id`
- `GET /api/charge-points`, `GET /api/charge-points/:id`, `GET /api/charge-points/check-code?code=...`
- `POST /api/stations/:stationId/charge-points` (nhận `connector_count` từ 1 đến 4; mặc định 4), `PATCH /api/charge-points/:id`
- `POST /api/charge-points/:id/reset` (ADMIN, OPERATOR; S-16): body `{ "type": "Soft" | "Hard" }`, gửi `Reset` xuống trụ và chờ trả lời tối đa `OCPP_COMMAND_TIMEOUT_SECONDS` (mặc định 30 giây). Trụ `Accepted` → 200 `{ "status": "Accepted" }`; trụ không có kết nối → 409 ngay, không gửi lệnh; trụ trả `Rejected` hoặc `CALLERROR` → 422 `CHARGE_POINT_REJECTED`; hết thời gian → 504 `OCPP_CALL_TIMEOUT`. Người bấm được ghi vào log ứng dụng (chưa ghi `audit_logs`).
- `GET /api/fleet-status` (operator/admin: toàn bộ; chủ trạm: chỉ trạm của mình): một truy vấn trả cây trạm → trụ → đầu nối cùng `last_seen_at` và cờ `offline` (trạng thái OFFLINE đã lưu hoặc liên lạc quá 2 × `heartbeat_interval`; thời gian được so sánh bằng `CURRENT_TIMESTAMP` của PostgreSQL). Job nền quét mỗi phút và chuyển trụ `ONLINE` quá hạn sang `OFFLINE`; heartbeat tiếp theo cập nhật lại thời điểm nhận và khôi phục `ONLINE`. `GET /api/fleet-status/events` (cùng quyền) phát SSE khi trạng thái đầu nối đổi; chủ trạm chỉ nhận sự kiện trạm của mình.
- `GET /api/roles` (chỉ ADMIN): danh sách vai trò, dùng cho form tạo tài khoản.
- `GET /api/health`: công khai, trả `ok`, dùng cho healthcheck Docker/Render và chỉ báo “hệ thống ổn định” trên giao diện.
- Giao diện (`frontend/`) dùng các API trên: Chủ trạm/Quản trị tạo–sửa trạm, chọn vị trí trên bản đồ, quản lý trụ/đầu nối, kiểm tra mã trụ; Vận hành xem danh sách và trạng thái; Quản trị tạo tài khoản. Danh sách `/api/stations` và `/api/charge-points` không kèm đầu nối (chỉ chi tiết `/:id` có).

**`StatusNotification` (S-10)** cập nhật trạng thái nội bộ của đầu nối trong `connectors.status` và lưu nguyên trạng thái thiết bị trong `connectors.ocpp_status`:

| OCPP | `connectors.status` |
|---|---|
| `Available` | `AVAILABLE` |
| `Preparing`, `Charging`, `SuspendedEV`, `SuspendedEVSE`, `Finishing` | `OCCUPIED` |
| `Reserved` | `RESERVED` |
| `Unavailable` (tạm ngừng khai thác, không phải sự cố) | `UNAVAILABLE` |
| `Faulted` và trạng thái OCPP lạ (lưu nguyên văn, cảnh báo có gom) | `ERROR` |

- Giới hạn đầu vào: `status`, `errorCode`, `vendorErrorCode`, `info`, `vendorId` tối đa 50 ký tự (dài hơn → `PropertyConstraintViolation`). `errorCode` ngoài 16 mã OCPP 1.6 nhưng ≤ 50 ký tự được lưu `OtherError`, mã gốc giữ ở `vendor_error_code`.
- Mã lỗi khác `NoError` được ghi nối thêm vào `connector_errors` (kèm mã nhà sản xuất, thời điểm). **Khử trùng:** không chèn nếu cùng (đầu nối, `error_code`, `vendor_error_code`) đã có dòng trong `OCPP_ERROR_DEDUP_SECONDS` giây (mặc định 60; `0` = tắt) và trạng thái không đổi; chuyển `Faulted` → `Available` → `Faulted` vẫn ghi dòng mới.
- Đầu nối chưa khai báo bị bỏ qua kèm cảnh báo có gom theo trụ. `connectorId = 0` (cả trụ) trả `{}` và ghi một dòng log gom, **chưa lưu DB** (F5, chờ thiết kế).
- Khi trụ mất kết nối, bị khoá hoặc bị dọn lúc khởi động: `charge_points.status = UNKNOWN` và mọi đầu nối `UNKNOWN` (giữ `ocpp_status` làm "trạng thái cuối biết được"). `BootNotification` kế tiếp thiếu `chargePointSerialNumber`/`firmwareVersion` thì giữ giá trị đã lưu (N8).
- Mỗi lần trạng thái đầu nối đổi, server phát sự kiện tới `GET /api/fleet-status/events` (SSE).

`Authorize` vẫn là stub (S-15); `Heartbeat` được đăng ký trực tiếp trong `src/server.js`. Tắt máy bằng `SIGTERM`/`SIGINT` đóng kết nối OCPP bằng mã 1001, ghi `UNKNOWN`, đóng HTTP server và pool rồi thoát mã 0 (N4); khởi động lại dọn mọi trụ `ONLINE` mồ côi, chỉ đúng khi chạy một tiến trình server.

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
- Smoke test staging cho luồng trụ ảo offline/reconnect (3 lượt liên tiếp, chu kỳ 5 giây): đặt `STAGING_BASE_URL`, `CHARGE_POINT_CODE` (trụ ảo chuyên dùng, có connector 1), `TEST_USER_EMAIL` và `TEST_USER_PASSWORD`, rồi chạy từ thư mục gốc `node tools/test-ocpp-offline-reconnect-live.js`. Tài khoản cần đọc được trụ trong fleet-status; dịch vụ staging cần trả `interval: 5` trong BootNotificationResponse. Test không tạo hoặc xoá dữ liệu.
- Cấu trúc mã: `src/app.js` (Express app), `src/server.js` (listen + WebSocket), `src/modules/<domain>/` (routes → service → repository), `src/db/`, `src/lib/`, `src/middlewares/`.
- Migration đầu tiên nằm tại `migrations/001_baseline.sql`, rollback tại `migrations/001_baseline.down.sql`. Đây là mẫu quy ước cho các migration sau: tên `snake_case`, khóa chính `id`, và cột `created_at`/`updated_at`.
- `charge_points.code` có UNIQUE trực tiếp trong PostgreSQL (trên giá trị đã chuẩn hoá chữ hoa); duplicate race được trả về 409. Mỗi trụ tạo số connector theo `connector_count` với trạng thái `UNKNOWN`.
- WebSocket OCPP tại `ws://localhost:3000/ocpp/:chargePointCode` xác thực mã trụ đã đăng ký và subprotocol `ocpp1.6`. Module frame thuần đọc/ghi `CALL`, `CALLRESULT`, `CALLERROR`; dispatcher giữ nguyên `messageId`, trả `NotImplemented` cho action chưa đăng ký, và không đóng kết nối khi frame sai. `BootNotification` kiểm tra trạng thái trạm (từ chối nếu trạm không ACTIVE hoặc bị khoá) và lưu thông tin `serial_number`, `vendor`, `model`, `firmware_version` vào DB; `Heartbeat` cập nhật `last_seen_at` cho mọi tin nhắn hợp lệ; `StatusNotification` là handler thật (xem trên); `MeterValues` ghi đồng bộ bằng một câu `INSERT` nhiều dòng rồi mới trả lời; số đo không khớp phiên được lưu vào `orphan_messages`; `Authorize` hiện vẫn là handler tạm thời. Bản ghi phiên sạc đầy đủ, kết quả các kịch bản và danh sách trường cần lưu (theo schema OCPP 1.6 chính thức): `docs/spikes/K-01-ocpp-simulator.md`.
- Mã trụ ảo và máy chủ tham chiếu để thử: `docs/spikes/k01/` (không thuộc backend, không lint/test cùng backend).
