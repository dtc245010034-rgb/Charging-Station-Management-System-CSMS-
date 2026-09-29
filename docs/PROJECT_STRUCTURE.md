# Project Structure

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Người thực hiện**: TESTER / QA ANALYST  
> **Snapshot Date**: 29/09/2026  
> **Git Commit**: `ba61aeaee0f061e1409913cd5c1ea8c5d84e5f98` (nhánh `main`)  
> **Structure Status**: **VERIFIED**  
> **Entry Point / Router**: [`docs/README.md`](./README.md)  
> **Bộ quy chuẩn trung tâm**: [`docs/TESTER_STANDARD.md`](./TESTER_STANDARD.md)  
> **Chỉ mục kiểm thử**: [`docs/TEST_INVENTORY.md`](./TEST_INVENTORY.md)  
> **Khung kiểm toán an ninh**: [`docs/Audit/`](./Audit/README.md)  

---

## 0. Cập nhật cấu trúc 28/09/2026 (frontend thiết kế lại, staging, demo, K-01)

> **Quan trọng cho QA:** các dòng truy vết ở mục 7, 9, 10, 11 và các hồ sơ `stories/`, `integration/`, `testing/` được xác minh **trước** đợt này nên vẫn ghi đường dẫn cũ `frontend/js/*` và `frontend/pages/*.html`. Đó là bằng chứng lịch sử đúng tại commit đã ghi, **không sửa**. Dùng bảng dưới để tra sang đường dẫn hiện tại; các test cũ liên quan đã được cập nhật theo đường dẫn mới (138/138 pass, lint sạch) nhưng **chưa được QA xác minh lại từng ca**.

| Đường dẫn cũ (đến 27/09) | Đường dẫn hiện tại | Ghi chú |
|---|---|---|
| `frontend/js/api.js` | `frontend/services/api.js` | Không đổi hành vi: cùng origin, `credentials: include`, `ApiError` |
| `frontend/js/auth.js` | `frontend/app/auth.js` | Thêm `toSessionUser` (danh sách `roles`) |
| `frontend/js/router.js` (`homePathFor`) | `frontend/app/workspace.js` (`homePathFor`) + `frontend/app/router.js` (`parseHash`, nạp trang) | Trang chủ theo vai trò nay là `/app.html#/<workspace>/overview` |
| `frontend/js/validate.js` | `frontend/app/validate.js` | Không đổi |
| `frontend/js/theme.js` | `frontend/app/theme.js` + `theme-boot.js` | `localStorage` chỉ còn ở hai file này |
| `frontend/js/pages/login.js`, `frontend/index.html` | `frontend/pages/auth/login.js`, `frontend/index.html` | Bỏ số liệu giả, nút “Ghi nhớ/Quên mật khẩu” |
| `frontend/js/pages/dashboard.js`, `frontend/pages/{admin,operator,accountant,driver}.html` | `frontend/main.js` + `frontend/app.html` + `frontend/pages/<vai trò>/` | Một vỏ ứng dụng cho mọi vai trò |
| `frontend/pages/station-owner.html`, `frontend/js/pages/station-owner.js` | `frontend/pages/shared/{stations,station-drawer,station-form,charge-points}.js` | Cùng chức năng S-04/S-05, dùng chung cho Chủ trạm/Quản trị/Vận hành |
| `frontend/styles.css` | `frontend/styles/{tokens,themes,reset,layout,components}.css` | Có token sáng/tối |
| Leaflet từ CDN unpkg | `frontend/vendor/leaflet/` | Không còn tài nguyên ngoài (Google Fonts, CDN) |

Thêm mới: `render.yaml`, `backend/scripts/seed-demo.js`, `backend/tests/integration/seed-demo.test.js`, `backend/tests/unit/frontend-permissions.test.js`, `docs/OPERATIONS.md`, `docs/SPRINT_STATUS.md`, `docs/design/`, `docs/spikes/k01/`. `docs/spikes/k01-simulator.js` và `k01-session-log.json` là bản K-01 cũ (27/9), đã được `docs/spikes/k01/` thay thế.

---

## 1. Mục đích của tài liệu

Tài liệu này là **VERIFIED PROJECT MAP** (Bản đồ dự án đã qua xác minh thực tế) dành riêng cho AI Tester / QA Analyst:
- Cung cấp cái nhìn toàn diện, chuẩn xác và tức thì về cấu trúc thư mục, tệp tin và các thành phần mã nguồn của dự án CSMS sau đợt nâng cấp tái cấu trúc lớn (Sprint 1 & Sprint 2 meta).
- Xác định quyền sở hữu tài nguyên và ranh giới kiểm thử: Tester toàn quyền quản trị phân vùng `docs/` và đọc-kiểm tra (read-only) toàn bộ các thành phần khác.
- Thiết lập hệ thống ánh xạ truy vết hai chiều (Bidirectional Traceability) giữa Yêu cầu (Story/Task/AC/NFR) $\longleftrightarrow$ Mã nguồn hiện thực (Source Components) $\longleftrightarrow$ Bộ kiểm thử tự động của Dev (138 tests / 29 suites) $\longleftrightarrow$ Hồ sơ kiểm thử & Kiểm toán an ninh của QA.
- Làm cơ sở thực thi nguyên tắc **NO-REDISCOVERY**: Trong các tác vụ Tester tiếp theo, AI Tester trực tiếp tra cứu vị trí cần kiểm thử từ bản đồ này mà không phải quét lại toàn bộ mã nguồn hoặc hỏi lại người dùng.

---

## 2. Structure Authority (Thẩm quyền cấu trúc)

1. **Filesystem thực tế là Nguồn Sự Thật Tối Thượng (Source of Truth)**:
   - Cấu trúc thư mục, tệp tin hiện hữu trên ổ đĩa và hành vi mã nguồn thực tế tại commit snapshot hiện tại (`ba61aea`) là căn cứ pháp lý cao nhất về cấu trúc dự án.
2. **PROJECT_STRUCTURE.md là Bản Đồ Đã Xác Minh (Verified Map)**:
   - Tài liệu này là sự phản ánh có cấu trúc của filesystem thực tế nhằm hỗ trợ công tác QA. Tài liệu không thay thế filesystem.
3. **Quy tắc giải quyết xung đột (Conflict Resolution)**:
   - Khi phát hiện có sự sai lệch giữa `PROJECT_STRUCTURE.md` và filesystem thực tế: **Luôn ưu tiên dữ liệu từ filesystem thực tế**, tiến hành phân tích công năng thực tế của tệp, sau đó cập nhật đồng bộ lại vào `PROJECT_STRUCTURE.md`.

---

## 3. Tester Ownership (Quyền sở hữu của Tester)

| Khu vực tài nguyên | Phạm vi quyền hạn của Tester | Ghi chú vận hành |
|:---|:---:|:---|
| **`docs/`** | **CREATE / EDIT / DELETE**<br>(Toàn quyền quản trị) | Khu vực duy nhất Tester được phép tạo mới, chỉnh sửa, cập nhật tài liệu kiểm thử, quy chuẩn, inventory, stories, integration, audit và report. |
| **`backend/`** | **READ-ONLY**<br>(Chỉ đọc & Phân tích) | Tuyệt đối không sửa source code, business logic, controller, service, middleware, schema hay test code của Developer. |
| **`frontend/`** | **READ-ONLY**<br>(Chỉ đọc & Phân tích) | Tuyệt đối không sửa đổi HTML, CSS, client scripts JS (`app/`, `components/`, `services/`, `pages/`). |
| **`database / migrations`** | **READ-ONLY**<br>(Chỉ kiểm tra DDL & Chạy test) | Tuyệt đối không sửa file SQL migration. Chỉ thực thi migration runner trên DB test để nghiệm thu. |
| **`Docker / Configuration`** | **READ-ONLY**<br>(Chỉ đọc để kiểm chứng NFR) | Tuyệt đối không sửa `docker-compose.yml`, `Dockerfile`, `render.yaml`, `.env.example`, `package.json`, `eslint.config.js`. |
| **`Session Cookies (*.cookie)`** | **READ-ONLY**<br>(Chỉ nạp phiên kiểm thử) | Tệp tạm sinh ra khi chạy live test curl xác thực (được .gitignore loại trừ, không lưu trong repo git). |
| **`Git History & CI/CD`** | **READ-ONLY**<br>(Tuyệt đối không can thiệp) | Không commit, không push, không checkout/switch branch, không sửa đổi workflow `.github/`. |

---

## 4. Verified Project Tree (Cây thư mục đã xác minh)

Toàn bộ cây thư mục thực tế của dự án `Charging-Station-Management-System-CSMS-` đã được quét và kiểm chứng chi tiết tại mốc snapshot 29/09/2026:

```text
Charging-Station-Management-System-CSMS-/
├── .dockerignore                                      # Danh sách file/thư mục loại trừ khi Docker build image
├── .gitignore                                         # Danh sách file/thư mục Git không theo dõi (node_modules, *.cookie, .env,...)
├── .github/                                           # Thư mục cấu hình GitHub (CI/CD workflows và PR templates)
│   ├── pull_request_template.md                       # Mẫu checklist tiêu chuẩn khi tạo Pull Request
│   └── workflows/                                     # Thư mục định nghĩa các pipeline tự động hóa GitHub Actions
│       └── ci.yml                                     # Pipeline CI tự động: lint, unit test, integration test, npm audit, build Docker
├── CONTRIBUTING.md                                    # Hướng dẫn đóng góp mã nguồn, quy chuẩn commit và quy trình Pull Request
├── docker-compose.yml                                 # Cấu hình khởi chạy cụm container (db:5432, db_test:5433, app:3000)
├── eslint.config.js                                   # Cấu hình kiểm tra cú pháp và quy chuẩn mã nguồn tĩnh (ESLint flat config)
├── README.md                                          # Tài liệu gốc dự án: giới thiệu, kiến trúc CSMS, hướng dẫn cài đặt, seed demo
├── render.yaml                                        # Blueprint triển khai dịch vụ Staging lên nền tảng đám mây Render.com
│
├── backend/                                           # Dịch vụ Backend API và WebSocket OCPP (Node.js / Express 5)
│   ├── .env.example                                   # Mẫu khai báo các biến môi trường chuẩn (PORT, DATABASE_URL, JWT_SECRET,...)
│   ├── .gitignore                                     # Quy tắc bỏ qua file riêng của backend (node_modules, coverage, .env,...)
│   ├── Dockerfile                                     # Chỉ dẫn build Docker image cho backend (node:22-bookworm-slim, USER node)
│   ├── package.json                                   # Khai báo dependency, scripts (start, test, migrate, seed-demo, lint)
│   ├── package-lock.json                              # Khóa phiên bản chi tiết các thư viện npm phụ thuộc
│   ├── README.md                                      # Tài liệu kỹ thuật chi tiết riêng của module Backend
│   ├── migrations/                                    # Thư mục chứa các file DDL SQL migration cơ sở dữ liệu PostgreSQL
│   │   ├── 001_baseline.sql                           # Khởi tạo schema ban đầu: users, roles, user_roles, stations, charge_points, connectors, audit_logs, login_throttle
│   │   ├── 001_baseline.down.sql                      # Rollback schema baseline (drop các bảng)
│   │   ├── 002_login_throttle_drop_user_lockout.sql   # Chuẩn hoá login_throttle chống brute-force và tách cột khỏi bảng users
│   │   ├── 002_login_throttle_drop_user_lockout.down.sql # Rollback migration bảng login_throttle
│   │   ├── 003_stations_owner.sql                     # Bổ sung quan hệ sở hữu trạm sạc cho Station Owner và cột IP audit_logs
│   │   ├── 003_stations_owner.down.sql                # Rollback quan hệ sở hữu trạm sạc
│   │   ├── 004_station_management.sql                 # Mở rộng trạm sạc (status, lat, lng số thực) và bảng idempotency_keys
│   │   ├── 004_station_management.down.sql            # Rollback migration quản lý trạm sạc
│   │   ├── 005_charge_point_code_upper.sql            # Chuẩn hóa mã trụ về chữ hoa và thêm CHECK constraint cho charge_points
│   ├── scripts/                                       # Script hỗ trợ vận hành và quản trị CLI
│   │   ├── create-admin.js                            # Script CLI khởi tạo tài khoản quản trị viên ADMIN (Argon2id)
│   │   └── seed-demo.js                               # Dữ liệu demo GYM-14 (6 tài khoản, 6 trạm, 12 trụ DEMO-*); cần ALLOW_DEMO_SEED=1
│   ├── src/                                           # Mã nguồn chính của ứng dụng backend
│   │   ├── app.js                                     # Khởi tạo Express app, gắn middlewares (CORS, requireJson, static), và routes
│   │   ├── server.js                                  # Bootstrap máy chủ HTTP & WebSocket Server OCPP 1.6 (/ocpp/:code)
│   │   ├── config/                                    # Nạp và xác thực cấu hình môi trường
│   │   │   ├── env.js                                 # Validate biến môi trường bằng Zod schema (fail-fast khi thiếu/sai)
│   │   │   └── nodeVersion.js                         # Kiểm tra phiên bản Node.js tối thiểu (>= 22.7.0)
│   │   ├── db/                                        # Tầng giao tiếp và quản trị cơ sở dữ liệu PostgreSQL
│   │   │   ├── migrate.js                             # Bộ chạy migration tự động đọc và thực thi các file SQL up/down
│   │   │   ├── pool.js                                # Quản lý kết nối PostgreSQL Connection Pool (pg.Pool) & hàm prepare (?)
│   │   │   ├── scope.js                               # Hàm scopeByOwner cô lập truy vấn theo quyền sở hữu của vai trò
│   │   │   └── tx.js                                  # Hàm tiện ích quản lý database transaction (BEGIN, COMMIT, ROLLBACK)
│   │   ├── lib/                                       # Thư viện dùng chung, tiện ích cốt lõi và định nghĩa enum
│   │   │   ├── errors.js                              # Định nghĩa các lớp lỗi tùy biến (AppError, UnauthorizedError, ForbiddenError,...)
│   │   │   ├── ownership.js                           # Tiện ích kiểm tra và xử lý quan hệ sở hữu dữ liệu (denyOrNotFound)
│   │   │   ├── password.js                            # Xử lý băm và kiểm tra mật khẩu bằng thuật toán Argon2id & dummyHash
│   │   │   ├── roles.js                               # Định nghĩa enum 5 vai trò (ADMIN, OPERATOR, STATION_OWNER, ACCOUNTANT, DRIVER)
│   │   │   └── schemas.js                             # Các schema Zod dùng chung để validate idParam, stationIdParam
│   │   ├── middlewares/                               # Các middleware xử lý trung gian của Express
│   │   │   ├── authenticate.js                        # Xác thực phiên người dùng từ cookie HttpOnly (JWT token) và bộ lọc allow()
│   │   │   ├── errorHandler.js                        # Bắt lỗi tập trung, định dạng JSON chuẩn cho client { error: { code, message } }
│   │   │   └── requireJson.js                         # Middleware chống CSRF: bắt buộc Content-Type JSON và kiểm tra Origin
│   │   ├── modules/                                   # Các module chức năng nghiệp vụ của hệ thống (Domain modules)
│   │   │   ├── audit/                                 # Module ghi nhận và quản lý nhật ký an ninh hệ thống
│   │   │   │   └── audit.repository.js                # Ghi nhận sự kiện vào audit_logs (CREATE, UPDATE, ACCESS_DENIED)
│   │   │   ├── auth/                                  # Module quản lý xác thực và phiên làm việc người dùng
│   │   │   │   ├── auth.routes.js                     # Endpoints /api/auth/register, /api/auth/login, /api/auth/logout, /api/auth/me
│   │   │   │   ├── auth.schema.js                     # Zod schema validate payload đăng nhập (email, password)
│   │   │   │   ├── auth.service.js                    # Nghiệp vụ đăng nhập, đăng ký, cấp cookie HttpOnly, throttle lockout
│   │   │   │   └── login-throttle.repository.js       # Quản lý khóa tài khoản tạm thời khi đăng nhập sai nhiều lần theo email & IP
│   │   │   ├── charge-points/                         # Module quản lý các trụ sạc xe điện
│   │   │   │   ├── charge-points.repository.js        # Thao tác dữ liệu bảng charge_points và connectors
│   │   │   │   ├── charge-points.routes.js            # Endpoints CRUD trụ sạc và kiểm tra mã trụ /check-code
│   │   │   │   ├── charge-points.schema.js            # Validate dữ liệu đầu vào của trụ sạc (code, power_kw, connector_count)
│   │   │   │   ├── charge-points.service.js           # Nghiệp vụ quản lý trạng thái, công suất, sinh connector, kiểm tra socket
│   │   │   │   └── connection-registry.js             # Quản lý kết nối socket in-memory cho OCPP charge points (connect, disconnect)
│   │   │   ├── health/                                # Module kiểm tra tình trạng sức khỏe hệ thống
│   │   │   │   └── health.routes.js                   # Endpoint GET /api/health kiểm tra trạng thái hoạt động của app và DB
│   │   │   ├── stations/                              # Module quản lý các trạm sạc xe điện
│   │   │   │   ├── stations.repository.js             # Truy vấn dữ liệu bảng stations kết hợp bộ lọc scopeByOwner
│   │   │   │   ├── stations.routes.js                 # Endpoints CRUD trạm sạc (/api/stations)
│   │   │   │   ├── stations.schema.js                 # Validate dữ liệu tạo mới/cập nhật trạm sạc (tên, địa chỉ, toạ độ số thực)
│   │   │   │   └── stations.service.js                # Nghiệp vụ phân quyền sở hữu, kiểm tra toạ độ và idempotency trạm sạc
│   │   │   └── users/                                 # Module quản lý người dùng và tài khoản
│   │   │       ├── users.repository.js                # Thao tác dữ liệu bảng users, roles, user_roles
│   │   │       ├── users.routes.js                    # Endpoints GET /api/roles và POST /api/admin/users
│   │   │       ├── users.schema.js                    # Validate dữ liệu đăng ký công khai và tạo người dùng bởi Admin
│   │   │       └── users.service.js                   # Nghiệp vụ tạo tài khoản trong transaction an toàn, gán vai trò
│   │   └── security/                                  # Tầng an ninh và kiểm soát quyền truy cập
│   │       ├── permissions.js                         # Ma trận phân quyền Sprint 1: NGUỒN DUY NHẤT (Single Source of Truth)
│   │       └── routeGuard.js                          # Bọc Express Router (secureRouter) với cơ chế Default Deny (403 mặc định)
│   └── tests/                                         # Bộ kiểm thử tự động của Developer (138 tests / 29 suites)
│       ├── acceptance/                                # Kiểm thử mức chấp nhận tính năng (Acceptance Criteria)
│       │   ├── S-01.baseline.test.js                  # Chấp nhận baseline khởi động hệ thống, cấu hình và bảo mật ban đầu
│       │   ├── S-02.frontend.test.js                  # Chấp nhận luồng đăng nhập, xử lý cookie và định tuyến phía frontend
│       │   ├── S-02.login-ip.test.js                  # Chấp nhận giới hạn tần suất đăng nhập theo địa chỉ IP (LOGIN_IP_MAX_FAILURES)
│       │   ├── S-02.login.test.js                     # Chấp nhận logic đăng nhập, băm mật khẩu, khoá tạm 15 phút theo email
│       │   ├── S-03.accounts.test.js                  # Chấp nhận kịch bản tài khoản người dùng theo vai trò
│       │   ├── S-03.csrf.test.js                      # Chấp nhận phòng vệ chống tấn công CSRF: application/json & Origin
│       │   ├── S-03.rbac-matrix.test.js               # Chấp nhận toàn bộ 10 endpoint theo ma trận phân quyền RBAC
│       │   ├── S-03.rbac.test.js                      # Chấp nhận cô lập dữ liệu trạm/trụ giữa các chủ trạm (Owner A vs Owner B)
│       │   ├── S-03.route-guard.test.js               # Chấp nhận cơ chế chặn Default Deny của Route Guard (403 cho route chưa khai)
│       │   ├── S-03.trust-proxy.test.js               # Chấp nhận xử lý IP đúng chuẩn phía sau reverse proxy (X-Forwarded-For)
│       │   ├── S-04.station-management.test.js        # Chấp nhận quản lý trạm: tạo/sửa trạm, toạ độ số thực, Idempotency-Key
│       │   └── S-05.charge-point-code.test.js         # Chấp nhận quản lý mã trụ: chuẩn hóa chữ hoa, power_kw và status UNKNOWN
│       ├── helpers/                                   # Tiện ích hỗ trợ thiết lập môi trường test
│       │   ├── app.js                                 # Helper khởi tạo instance Express phục vụ test và closePool
│       │   ├── auth.js                                # Helper tạo user, cấp cookie phiên đăng nhập phục vụ test
│       │   ├── db.js                                  # Helper kết nối, dọn dẹp (truncateAll), reset schema trên DB test 5433
│       │   └── station.js                             # Helper tạo payload fixture trạm sạc cho test suite
│       ├── integration/                               # Kiểm thử tích hợp các luồng vận hành hệ thống
│       │   ├── auth.regression.test.js                # Kiểm tra hồi quy xác thực, cookie httpOnly, /auth/me
│       │   ├── create-admin.test.js                   # Kiểm tra script tạo tài khoản admin CLI (idempotent, không in mật khẩu)
│       │   ├── migrate.test.js                        # Kiểm tra tiến trình chạy migration up/down/up sạch trên PostgreSQL
│       │   └── seed-demo.test.js                      # Kiểm tra kịch bản seed dữ liệu demo (GYM-14) an toàn không ghi đè
│       └── unit/                                      # Kiểm thử đơn vị độc lập từng module logic
│           ├── connection-registry.test.js            # Unit test bộ đăng ký và đếm kết nối đồng thời của socket trụ sạc
│           ├── env.test.js                            # Unit test kiểm tra parse và validate biến môi trường bằng Zod
│           ├── errorHandler.test.js                   # Unit test middleware xử lý lỗi (22P02, 23505, AppError, ZodError, 500)
│           ├── eslint-guard.test.js                   # Unit test rà soát cấm gọi express.Router trực tiếp trong modules/
│           ├── frontend-permissions.test.js           # Unit test đối soát khớp ma trận quyền frontend với backend
│           ├── frontend.test.js                       # Unit test router client, ApiError envelope, validate form, status OCPP
│           ├── no-backdoor.test.js                    # Unit test bảo đảm không có backdoor, không mật khẩu cứng, không pg-mem
│           ├── nodeVersion.test.js                    # Unit test kiểm tra điều kiện tương thích phiên bản Node (>= 22.7)
│           ├── scope.test.js                          # Unit test logic hàm lọc dữ liệu scopeByOwner (chống SQLi qua alias)
│           └── station-schema.test.js                 # Unit test validate Zod schema trạm sạc (toạ độ lat/lng, dải số thực)
├── render.yaml                                        # Blueprint staging trên Render (web Docker + Postgres, tự deploy khi CI xanh)
├── frontend/                                          # Ứng dụng Web Single Page Application hiện đại (Modular Vanilla JS)
│   ├── app.html                                       # Giao diện khung làm việc chính của các vai trò đăng nhập
│   ├── index.html                                     # Giao diện trang chủ và đăng nhập / đăng ký công khai
│   ├── main.js                                        # Điểm khởi động (Entry point) tải tài nguyên và router client
│   ├── app/                                           # Mô-đun kiến trúc lõi của Frontend SPA
│   │   ├── auth.js                                    # Quản lý phiên làm việc người dùng (login, logout, me qua cookie httpOnly)
│   │   ├── dom.js                                     # DOM Builder an toàn tuyệt đối (h(), svg()): chỉ dùng createElement và textNode (CHỐNG XSS)
│   │   ├── format.js                                  # Tiện ích định dạng số, ngày tháng, công suất kW, tiền tệ
│   │   ├── permissions.js                             # Ma trận quyền hạn phía client đồng bộ với backend/security/permissions.js
│   │   ├── router.js                                  # Bộ điều hướng client-side theo Hash URL (#/workspace/page/id?query)
│   │   ├── state.js                                   # Bộ quản lý trạng thái Reactive đơn giản (Store / Event emitter)
│   │   ├── status.js                                  # Chuẩn hoá 9 trạng thái gốc OCPP thành 4 nhóm hiển thị UI (Available, Charging, Faulted, Offline)
│   │   ├── theme-boot.js                              # Khởi động theme sớm trước khi DOM render để tránh hiện tượng FOUC
│   │   ├── theme.js                                   # Logic chuyển đổi giao diện Sáng / Tối (Light / Dark mode)
│   │   ├── validate.js                                # Xác thực form phía client (email, mật khẩu, tên, toạ độ)
│   │   └── workspace.js                               # Logic dựng khung workspace, sidebar và topbar theo vai trò người dùng
│   ├── components/                                    # Thư viện thành phần giao diện tái sử dụng (Reusable UI Components)
│   │   ├── badge.js                                   # Component huy hiệu trạng thái (status badge)
│   │   ├── donut.js                                   # Biểu đồ Donut SVG thuần trực quan hóa tỷ lệ trụ sạc
│   │   ├── empty-state.js                             # Giao diện hiển thị trạng thái rỗng khi chưa có dữ liệu
│   │   ├── hero.js                                    # Banner đầu trang chào mừng và tóm tắt nghiệp vụ
│   │   ├── icons.js                                   # Thư viện SVG icons tối ưu hóa hiển thị
│   │   ├── kpi-card.js                                # Thẻ hiển thị chỉ số đo lường hiệu năng KPI
│   │   ├── modal.js                                   # Thành phần hộp thoại tương tác (Dialog / Modal)
│   │   ├── palette.js                                 # Bảng chọn mã màu và định vị thương hiệu
│   │   ├── sidebar.js                                 # Thanh điều hướng bên trái thích ứng theo vai trò (Responsive Sidebar)
│   │   ├── station-map.js                             # Component bản đồ trạm sạc tích hợp Leaflet tương tác trực quan
│   │   ├── table.js                                   # Bảng dữ liệu tương tác (sort, filter, render an toàn)
│   │   ├── toast.js                                   # Thông báo pop-up thông điệp hệ thống (Toast notification)
│   │   └── topbar.js                                  # Thanh tiêu đề trên cùng: thông tin user, đổi theme, đăng xuất
│   ├── pages/                                         # Màn hình chức năng phân chia theo vai trò người dùng
│   │   ├── accountant/                                # Các màn hình dành cho vai trò Kế toán (Accountant Workspace)
│   │   ├── admin/                                     # Các màn hình quản trị hệ thống dành cho Admin (User management, Roles)
│   │   ├── auth/                                      # Màn hình Đăng nhập (Login) và Đăng ký (Register)
│   │   ├── driver/                                    # Màn hình dành cho Tài xế xe điện (Driver Workspace: tìm trạm, phiên sạc)
│   │   ├── operator/                                  # Màn hình dành cho Vận hành viên (Operator Dashboard, Alerts, Real-time monitor)
│   │   └── shared/                                    # Màn hình dùng chung (Account profile, Stations list, Charge points)
│   ├── services/                                      # Tầng giao tiếp dịch vụ và mạng (Network & Services layer)
│   │   ├── api.js                                     # API Client xử lý request/response, interceptor gắn cookie và bắt lỗi
│   │   ├── csms.js                                    # Tầng API nghiệp vụ CSMS (gọi trạm, trụ, phiên sạc, audit logs)
│   │   └── realtime.js                                # Lắng nghe sự kiện cập nhật thời gian thực (Polling / SSE)
│   ├── styles/                                        # Hệ thống định dạng giao diện CSS phân tầng
│   │   ├── components.css                             # Định dạng chi tiết cho các components
│   │   ├── layout.css                                 # Khung layout tổng thể (grid, flexbox, sidebar, container)
│   │   ├── reset.css                                  # CSS reset chuẩn hóa hiển thị giữa các trình duyệt
│   │   ├── themes.css                                 # Biến màu sắc theo chủ đề (Dark / Light themes)
│   │   └── tokens.css                                 # Design tokens (khoảng cách, font size, border-radius, shadows)
│   └── vendor/                                        # Thư viện bên thứ ba tự đóng gói (Offline-first, không dùng CDN)
│       └── leaflet/                                   # Thư viện bản đồ Leaflet v1.9.4 kèm file style CSS và images
└── docs/                                              # Phân vùng Hồ sơ Kiểm thử & Đảm bảo chất lượng (QA Territory)
    ├── Audit/                                         # AI Security Audit Framework v3.0 (Khung kiểm toán an ninh nguồn mở)
    │   ├── README.md                                  # Hướng dẫn quy trình 5 bước kiểm toán bảo mật mã nguồn
    │   ├── catalogs/                                  # 21 danh mục kiểm tra an ninh (CAT-01 đến CAT-21)
    │   ├── references/                                # Tài liệu tham chiếu chuẩn OWASP Top 10, CWE, ASVS
    │   ├── results/                                   # Lưu trữ các báo cáo kiểm toán an ninh định kỳ
    │   │   └── audit_29_9_2026.md                     # Báo cáo kiểm toán an ninh ngày 29/09/2026 (Phán quyết Quality Gate: BLOCK)
    │   ├── runbooks/                                  # Kịch bản thực thi chi tiết kiểm toán (Security Runbooks)
    │   ├── standards/                                 # Bộ tiêu chuẩn chất lượng an ninh và tiêu chí Quality Gate
    │   └── templates/                                 # Biểu mẫu báo cáo kiểm toán bảo mật chuẩn hóa
    ├── design/                                        # Thiết kế kiến trúc UX/UI Operator Dashboard Level 3 và ảnh đối soát
    │   ├── README.md                                  # Hướng dẫn đối chiếu và ứng dụng thiết kế
    │   └── screenshots/                               # Thư viện ảnh chụp các thành phần giao diện phục vụ đối soát UI
    ├── integration/                                   # Kịch bản kiểm thử tích hợp đa tầng
    │   └── FRONTEND_BACKEND.md                        # Kịch bản & bằng chứng kiểm thử tích hợp toàn trình Frontend ↔ Backend (FB-01..11)
    ├── OPERATIONS.md                                  # Sổ tay vận hành: build, chạy, dừng, DB, staging, biến môi trường
    ├── SPRINT_STATUS.md                               # Tình trạng dự án và sprint đầy đủ
    ├── SPRINT_2_PLAN.md                               # Kế hoạch chi tiết Sprint 2
    ├── spikes/                                        # Nghiên cứu kỹ thuật độc lập & Kiến nghị PO
    │   ├── K-01-ocpp-simulator.md                     # Báo cáo nghiên cứu mô phỏng kết nối giao thức OCPP 1.6-J
    │   ├── k01/                                       # Mã thử chạy lại được: ocpp-rpc, CSMS tham chiếu, trụ ảo, session-log.json, findings.json
    │   ├── k01-session-log.json                       # Nhật ký mẫu phiên truyền nhận gói tin WebSocket OCPP
    │   ├── k01-simulator.js                           # Mã nguồn kịch bản giả lập kết nối thiết bị sạc ngoại vi
    │   └── S-05-AC3-ghi-nhan-cho-PO.md                # Báo cáo kiến nghị gửi PO hoãn kịch bản S-05 AC3 sang Sprint 3
    ├── stories/                                       # Hồ sơ kiểm thử nghiệm thu chi tiết theo từng User Story Jira
    │   ├── S-01.md                                    # Story S-01: Dựng khung ứng dụng, container Docker và PostgreSQL baseline
    │   ├── S-02.md                                    # Story S-02: Xác thực tài khoản, Argon2id, cookie httpOnly, khóa tạm 15 phút
    │   ├── S-03.md                                    # Story S-03: Phân quyền vai trò RBAC, Route Guard Default Deny, cô lập sở hữu
    │   ├── S-04.md                                    # Story S-04: Chủ trạm tạo và sửa thông tin trạm sạc, toạ độ số thực, idempotency
    │   └── S-05.md                                    # Story S-05: Thêm trụ sạc, đầu nối, chuẩn hóa mã trụ chữ hoa toàn hệ thống
    ├── testing/                                       # Phân vùng Báo cáo & Quản lý kiểm thử tổng thể
    │   ├── BUG_REPORT.md                              # Hồ sơ quản lý lỗi mã nguồn (`CODE_DEFECT`) và rào cản môi trường
    │   ├── REGRESSION_REPORT.md                       # Báo cáo đánh giá hồi quy sau các đợt refactor và nâng cấp hệ thống
    │   ├── TEST_PLAN.md                               # Kế hoạch kiểm thử: mục tiêu, tiêu chí Entry/Exit, ma trận kiểm thử
    │   └── TEST_REPORT.md                             # Báo cáo tổng hợp chất lượng hệ thống tại mốc snapshot
    ├── PROJECT_STRUCTURE.md                           # Bản đồ cấu trúc toàn bộ dự án và hệ thống tài liệu QA (file này)
    ├── README.md                                      # AI Tester Entry Point & Router điều hướng tài liệu kiểm thử
    ├── TESTER_STANDARD.md                             # Bộ quy chuẩn kiểm thử trung tâm chi phối toàn bộ hoạt động Tester
    └── TEST_INVENTORY.md                              # Bảng kê tập trung danh mục toàn bộ test case và trạng thái thực thi
```

---

## 5. Important Components (Các thành phần quan trọng)

| Thành phần | Đường dẫn thực tế | Mục đích thực tế (Actual Purpose) | Sự liên quan của Tester (Tester Relevance) | Quyền hạn |
|:---|:---|:---|:---|:---:|
| **Root Compose** | `docker-compose.yml` | Điều phối cụm container gồm 3 dịch vụ: `db` (Postgres 16, 5432), `db_test` (Postgres 16, 5433), `app` (Node.js 22, 3000) | Điểm chạy kịch bản nghiệm thu container (`S01-AC-01`, `TC-S01-01`). Kiểm tra healthcheck, network isolation, port binding | Read-Only |
| **Cloud Blueprint** | `render.yaml` | Cấu hình triển khai hạ tầng Staging tự động trên Render.com, gắn `TRUST_PROXY=2`, cấu hình autoDeploy khi CI xanh | Đối chiếu cấu hình môi trường staging, kiểm tra biến môi trường và thiết lập proxy tin cậy | Read-Only |
| **Seed Demo CLI** | `backend/scripts/seed-demo.js` | Script seed dữ liệu mẫu staging chuẩn hóa (6 tài khoản đủ 5 vai trò, 6 trạm, 12 trụ, 24 đầu nối) | Dùng để dựng môi trường kiểm thử dữ liệu sống (idempotent, yêu cầu `ALLOW_DEMO_SEED=1`) | Read-Only |
| **Root README** | `README.md` | Tài liệu giới thiệu dự án, hướng dẫn cài đặt môi trường, ma trận tài khoản seed và lệnh chạy | Nguồn đối chiếu Acceptance Criteria S-01, danh sách tài khoản seed mặc định và ma trận vai trò | Read-Only |
| **Lint Config** | `eslint.config.js` | Cấu hình ESLint flat config cho backend và frontend JavaScript | Dùng để chạy `npm run lint`, xác minh chuẩn cú pháp và quy tắc an toàn tĩnh | Read-Only |
| **CI/CD Workflow** | `.github/workflows/ci.yml` | Định nghĩa pipeline GitHub Actions tự động kiểm tra lint, test và build Docker | Giúp Tester đối chiếu môi trường CI với máy host và theo dõi trạng thái build | Read-Only |
| **Backend Environment** | `backend/src/config/env.js` | Nạp và validate các biến môi trường bằng Zod schema (`PORT`, `DATABASE_URL`, `JWT_SECRET`,...) | Trọng tâm kiểm thử `S01-NFR-01`: secrets nạp từ biến môi trường, fail-fast nếu thiếu | Read-Only |
| **WebSocket OCPP** | `backend/src/server.js` | Lắng nghe nâng cấp giao thức WebSocket `/ocpp/:code`, bắt tay kết nối trụ sạc và phản hồi OCPP | Điểm kiểm tra an ninh `SEC-WS-001`, đối tượng kiểm thử giao tiếp hai chiều và tải đồng thời | Read-Only |
| **Connection Registry** | `backend/src/modules/charge-points/connection-registry.js` | Quản lý bản đồ in-memory các trụ sạc đang kết nối socket (`connect`, `disconnect`, `isConnected`) | Điểm kiểm thử `UT-OCPP-CONN-01`, kiểm tra khóa đổi mã trụ khi đang kết nối | Read-Only |
| **Frontend Core App** | `frontend/app/` | Bộ điều hướng URL hash (`router.js`), quản lý phiên cookie (`auth.js`), DOM an toàn (`dom.js`), workspace (`workspace.js`) | Trọng tâm kiểm thử chức năng giao diện, phân quyền hiển thị theo vai trò và kiểm tra chống XSS | Read-Only |
| **Frontend Components** | `frontend/components/` | Thư viện 13 thành phần UI tái sử dụng (Bản đồ Leaflet, Table, Modal, Toast, Donut Chart, Sidebar, Topbar) | Đối tượng kiểm thử kiểm chứng hiển thị trực quan (Visual & Functional UI verification) | Read-Only |
| **Frontend Services** | `frontend/services/` | Lớp gọi API backend (`api.js`, `csms.js`) và WebSocket client lắng nghe thời gian thực (`realtime.js`) | Điểm kiểm thử tích hợp Frontend ↔ Backend `FB-01` đến `FB-11` | Read-Only |
| **Dev Test Suites** | `backend/tests/` | Bộ 138 ca kiểm thử tự động của Developer (acceptance, integration, unit) chạy qua Node test runner | Cung cấp bằng chứng tự động (Automated Evidence) khách quan và đo lường độ bao phủ kiểm thử | Read-Only |
| **Audit Framework** | `docs/Audit/` | Khung kiểm toán an ninh toàn diện 5 bước (Standards, Runbook, Catalogs, Templates, Results) | Công cụ thực hiện và lưu vết các kỳ kiểm toán bảo mật mã nguồn (Security Assurance) | **Tester Quản Lý** |
| **QA Documentation** | `docs/` | Toàn bộ hệ thống hồ sơ và tài liệu kiểm thử của dự án CSMS | Nơi Tester làm việc, thiết kế test, ghi nhận bằng chứng và báo cáo hiện trạng | **Tester Quản Lý** |
| **QA Documentation** | `docs/` | Toàn bộ hệ thống hồ sơ và tài liệu kiểm thử của dự án CSMS | Nơi Tester làm việc, thiết kế test, ghi nhận bằng chứng và báo cáo hiện trạng | **Tester Quản Lý** |

---

## 6. QA Documentation Map (Bản đồ tài liệu QA)

| Tệp tài liệu | Mục đích thực tế (Actual Purpose) | Khi nào cập nhật (Trigger) | Quan hệ với các tài liệu QA khác |
|:---|:---|:---|:---|
| **[`README.md`](./README.md)** | **AI Tester Entry Point & Router**: Điểm tiếp nhận nhiệm vụ đầu vào, hướng dẫn thứ tự đọc tài liệu và routing logic cho từng loại lệnh kiểm thử (E, S, T, Integration, Security Audit). | Khi có thay đổi về quy trình tiếp nhận nhiệm vụ hoặc bổ sung router mới. | Điều hướng AI Tester tra cứu đúng tài liệu nghiệp vụ; không chứa nội dung luật chi tiết. |
| **[`TESTER_STANDARD.md`](./TESTER_STANDARD.md)** | **Central Rulebook & Standards**: Bộ quy chuẩn trung tâm chứa toàn bộ nguyên tắc kiểm thử, luồng Requirement Testing vs General Review, mô hình E→S→T, đồ thị phụ thuộc đa cấp, Canonical Enums, 6-layers testing, chuẩn kiểm toán an ninh. | Khi có sự thay đổi về chính sách kiểm thử hoặc cập nhật phiên bản quy chuẩn. | Là nguồn luật pháp lý cao nhất chi phối toàn bộ hoạt động của Tester. |
| **[`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md)** | **Verified Project Map (Project Facts)**: Bản đồ cấu trúc toàn bộ filesystem đã xác minh, component mapping, đồ thị phụ thuộc thực tế, ánh xạ lịch sử kiểm thử và metadata snapshot. | Trước mỗi task kiểm thử mới (đồng bộ nếu filesystem thay đổi) hoặc khi có file/module mới. | Cung cấp sự thật cấu trúc (Project Facts) cho mọi tác vụ QA. |
| **[`TEST_INVENTORY.md`](./TEST_INVENTORY.md)** | **Verified Test Index (Test Facts)**: Danh mục toàn bộ 138 Test Case thực tế của dự án, tình trạng PASS/FAIL/BLOCKED, bằng chứng liên kết, phát hiện an ninh và mức độ xác minh (Verification). | Bắt buộc cập nhật ngay sau khi thực thi bất kỳ ca kiểm thử hoặc kiểm toán nào. | Cung cấp dữ liệu sự thật kiểm thử (Test Facts) cho báo cáo chất lượng. |
| **[`Audit/README.md`](./Audit/README.md)** | **Khung Kiểm Toán Bảo Mật AI Security Audit Framework v3.0**: Bộ tiêu chuẩn và runbook 5 bước thực thi kiểm toán mã nguồn tất định. | Khi mở đợt kiểm toán an ninh định kỳ hoặc trước các mốc phát hành lớn. | Cung cấp bằng chứng an ninh và báo cáo `docs/Audit/results/*.md`. |
| **[`stories/S-xx.md`](./stories/)** | **Hồ sơ kiểm thử Story**: Chi tiết kịch bản, bước thực thi và bằng chứng cho từng User Story (S-01 đến S-05). | Khi Story hoặc Task có sự thay đổi hoặc chạy lại kiểm thử. | Phản ánh chi tiết kết quả cụm bài test baseline vào `TEST_INVENTORY.md`. |
| **[`integration/FRONTEND_BACKEND.md`](./integration/FRONTEND_BACKEND.md)** | **Hồ sơ kiểm thử tích hợp**: Kịch bản và bằng chứng kiểm thử giao tiếp toàn trình giữa Frontend Client và Backend API (FB-01..11). | Khi hợp đồng API, cấu hình fetch client hoặc chuỗi middleware Express thay đổi. | Tổng hợp kết quả tích hợp đa tầng giữa S-01, S-02, S-03, S-04 và S-05. |
| **[`testing/BUG_REPORT.md`](./testing/BUG_REPORT.md)** | **Hồ sơ lỗi & rào cản**: Lưu trữ chi tiết các lỗi mã nguồn (`CODE_DEFECT`) và rào cản môi trường/cấu hình. | Ngay khi phát hiện lỗi hoặc khi lỗi được giải quyết. | Kết nối trực tiếp với các Test Case bị FAIL/BLOCKED trong `TEST_INVENTORY.md`. |
| **[`testing/TEST_REPORT.md`](./testing/TEST_REPORT.md)** | **Báo cáo kết quả snapshot**: Báo cáo tổng hợp chất lượng tại mốc snapshot hiện tại, tỷ lệ PASS/FAIL, các rào cản môi trường. | Khi hoàn thành chu kỳ kiểm thử snapshot hoặc trước các mốc release. | Tổng hợp số liệu từ `TEST_INVENTORY.md`. |

---

## 7. Requirement → Task → Source Mapping

| Epic cha | Jira Story | Task kỹ thuật | Tiêu chí chính (AC / NFR) | Thành phần mã nguồn thực tế (Source Mapping) | Dev Automated Tests (Evidence) | QA Test Document & Test IDs |
|:---:|:---|:---|:---|:---|:---|:---|
| **E-01** | **S-01** | **T-01** | `S01-AC-01`<br>`S01-NFR-01`<br>`S01-NFR-02`<br>`T01-01`..`05`<br>`T01-NFR-01` | • `docker-compose.yml`<br>• `backend/Dockerfile`<br>• `backend/src/config/env.js`<br>• `backend/src/config/nodeVersion.js`<br>• `backend/src/modules/health/health.routes.js`<br>• `backend/migrations/001_baseline.sql`<br>• `backend/src/db/migrate.js`, `pool.js`<br>• `backend/scripts/create-admin.js`<br>• `frontend/index.html` | • `tests/acceptance/S-01.baseline.test.js`<br>• `tests/integration/migrate.test.js`<br>• `tests/integration/create-admin.test.js`<br>• `tests/unit/env.test.js`<br>• `tests/unit/nodeVersion.test.js`<br>• `tests/unit/no-backdoor.test.js` | [`stories/S-01.md`](./stories/S-01.md)<br>(`TC-S01-01`..`03`, `TC-T01-01`..`04`, `UT-NODE-01`, `UT-BACKDOOR-01`, `UT-ENV-01`, `UT-ERR-01`, `IT-MIGRATE-01`, `IT-ADMIN-01`, `ACC-S01-01`) |
| **E-02** | **S-02** | **T-04** | `T04-01`..`04`<br>`T04-NFR` | • `backend/migrations/001_baseline.sql`<br>• `backend/src/lib/roles.js`<br>• `backend/src/lib/password.js`<br>• `backend/src/modules/users/users.repository.js` | • `tests/acceptance/S-02.login.test.js`<br>• `tests/integration/auth.regression.test.js` | [`stories/S-02.md`](./stories/S-02.md)<br>(`TC-T04-01`..`05`) |
| **E-02** | **S-02** | **T-05** | `S02-AC-01`..`04`<br>`S02-NFR-01`<br>`S02-NFR-02`<br>`T05-01`..`03`<br>`T05-NFR-01`..`03` | • `backend/src/modules/auth/auth.routes.js`<br>• `backend/src/modules/auth/auth.service.js`<br>• `backend/src/modules/auth/auth.schema.js`<br>• `backend/src/modules/auth/login-throttle.repository.js`<br>• `backend/src/middlewares/authenticate.js`<br>• `frontend/app/auth.js`<br>• `frontend/pages/auth/`<br>• `frontend/app/validate.js` | • `tests/acceptance/S-02.login.test.js`<br>• `tests/acceptance/S-02.login-ip.test.js`<br>• `tests/acceptance/S-02.frontend.test.js`<br>• `tests/integration/auth.regression.test.js` | [`stories/S-02.md`](./stories/S-02.md)<br>(`TC-S02-01`..`04`, `TC-T05-01`..`04`, `ACC-S02-01`..`03`, `IT-AUTH-01`) |
| **E-02** | **S-03** | **T-06** | `S03-AC-03`<br>`S03-AC-04`<br>`T06-01`<br>`T06-02` | • `backend/src/security/permissions.js`<br>• `backend/src/security/routeGuard.js`<br>• `backend/src/app.js`<br>• `frontend/app/router.js`<br>• `frontend/app/permissions.js` | • `tests/acceptance/S-03.rbac.test.js`<br>• `tests/acceptance/S-03.rbac-matrix.test.js`<br>• `tests/acceptance/S-03.route-guard.test.js`<br>• `tests/acceptance/S-03.accounts.test.js`<br>• `tests/acceptance/S-03.trust-proxy.test.js` | [`stories/S-03.md`](./stories/S-03.md)<br>(`TC-S03-03`, `TC-S03-04`, `TC-T06-01`, `TC-T06-02`, `ACC-S03-MATRIX`) |
| **E-02** | **S-03** | **T-07** | `S03-AC-01`<br>`S03-AC-02`<br>`S03-NFR-01`<br>`T07-01`..`03`<br>`T07-NFR` | • `backend/src/db/scope.js` (`scopeByOwner`)<br>• `backend/src/modules/stations/`<br>• `backend/src/modules/charge-points/`<br>• `backend/src/modules/audit/audit.repository.js`<br>• `backend/migrations/003_stations_owner.sql`<br>• `frontend/components/sidebar.js` | • `tests/unit/scope.test.js`<br>• `tests/acceptance/S-03.rbac.test.js`<br>• `tests/acceptance/S-03.accounts.test.js` | [`stories/S-03.md`](./stories/S-03.md)<br>(`TC-S03-01`, `TC-S03-02`, `TC-T07-01`..`03`) |
| **E-03** | **S-04** | **T-08, T-09** | `S04-AC-01`..`04`<br>`S04-NFR-01`<br>`T08-01`<br>`T08-NFR-01`<br>`T09-01`<br>`T09-NFR-01` | • `backend/migrations/004_station_management.sql`<br>• `backend/src/modules/stations/stations.routes.js`<br>• `backend/src/modules/stations/stations.service.js`<br>• `backend/src/modules/stations/stations.schema.js`<br>• `backend/src/modules/stations/stations.repository.js`<br>• `frontend/components/station-map.js`<br>• `frontend/services/csms.js` | • `tests/acceptance/S-04.station-management.test.js`<br>• `tests/unit/station-schema.test.js`<br>• `tests/integration/migrate.test.js` | [`stories/S-04.md`](./stories/S-04.md)<br>(`TC-S04-01`..`07`, `TC-T08-01`..`03`, `TC-T09-01`..`03`) |
| **E-03** | **S-05** | **T-10, T-11** | `S05-AC-01`..`03`<br>`S05-NFR-01`<br>`T10-01`<br>`T11-01` | • `backend/migrations/005_charge_point_code_upper.sql`<br>• `backend/src/modules/charge-points/charge-points.repository.js`<br>• `backend/src/modules/charge-points/charge-points.service.js`<br>• `backend/src/modules/charge-points/charge-points.schema.js`<br>• `backend/src/modules/charge-points/charge-points.routes.js`<br>• `backend/src/modules/charge-points/connection-registry.js`<br>• `backend/src/server.js` (WebSocket OCPP) | • `tests/acceptance/S-05.charge-point-code.test.js`<br>• `tests/unit/connection-registry.test.js`<br>• `tests/integration/migrate.test.js` | [`stories/S-05.md`](./stories/S-05.md)<br>(`TC-S05-01`..`03`, `TC-T10-01`, `TC-T11-01`) |
| **Cross-Epic** | **Integration** | **FB-01 .. FB-11** | Hợp đồng API, Cookie credentials, Error envelope, CSRF guard | • `frontend/services/api.js`<br>• `frontend/app/auth.js`<br>• `frontend/app/router.js`<br>• `frontend/app/dom.js`<br>• `frontend/app/validate.js`<br>• `backend/src/app.js`<br>• `backend/src/middlewares/errorHandler.js`<br>• `backend/src/middlewares/requireJson.js` | • `tests/unit/frontend.test.js`<br>• `tests/unit/frontend-permissions.test.js`<br>• `tests/acceptance/S-02.frontend.test.js`<br>• `tests/acceptance/S-03.csrf.test.js` | [`integration/FRONTEND_BACKEND.md`](./integration/FRONTEND_BACKEND.md)<br>(`TC-FB-01` đến `TC-FB-11`) |
| **Security** | **Audit** | **SEC-01 .. SEC-03** | Đánh giá an ninh toàn diện 5 bước, Source-to-Sink, Canary test | • `backend/src/server.js` (WS Upgrade)<br>• `backend/src/modules/auth/auth.routes.js`<br>• `backend/tests/acceptance/S-02.login.test.js:112` | • Kiểm thử Canary WebSocket<br>• `npm audit`<br>• `npm run lint` | [`Audit/results/audit_29_9_2026.md`](./Audit/results/audit_29_9_2026.md)<br>(`SEC-WS-001`, `SEC-SESS-002`, `SEC-DEV-003`) |

---

## 8. Structure Verification Metadata (Thông tin kiểm chứng cấu trúc)

- **Structure Status**: **VERIFIED** (Đã đối chiếu 100% khớp với filesystem thực tế).
- **Snapshot Date**: 29/09/2026.
- **Git Commit Hash**: `ba61aeaee0f061e1409913cd5c1ea8c5d84e5f98`.
- **Git Branch**: `main`.
- **Operating System Environment**: Windows 11 x64, Node.js v22.7+, npm 10+.
- **Container Environment**: Docker Desktop (PostgreSQL 16 alpine trên ports 5432, 5433; App container trên port 3000).
- **Test Suite Scale**: 138 tests, 29 suites (Node native test runner).
- **Security Audit Status**: Quality Gate **BLOCK** (Phát hiện `SEC-WS-001` tại WebSocket `/ocpp/:code`).
- **Last Verification Timestamp**: `29/09/2026 10:28:00 +07:00`.
