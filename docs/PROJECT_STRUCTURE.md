# Project Structure

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Người thực hiện**: TESTER / QA ANALYST  
> **Snapshot Date**: 28/09/2026  
> **Git Commit**: `86769949c03381429fd4931f3b364341ac618f8f` (nhánh `main`)  
> **Structure Status**: **VERIFIED**  
> **Entry Point / Router**: [`docs/README.md`](./README.md)  
> **Bộ quy chuẩn trung tâm**: [`docs/TESTER_STANDARD.md`](./TESTER_STANDARD.md)  
> **Chỉ mục kiểm thử**: [`docs/TEST_INVENTORY.md`](./TEST_INVENTORY.md)  

---

## 1. Mục đích của tài liệu

Tài liệu này là **VERIFIED PROJECT MAP** (Bản đồ dự án đã qua xác minh thực tế) dành riêng cho AI Tester / QA Analyst:
- Cung cấp cái nhìn toàn diện, chuẩn xác và tức thì về cấu trúc thư mục, tệp tin và các thành phần mã nguồn của dự án CSMS.
- Xác định quyền sở hữu tài nguyên và ranh giới kiểm thử: Tester toàn quyền quản trị phân vùng `docs/` và đọc-kiểm tra (read-only) toàn bộ các thành phần khác.
- Thiết lập hệ thống ánh xạ truy vết hai chiều (Bidirectional Traceability) giữa Yêu cầu (Story/Task/AC/NFR) $\longleftrightarrow$ Mã nguồn hiện thực (Source Components) $\longleftrightarrow$ Bộ kiểm thử tự động của Dev $\longleftrightarrow$ Hồ sơ kiểm thử của QA.
- Làm cơ sở thực thi nguyên tắc **NO-REDISCOVERY**: Trong các tác vụ Tester tiếp theo, AI Tester trực tiếp tra cứu vị trí cần kiểm thử từ bản đồ này mà không phải quét lại toàn bộ mã nguồn hoặc hỏi lại người dùng.

---

## 2. Structure Authority (Thẩm quyền cấu trúc)

1. **Filesystem thực tế là Nguồn Sự Thật Tối Thượng (Source of Truth)**:
   - Cấu trúc thư mục, tệp tin hiện hữu trên ổ đĩa và hành vi mã nguồn thực tế tại commit snapshot hiện tại là căn cứ pháp lý cao nhất về cấu trúc dự án.
2. **PROJECT_STRUCTURE.md là Bản Đồ Đã Xác Minh (Verified Map)**:
   - Tài liệu này là sự phản ánh có cấu trúc của filesystem thực tế nhằm hỗ trợ công tác QA. Tài liệu không thay thế filesystem.
3. **Quy tắc giải quyết xung đột (Conflict Resolution)**:
   - Khi phát hiện có sự sai lệch giữa `PROJECT_STRUCTURE.md` và filesystem thực tế: **Luôn ưu tiên dữ liệu từ filesystem thực tế**, tiến hành phân tích công năng thực tế của tệp, sau đó cập nhật đồng bộ lại vào `PROJECT_STRUCTURE.md`.

---

## 3. Tester Ownership (Quyền sở hữu của Tester)

| Khu vực tài nguyên | Phạm vi quyền hạn của Tester | Ghi chú vận hành |
|:---|:---:|:---|
| **`docs/`** | **CREATE / EDIT / DELETE**<br>(Toàn quyền quản trị) | Là khu vực duy nhất Tester được phép tạo mới, chỉnh sửa, cập nhật hoặc dọn dẹp các tệp tài liệu kiểm thử, quy chuẩn, inventory, stories, integration và report. |
| **`backend/`** | **READ-ONLY**<br>(Chỉ đọc & Phân tích) | Tuyệt đối không sửa source code, business logic, controller, service, middleware, schema hay test code của Developer. |
| **`frontend/`** | **READ-ONLY**<br>(Chỉ đọc & Phân tích) | Tuyệt đối không sửa đổi HTML, CSS, client scripts JS (`api.js`, `router.js`, `auth.js`,...). |
| **`database / migrations`** | **READ-ONLY**<br>(Chỉ kiểm tra DDL & Chạy test) | Tuyệt đối không sửa file SQL migration. Chỉ thực thi migration runner trên DB test để nghiệm thu. |
| **`Docker / Configuration`** | **READ-ONLY**<br>(Chỉ đọc để kiểm chứng NFR) | Tuyệt đối không sửa `docker-compose.yml`, `Dockerfile`, `.env`, `.env.example`, `package.json`, `eslint.config.js`. |
| **`Session Cookies (*.cookie)`** | **READ-ONLY**<br>(Chỉ nạp phiên kiểm thử) | Tệp tạm sinh ra khi chạy live test curl xác thực (được .gitignore loại trừ, không lưu trong repo git). |
| **`Git History & CI/CD`** | **READ-ONLY**<br>(Tuyệt đối không can thiệp) | Không commit, không push, không checkout/switch branch, không sửa đổi workflow `.github/`. |

---

## 4. Verified Project Tree (Cây thư mục đã xác minh)

Toàn bộ cây thư mục thực tế của dự án `Charging-Station-Management-System-CSMS-` đã được quét và kiểm chứng chi tiết:

```text
Charging-Station-Management-System-CSMS-/
├── .dockerignore                                      # Danh sách file/thư mục loại trừ khi Docker build image
├── .gitignore                                         # Danh sách file/thư mục Git không theo dõi (node_modules, *.cookie, .env,...)
├── .github/                                           # Thư mục cấu hình GitHub (CI/CD workflows và pull request templates)
│   ├── pull_request_template.md                       # Mẫu checklist tiêu chuẩn khi tạo Pull Request
│   └── workflows/                                     # Thư mục định nghĩa các pipeline tự động hóa GitHub Actions
│       └── ci.yml                                     # Pipeline tự động chạy lint, unit test, build container trên CI
├── docker-compose.yml                                 # Cấu hình khởi chạy cụm container (db:5432, db_test:5433, app:3000)
├── eslint.config.js                                   # Cấu hình kiểm tra cú pháp và quy chuẩn mã nguồn tĩnh (ESLint flat config)
├── README.md                                          # Tài liệu gốc dự án: giới thiệu, hướng dẫn cài đặt, tài khoản seed
├── backend/                                           # Mã nguồn và cấu hình dịch vụ Backend (Node.js / Express)
│   ├── .env.example                                   # Mẫu khai báo các biến môi trường chuẩn (không chứa secret thực tế)
│   ├── .gitignore                                     # Quy tắc bỏ qua file riêng của backend (node_modules, coverage,...)
│   ├── .npmrc                                         # Cấu hình cài đặt gói package npm
│   ├── Dockerfile                                     # File chỉ dẫn build Docker image cho backend (Node 22-alpine/slim)
│   ├── package.json                                   # Khai báo dependency, scripts thực thi (start, test, migrate,...)
│   ├── package-lock.json                              # Khóa phiên bản chi tiết các thư viện npm phụ thuộc
│   ├── README.md                                      # Tài liệu kỹ thuật chi tiết riêng của module Backend
│   ├── migrations/                                    # Thư mục chứa các file DDL SQL migration cơ sở dữ liệu
│   │   ├── 001_baseline.sql                           # Khởi tạo schema ban đầu: users, roles, stations, charge_points, audit
│   │   ├── 001_baseline.down.sql                      # Rollback schema baseline (drop các bảng)
│   │   ├── 002_login_throttle_drop_user_lockout.sql   # Tạo bảng login_throttle chống brute-force và tách khỏi bảng users
│   │   ├── 002_login_throttle_drop_user_lockout.down.sql # Rollback migration bảng login_throttle
│   │   ├── 003_stations_owner.sql                     # Bổ sung quan hệ sở hữu trạm sạc cho Station Owner
│   │   ├── 003_stations_owner.down.sql                # Rollback quan hệ sở hữu trạm sạc
│   │   ├── 004_station_management.sql                 # Mở rộng trạm sạc (status, lat, lng, capacity, price_kwh) và bảng idempotency keys
│   │   └── 004_station_management.down.sql            # Rollback migration quản lý trạm sạc
│   ├── scripts/                                       # Thư mục chứa các script hỗ trợ vận hành và bảo trì CLI
│   │   └── create-admin.js                            # Script CLI khởi tạo tài khoản quản trị viên tối cao ban đầu
│   ├── src/                                           # Mã nguồn chính của ứng dụng backend
│   │   ├── app.js                                     # Khởi tạo Express app, gắn middlewares, static frontend, và routes
│   │   ├── server.js                                  # File bootstrap lắng nghe cổng HTTP và khởi động máy chủ
│   │   ├── config/                                    # Thư mục nạp và xác thực cấu hình môi trường
│   │   │   ├── env.js                                 # Validate biến môi trường bằng Zod schema (fail-fast khi thiếu)
│   │   │   └── nodeVersion.js                         # Kiểm tra phiên bản Node.js tối thiểu (>= 22.7.0)
│   │   ├── db/                                        # Tầng giao tiếp và quản trị cơ sở dữ liệu PostgreSQL
│   │   │   ├── migrate.js                             # Bộ chạy migration tự động đọc và thực thi các file SQL up/down
│   │   │   ├── pool.js                                # Quản lý kết nối PostgreSQL Connection Pool (pg.Pool)
│   │   │   ├── scope.js                               # Logic hàm scopeByOwner cô lập truy vấn theo quyền sở hữu của role
│   │   │   └── tx.js                                  # Hàm tiện ích quản lý database transaction (BEGIN, COMMIT, ROLLBACK)
│   │   ├── lib/                                       # Thư viện dùng chung, tiện ích cốt lõi và định nghĩa enum
│   │   │   ├── errors.js                              # Định nghĩa các lớp lỗi tùy biến (AppError, Unauthorized, Forbidden,...)
│   │   │   ├── ownership.js                           # Tiện ích kiểm tra và xử lý quan hệ sở hữu dữ liệu
│   │   │   ├── password.js                            # Xử lý băm và kiểm tra mật khẩu bằng thuật toán Argon2id
│   │   │   ├── roles.js                               # Định nghĩa enum các vai trò (ADMIN, OPERATOR, STATION_OWNER,...)
│   │   │   └── schemas.js                             # Các schema Zod dùng chung để validate kiểu dữ liệu
│   │   ├── middlewares/                               # Các middleware xử lý trung gian của Express
│   │   │   ├── authenticate.js                        # Xác thực phiên người dùng từ cookie HttpOnly hoặc JWT token
│   │   │   ├── errorHandler.js                        # Xử lý lỗi tập trung, trả về format JSON chuẩn cho client
│   │   │   └── requireJson.js                         # Bắt buộc request mutation (POST/PUT/PATCH) phải có Content-Type JSON
│   │   ├── modules/                                   # Các module chức năng nghiệp vụ của hệ thống (Domain modules)
│   │   │   ├── audit/                                 # Module ghi nhận và quản lý nhật ký an ninh hệ thống
│   │   │   │   └── audit.repository.js                # Truy vấn bảng audit_logs ghi nhận sự kiện bảo mật (vd: ACCESS_DENIED)
│   │   │   ├── auth/                                  # Module quản lý xác thực và phiên làm việc người dùng
│   │   │   │   ├── auth.routes.js                     # Định nghĩa router cho các endpoint /api/auth (login, logout, me)
│   │   │   │   ├── auth.schema.js                     # Zod schema validate payload đăng nhập
│   │   │   │   ├── auth.service.js                    # Nghiệp vụ xử lý đăng nhập, cấp cookie, kiểm tra mật khẩu
│   │   │   │   └── login-throttle.repository.js       # Quản lý khóa tài khoản tạm thời khi đăng nhập sai nhiều lần
│   │   │   ├── charge-points/                         # Module quản lý các trụ sạc xe điện
│   │   │   │   ├── charge-points.repository.js        # Thao tác dữ liệu bảng charge_points
│   │   │   │   ├── charge-points.routes.js            # Router định nghĩa các endpoint CRUD trụ sạc
│   │   │   │   ├── charge-points.schema.js            # Validate dữ liệu đầu vào của trụ sạc
│   │   │   │   ├── charge-points.service.js           # Nghiệp vụ quản lý trạng thái, công suất của trụ sạc
│   │   │   │   └── connection-registry.js             # Quản lý kết nối socket in-memory cho OCPP charge points
│   │   │   ├── health/                                # Module kiểm tra tình trạng sức khỏe hệ thống
│   │   │   │   └── health.routes.js                   # Endpoint GET /api/health kiểm tra trạng thái hoạt động của app và DB
│   │   │   ├── stations/                              # Module quản lý các trạm sạc xe điện
│   │   │   │   ├── stations.repository.js             # Truy vấn dữ liệu bảng stations (kết hợp bộ lọc scopeByOwner)
│   │   │   │   ├── stations.routes.js                 # Router định nghĩa các endpoint /api/stations
│   │   │   │   ├── stations.schema.js                 # Validate dữ liệu tạo mới/cập nhật trạm sạc
│   │   │   │   └── stations.service.js                # Nghiệp vụ phân quyền và quản lý trạm sạc
│   │   │   └── users/                                 # Module quản lý người dùng và tài khoản
│   │   │       ├── users.repository.js                # Thao tác dữ liệu bảng users, roles, user_roles
│   │   │       ├── users.routes.js                    # Router định nghĩa các endpoint quản lý tài khoản người dùng
│   │   │       ├── users.schema.js                    # Validate dữ liệu tạo người dùng
│   │   │       └── users.service.js                   # Nghiệp vụ phân vai trò và truy vấn thông tin người dùng
│   │   └── security/                                  # Tầng an ninh và kiểm soát quyền truy cập
│   │       ├── permissions.js                         # Khai báo ma trận phân quyền chi tiết cho từng vai trò người dùng
│   │       └── routeGuard.js                          # Middleware kiểm soát route (Route Guard) với cơ chế Default Deny
│   └── tests/                                         # Bộ kiểm thử tự động của Developer
│       ├── acceptance/                                # Kiểm thử mức chấp nhận tính năng theo từng User Story
│       │   ├── S-01.baseline.test.js                  # Kiểm tra baseline khởi động hệ thống và bảo mật ban đầu
│       │   ├── S-02.frontend.test.js                  # Kiểm tra luồng đăng nhập và xử lý cookie phía frontend
│       │   ├── S-02.login-ip.test.js                  # Kiểm tra giới hạn tần suất đăng nhập (throttle) theo địa chỉ IP
│       │   ├── S-02.login.test.js                     # Kiểm tra logic đăng nhập và khóa tài khoản theo email
│       │   ├── S-03.accounts.test.js                  # Kiểm tra các kịch bản tài khoản người dùng theo vai trò
│       │   ├── S-03.csrf.test.js                      # Kiểm tra phòng vệ chống tấn công CSRF
│       │   ├── S-03.rbac-matrix.test.js               # Kiểm tra toàn bộ ma trận phân quyền RBAC
│       │   ├── S-03.rbac.test.js                      # Kiểm tra tính thực thi phân quyền trên các route
│       │   ├── S-03.route-guard.test.js               # Kiểm tra cơ chế chặn Default Deny của Route Guard
│       │   ├── S-03.trust-proxy.test.js               # Kiểm tra xử lý IP phía sau reverse proxy (trust proxy)
│       │   └── S-04.station-management.test.js        # Kiểm tra chấp nhận quản lý trạm: tạo/sửa trạm, toạ độ, Idempotency-Key
│       ├── helpers/                                   # Tiện ích hỗ trợ thiết lập môi trường test
│       │   ├── app.js                                 # Helper khởi tạo instance ứng dụng phục vụ test
│       │   ├── auth.js                                # Helper tạo token/cookie giả lập phiên đăng nhập cho test
│       │   └── db.js                                  # Helper kết nối, dọn dẹp và reset cơ sở dữ liệu test
│       ├── integration/                               # Kiểm thử tích hợp giữa các thành phần backend
│       │   ├── auth.regression.test.js                # Kiểm tra hồi quy cơ chế xác thực và bảo mật phiên
│       │   ├── create-admin.test.js                   # Kiểm tra script tạo tài khoản admin CLI
│       │   └── migrate.test.js                        # Kiểm tra tiến trình chạy migration và rollback cơ sở dữ liệu
│       └── unit/                                      # Kiểm thử đơn vị độc lập từng hàm logic
│           ├── connection-registry.test.js            # Unit test bộ đăng ký và theo dõi kết nối socket trụ sạc
│           ├── env.test.js                            # Unit test kiểm tra parse và validate biến môi trường
│           ├── errorHandler.test.js                   # Unit test kiểm tra middleware xử lý lỗi
│           ├── eslint-guard.test.js                   # Unit test rà soát quy tắc lint và bảo mật tĩnh
│           ├── frontend.test.js                       # Unit test logic validate form và router client-side
│           ├── no-backdoor.test.js                    # Unit test bảo đảm không có backdoor hoặc hardcode secret
│           ├── nodeVersion.test.js                    # Unit test kiểm tra điều kiện tương thích phiên bản Node
│           ├── scope.test.js                          # Unit test logic hàm lọc dữ liệu scopeByOwner
│           └── station-schema.test.js                 # Unit test validate Zod schema trạm sạc (toạ độ lat/lng, tên, địa chỉ)
├── frontend/                                          # Giao diện người dùng web tĩnh (Static Web App)
│   ├── index.html                                     # Trang chủ ứng dụng web và vỏ bọc Single Page Application
│   ├── styles.css                                     # File stylesheet định dạng giao diện toàn bộ ứng dụng
│   ├── js/                                            # Thư mục mã nguồn JavaScript phía client
│   │   ├── api.js                                     # Tiện ích gọi API (fetch wrapper) xử lý header và credentials
│   │   ├── auth.js                                    # Quản lý trạng thái đăng nhập, đăng xuất và kiểm tra phiên client
│   │   ├── router.js                                  # Bộ điều hướng client-side, bảo vệ trang dựa trên trạng thái phiên
│   │   ├── theme.js                                   # Tiện ích chuyển đổi giao diện sáng/tối (Dark/Light mode)
│   │   ├── validate.js                                # Hàm validate tính hợp lệ của dữ liệu form nhập liệu
│   │   └── pages/                                     # JavaScript điều khiển logic riêng cho từng trang
│   │       ├── dashboard.js                           # Logic hiển thị thông tin bảng điều khiển chung
│   │       ├── login.js                               # Logic xử lý sự kiện form đăng nhập và thông báo khóa tạm thời
│   │       └── station-owner.js                       # Logic giao diện chủ trạm: bản đồ Leaflet, tạo/sửa trạm, Idempotency-Key
│   └── pages/                                         # Các trang giao diện HTML tương ứng theo vai trò người dùng
│       ├── accountant.html                            # Giao diện dành cho vai trò Kế toán (Accountant)
│       ├── admin.html                                 # Giao diện quản trị hệ thống dành cho Admin
│       ├── driver.html                                # Giao diện dành cho tài xế xe điện (Driver)
│       ├── operator.html                              # Giao diện dành cho nhân viên vận hành trạm sạc (Operator)
│       └── station-owner.html                         # Giao diện dành cho chủ đầu tư trạm sạc (Station Owner)
└── docs/                                              # Thư mục tài liệu dự án thuộc quyền quản lý của Tester/QA
    ├── integration/                                   # Thư mục tài liệu kiểm thử tích hợp giữa các hệ thống
    │   └── FRONTEND_BACKEND.md                        # Kịch bản & bằng chứng kiểm thử tích hợp Frontend ↔ Backend
    ├── stories/                                       # Thư mục tài liệu kiểm thử chi tiết theo từng User Story Jira
    │   ├── S-01.md                                    # Chi tiết kiểm thử Story S-01 (Khung ứng dụng & Database T-01)
    │   ├── S-02.md                                    # Chi tiết kiểm thử Story S-02 (Authentication & Lockout T-04, T-05)
    │   ├── S-03.md                                    # Chi tiết kiểm thử Story S-03 (RBAC Matrix & Ownership Isolation T-06, T-07)
    │   └── S-04.md                                    # Chi tiết kiểm thử Story S-04 (Chủ trạm tạo và sửa thông tin trạm T-08, T-09)
    ├── testing/                                       # Báo cáo và kế hoạch kiểm thử tổng hợp
    │   ├── BUG_REPORT.md                              # Hồ sơ chi tiết các lỗi mã nguồn và rào cản môi trường phát hiện được
    │   ├── REGRESSION_REPORT.md                       # Đánh giá hồi quy chức năng và so sánh hành vi trước - sau refactor
    │   ├── TEST_PLAN.md                               # Kế hoạch kiểm thử: phạm vi, mục tiêu, môi trường, thứ tự thực thi
    │   └── TEST_REPORT.md                             # Báo cáo tổng hợp kết quả kiểm thử tại mốc snapshot hiện tại
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
| **Root README** | `README.md` | Tài liệu giới thiệu dự án, hướng dẫn cài đặt môi trường, ma trận tài khoản seed và lệnh chạy | Nguồn đối chiếu Acceptance Criteria S-01, danh sách tài khoản seed mặc định và ma trận vai trò | Read-Only |
| **Lint Config** | `eslint.config.js` | Cấu hình ESLint flat config cho backend và frontend JavaScript | Dùng để chạy `npm run lint`, xác minh chuẩn cú pháp và quy tắc an toàn tĩnh | Read-Only |
| **Auth Cookies** | `*.cookie` (root) | Lưu trữ chuỗi cookie phiên làm việc thực tế (`token=...; HttpOnly`) của 5 vai trò (admin, driver, operator, owner_a, owner_b) | Dùng làm header `-b <role>.cookie` khi thực thi live test curl xác minh RBAC và cô lập dữ liệu | Read-Only |
| **CI/CD Workflow** | `.github/workflows/ci.yml` | Định nghĩa pipeline GitHub Actions tự động kiểm tra lint, test và build Docker | Giúp Tester đối chiếu môi trường CI với máy host và theo dõi trạng thái build | Read-Only |
| **Backend Environment** | `backend/src/config/env.js` | Nạp và validate các biến môi trường bằng Zod schema (`PORT`, `DATABASE_URL`, `JWT_SECRET`,...) | Trọng tâm kiểm thử `S01-NFR-01`: secrets nạp từ biến môi trường, fail-fast nếu thiếu | Read-Only |
| **Node Compatibility** | `backend/src/config/nodeVersion.js`| Kiểm tra phiên bản Node.js máy host (yêu cầu tối thiểu >= 22.7.0) | Điểm kiểm thử `UT-NODE-01` xác minh tính tương thích môi trường thực thi | Read-Only |
| **Database Pool & Tx** | `backend/src/db/pool.js`, `tx.js` | Quản lý kết nối PostgreSQL qua `pg.Pool` và hỗ trợ bọc database transaction | Đối tượng kiểm thử `TC-T01-04`: kết nối cơ sở dữ liệu an toàn, giải phóng connection đúng chuẩn | Read-Only |
| **Ownership Scope** | `backend/src/db/scope.js` | Chứa hàm dùng chung `scopeByOwner` áp đặt điều kiện `WHERE s.owner_id = ?` cho vai trò `STATION_OWNER` | Trọng tâm kiểm thử `S-03 / T-07` và `S03-NFR-01`: cô lập dữ liệu tại tầng truy vấn DB | Read-Only |
| **Database Migrations** | `backend/migrations/*.sql` | Chứa 4 cặp tệp SQL DDL migration forward/rollback (001 baseline, 002 throttle, 003 stations owner, 004 station management) | Đối tượng kiểm thử `T-01`, `T-04`, `T-07`, `T-08`: migration up/down trên DB test 5433 | Read-Only |
| **Password Security** | `backend/src/lib/password.js` | Cung cấp hàm băm và xác thực mật khẩu sử dụng duy nhất thuật toán **Argon2id** | Trọng tâm kiểm thử `S02-NFR-01`: loại bỏ hoàn toàn bcrypt, băm mật khẩu chuẩn Argon2id | Read-Only |
| **Role Matrix** | `backend/src/lib/roles.js`, `backend/src/security/permissions.js` | Định nghĩa 5 vai trò hệ thống và ma trận phân quyền chi tiết cho từng vai trò | Đối tượng kiểm thử `T-04-04` (đúng 5 roles) và `S03-AC-03` (phân quyền vai trò) | Read-Only |
| **Route Guard** | `backend/src/security/routeGuard.js` | Middleware bảo vệ route kiểm tra quyền hạn theo ma trận và cơ chế **Default Deny** (403 cho route chưa khai quyền) | Trọng tâm kiểm thử `S-03 / T-06`: chặn 403 khi thiếu quyền hoặc route chưa đăng ký | Read-Only |
| **Auth & Throttle** | `backend/src/modules/auth/` | Cung cấp router, service, schema đăng nhập và repository `login-throttle.repository.js` | Trọng tâm kiểm thử `S-02 / T-05`: khóa tạm thời 15 phút sau 5 lần sai, cấp cookie HttpOnly | Read-Only |
| **Audit Logging** | `backend/src/modules/audit/audit.repository.js` | Ghi nhận nhật ký an ninh vào bảng `audit_logs` khi có sự kiện vi phạm (`ACCESS_DENIED`) | Điểm kiểm thử `S03-AC-02` và `T07-02`: xác minh vết kiểm toán trong database | Read-Only |
| **Station & Charge Modules**| `backend/src/modules/stations/`, `charge-points/` | Cung cấp API quản lý trạm sạc (CRUD, toạ độ, idempotency), trụ sạc và `connection-registry.js` socket OCPP | Điểm kiểm thử quản lý trạm sạc S-04, phân quyền RBAC và Ownership Isolation giữa các Station Owner | Read-Only |
| **Error Handling** | `backend/src/middlewares/errorHandler.js` | Bắt lỗi tập trung và chuẩn hóa cấu trúc JSON response `{ error: { code, message, details } }` | Điểm kiểm thử tích hợp `TC-FB-04` và `UT-ERR-01` | Read-Only |
| **CSRF / Origin Guard** | `backend/src/middlewares/requireJson.js` | Bắt buộc `Content-Type: application/json` và kiểm tra header `Origin` khớp với `APP_ORIGIN` | Điểm kiểm thử tích hợp `TC-FB-11` phòng vệ tấn công CSRF | Read-Only |
| **Dev Test Suites** | `backend/tests/` | Toàn bộ bộ test tự động của Developer (acceptance, integration, unit) | Nguồn cung cấp bằng chứng tự động (Automated Evidence) khách quan cho Tester | Read-Only |
| **Frontend Core JS** | `frontend/js/api.js`, `auth.js`, `router.js`, `validate.js` | Mã nguồn điều hướng client, wrapper gọi fetch API, quản lý phiên cookie và kiểm tra form | Đối tượng kiểm thử tích hợp Frontend ↔ Backend `FB-01` đến `FB-11` | Read-Only |
| **Frontend Shell & Pages** | `frontend/index.html`, `frontend/pages/*.html`, `frontend/js/pages/*.js` | Trang Single Page Application, giao diện theo vai trò và logic điều khiển client (đăng nhập, dashboard, trạm sạc Leaflet) | Đối tượng kiểm thử giao diện UI, chuyển hướng theo vai trò sau đăng nhập, CRUD trạm và Idempotency-Key | Read-Only |
| **QA Documentation** | `docs/` | Toàn bộ hệ thống hồ sơ và tài liệu kiểm thử của dự án CSMS | Nơi Tester làm việc, thiết kế test, ghi nhận bằng chứng và báo cáo hiện trạng | **Tester Quản Lý** |

---

## 6. QA Documentation Map (Bản đồ tài liệu QA)

Hệ thống tài liệu kiểm định chất lượng của dự án được cấu trúc theo mô hình phân tầng chuẩn:

| Tệp tài liệu | Mục đích thực tế (Actual Purpose) | Khi nào cập nhật (Trigger) | Quan hệ với các tài liệu QA khác |
|:---|:---|:---|:---|
| **[`README.md`](./README.md)** | **AI Tester Entry Point & Router**: Điểm tiếp nhận nhiệm vụ đầu vào, hướng dẫn thứ tự đọc tài liệu và routing logic cho từng loại lệnh kiểm thử (E, S, T, Integration,...). | Khi có thay đổi về quy trình tiếp nhận nhiệm vụ hoặc bổ sung router mới. | Điều hướng AI Tester tra cứu đúng tài liệu nghiệp vụ; không chứa nội dung luật chi tiết. |
| **[`TESTER_STANDARD.md`](./TESTER_STANDARD.md)** | **Central Rulebook & Standards**: Bộ quy chuẩn trung tâm chứa toàn bộ nguyên tắc kiểm thử, luồng Requirement Testing vs General Review, mô hình E→S→T, đồ thị phụ thuộc đa cấp, Canonical Enums, 5-layers testing, tiêu chuẩn bằng chứng và an toàn. | Khi có sự thay đổi về chính sách kiểm thử hoặc cập nhật phiên bản quy chuẩn. | Là nguồn luật pháp lý cao nhất chi phối toàn bộ hoạt động của Tester. |
| **[`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md)** | **Verified Project Map (Project Facts)**: Bản đồ cấu trúc 144 mục trên filesystem đã xác minh, component mapping, đồ thị phụ thuộc thực tế, ánh xạ lịch sử kiểm thử và metadata snapshot. | Trước mỗi task kiểm thử mới (đồng bộ nếu filesystem thay đổi) hoặc khi có file/module mới. | Cung cấp sự thật cấu trúc (Project Facts) cho mọi tác vụ QA. |
| **[`TEST_INVENTORY.md`](./TEST_INVENTORY.md)** | **Verified Test Index (Test Facts)**: Danh mục toàn bộ 85 Test Case thực tế của dự án, tình trạng PASS/FAIL/BLOCKED, bằng chứng liên kết và mức độ xác minh (Verification). | Bắt buộc cập nhật ngay sau khi thực thi bất kỳ ca kiểm thử nào. | Cung cấp dữ liệu sự thật kiểm thử (Test Facts) cho báo cáo chất lượng. |
| **[`stories/S-01.md`](./stories/S-01.md)** | **Hồ sơ kiểm thử Story S-01**: Chi tiết AC/NFR, Task T-01, test cases và bằng chứng thực tế cho baseline container & PostgreSQL. | Khi Story S-01 hoặc Task T-01 có sự thay đổi hoặc chạy lại kiểm thử. | Phản ánh chi tiết kết quả cụm bài test baseline vào `TEST_INVENTORY.md`. |
| **[`stories/S-02.md`](./stories/S-02.md)** | **Hồ sơ kiểm thử Story S-02**: Chi tiết yêu cầu xác thực, Argon2id, lockout 15 phút, phiên cookie HttpOnly, phân rã Task T-04, T-05. | Khi tính năng đăng nhập, cơ chế khóa hoặc bảng users có cập nhật. | Kế thừa trạng thái của S-01; cung cấp cơ sở phiên làm việc cho S-03. |
| **[`stories/S-03.md`](./stories/S-03.md)** | **Hồ sơ kiểm thử Story S-03**: Chi tiết yêu cầu phân quyền RBAC, Route Guard Default Deny, cô lập dữ liệu theo Station Owner và ghi audit log (T-06, T-07). | Khi ma trận phân quyền, bộ lọc scopeByOwner hoặc API trạm sạc thay đổi. | Kế thừa phiên làm việc của S-02; cung cấp dữ liệu phân quyền cho Integration. |
| **[`stories/S-04.md`](./stories/S-04.md)** | **Hồ sơ kiểm thử Story S-04**: Chi tiết yêu cầu khai báo/sửa trạm, toạ độ thực dải hợp lệ, trạng thái chưa hoạt động, idempotency key chống double-click (T-08, T-09). | Khi nghiệp vụ quản lý trạm sạc, schema toạ độ hoặc giao diện chủ trạm thay đổi. | Kế thừa phân quyền S-03; cung cấp dữ liệu trạm sạc cho tìm trạm sạc S-47. |
| **[`integration/FRONTEND_BACKEND.md`](./integration/FRONTEND_BACKEND.md)** | **Hồ sơ kiểm thử tích hợp**: Kịch bản và bằng chứng kiểm thử giao tiếp toàn trình giữa Frontend Client và Backend API từ FB-01 đến FB-11. | Khi hợp đồng API, cấu hình fetch client hoặc chuỗi middleware Express thay đổi. | Tổng hợp kết quả tích hợp đa tầng giữa S-01, S-02 và S-03. |
| **[`testing/TEST_PLAN.md`](./testing/TEST_PLAN.md)** | **Kế hoạch kiểm thử tổng thể**: Chiến lược kiểm thử đa tầng, môi trường yêu cầu, tiêu chí Entry/Exit và phạm vi các đợt phát hành. | Khi bắt đầu sprint mới hoặc thay đổi phạm vi kiểm thử. | Định nghĩa phạm vi tổng thể cho các tài liệu kiểm thử chi tiết. |
| **[`testing/TEST_REPORT.md`](./testing/TEST_REPORT.md)** | **Báo cáo kết quả snapshot**: Báo cáo tổng hợp chất lượng tại mốc snapshot hiện tại, tỷ lệ PASS/FAIL, các rào cản môi trường. | Khi hoàn thành chu kỳ kiểm thử snapshot hoặc trước các mốc release. | Tổng hợp số liệu từ `TEST_INVENTORY.md`. |
| **[`testing/BUG_REPORT.md`](./testing/BUG_REPORT.md)** | **Hồ sơ lỗi & rào cản**: Lưu trữ chi tiết các lỗi mã nguồn (`CODE_DEFECT`) và rào cản môi trường/cấu hình (`ENVIRONMENT_BLOCKER`, `CONFIGURATION_PROBLEM`). | Ngay khi phát hiện lỗi hoặc khi lỗi được giải quyết. | Kết nối trực tiếp với các Test Case bị FAIL/BLOCKED trong `TEST_INVENTORY.md`. |
| **[`testing/REGRESSION_REPORT.md`](./testing/REGRESSION_REPORT.md)** | **Báo cáo kiểm thử hồi quy**: Ghi nhận kết quả chạy lại test cũ sau các đợt refactor và bảng so sánh hành vi giữa các phiên bản. | Sau mỗi đợt refactor mã nguồn hoặc sửa bug của Developer. | Nhận đầu vào từ bản đồ tác động `Impact / Regression Map`. |

---

## 7. Requirement → Task → Source Mapping

Ma trận liên kết từ Yêu cầu nghiệp vụ đến Mã nguồn thực tế và Bộ kiểm thử tương ứng:

| Epic cha | Jira Story | Task kỹ thuật | Tiêu chí chính (AC / NFR) | Thành phần mã nguồn thực tế (Source Mapping) | Dev Automated Tests (Evidence) | QA Test Document & Test IDs |
|:---:|:---|:---|:---|:---|:---|:---|
| **E-01** | **S-01** | **T-01** | `S01-AC-01`<br>`S01-NFR-01`<br>`S01-NFR-02`<br>`T01-01`..`05`<br>`T01-NFR-01` | • `docker-compose.yml`<br>• `backend/Dockerfile`<br>• `backend/src/config/env.js`<br>• `backend/src/config/nodeVersion.js`<br>• `backend/src/modules/health/health.routes.js`<br>• `backend/migrations/001_baseline.sql`<br>• `backend/src/db/migrate.js`, `pool.js`<br>• `frontend/index.html`<br>• `backend/scripts/create-admin.js` | • `tests/acceptance/S-01.baseline.test.js`<br>• `tests/integration/migrate.test.js`<br>• `tests/integration/create-admin.test.js`<br>• `tests/unit/env.test.js`<br>• `tests/unit/nodeVersion.test.js`<br>• `tests/unit/no-backdoor.test.js` | [`stories/S-01.md`](./stories/S-01.md)<br>(`TC-S01-01`..`03`, `TC-T01-01`..`04`, `UT-NODE-01`, `UT-BACKDOOR-01`, `UT-ENV-01`, `UT-ERR-01`, `IT-MIGRATE-01`, `IT-ADMIN-01`, `ACC-S01-01`, `MAN-S01-01`..`02`) |
| **E-02** | **S-02** | **T-04** | `T04-01`..`04`<br>`T04-NFR` | • `backend/migrations/001_baseline.sql`<br>• `backend/src/lib/roles.js`<br>• `backend/src/lib/password.js`<br>• `backend/src/modules/users/users.repository.js` | • `tests/acceptance/S-02.login.test.js`<br>• `tests/integration/auth.regression.test.js` | [`stories/S-02.md`](./stories/S-02.md)<br>(`TC-T04-01`..`05`) |
| **E-02** | **S-02** | **T-05** | `S02-AC-01`..`04`<br>`S02-NFR-01`<br>`S02-NFR-02`<br>`T05-01`..`03`<br>`T05-NFR-01`..`03` | • `backend/src/modules/auth/auth.routes.js`<br>• `backend/src/modules/auth/auth.service.js`<br>• `backend/src/modules/auth/auth.schema.js`<br>• `backend/src/modules/auth/login-throttle.repository.js`<br>• `backend/migrations/002_login_throttle_drop_user_lockout.sql`<br>• `backend/src/middlewares/authenticate.js`<br>• `frontend/js/auth.js`<br>• `frontend/js/pages/login.js`<br>• `frontend/index.html` | • `tests/acceptance/S-02.login.test.js`<br>• `tests/acceptance/S-02.login-ip.test.js`<br>• `tests/acceptance/S-02.frontend.test.js`<br>• `tests/integration/auth.regression.test.js` | [`stories/S-02.md`](./stories/S-02.md)<br>(`TC-S02-01`..`04`, `TC-T05-01`..`04`, `ACC-S02-01`..`04`, `IT-AUTH-01`) |
| **E-02** | **S-03** | **T-06** | `S03-AC-03`<br>`S03-AC-04`<br>`T06-01`<br>`T06-02` | • `backend/src/security/permissions.js`<br>• `backend/src/security/routeGuard.js`<br>• `backend/src/app.js`<br>• `frontend/js/router.js` | • `tests/acceptance/S-03.rbac.test.js`<br>• `tests/acceptance/S-03.rbac-matrix.test.js`<br>• `tests/acceptance/S-03.route-guard.test.js`<br>• `tests/acceptance/S-03.accounts.test.js` | [`stories/S-03.md`](./stories/S-03.md)<br>(`TC-S03-03`, `TC-S03-04`, `TC-T06-01`, `TC-T06-02`) |
| **E-02** | **S-03** | **T-07** | `S03-AC-01`<br>`S03-AC-02`<br>`S03-NFR-01`<br>`T07-01`..`03`<br>`T07-NFR` | • `backend/src/db/scope.js` (`scopeByOwner`)<br>• `backend/src/modules/stations/`<br>• `backend/src/modules/charge-points/`<br>• `backend/src/modules/audit/audit.repository.js`<br>• `backend/migrations/003_stations_owner.sql`<br>• `frontend/pages/station-owner.html` | • `tests/unit/scope.test.js`<br>• `tests/acceptance/S-03.rbac.test.js`<br>• `tests/acceptance/S-03.accounts.test.js` | [`stories/S-03.md`](./stories/S-03.md)<br>(`TC-S03-01`, `TC-S03-02`, `TC-T07-01`..`03`) |
| **E-03** | **S-04** | **T-08, T-09** | `S04-AC-01`..`04`<br>`S04-NFR-01`<br>`T08-01`<br>`T08-NFR-01`<br>`T09-01`<br>`T09-NFR-01` | • `backend/migrations/004_station_management.sql`<br>• `backend/src/modules/stations/stations.routes.js`<br>• `backend/src/modules/stations/stations.service.js`<br>• `backend/src/modules/stations/stations.schema.js`<br>• `backend/src/modules/stations/stations.repository.js`<br>• `frontend/pages/station-owner.html`<br>• `frontend/js/pages/station-owner.js` | • `tests/acceptance/S-04.station-management.test.js`<br>• `tests/unit/station-schema.test.js`<br>• `tests/integration/migrate.test.js` | [`stories/S-04.md`](./stories/S-04.md)<br>(`TC-S04-01`..`07`, `TC-T08-01`..`03`, `TC-T09-01`..`03`) |
| **Cross-Epic** | **Integration** | **FB-01 .. FB-11** | Hợp đồng API, Cookie credentials, Error envelope, CSRF guard | • `frontend/js/api.js`<br>• `frontend/js/auth.js`<br>• `frontend/js/router.js`<br>• `frontend/js/validate.js`<br>• `backend/src/app.js`<br>• `backend/src/middlewares/errorHandler.js`<br>• `backend/src/middlewares/requireJson.js` | • `tests/unit/frontend.test.js`<br>• `tests/acceptance/S-02.frontend.test.js`<br>• `tests/acceptance/S-03.csrf.test.js` | [`integration/FRONTEND_BACKEND.md`](./integration/FRONTEND_BACKEND.md)<br>(`TC-FB-01` đến `TC-FB-11`) |

---

## 8. Dependency Map (Bản đồ phụ thuộc hệ thống)

> **Lưu ý quy chuẩn**: Quan hệ phụ thuộc (Dependency) là quan hệ điều kiện tiên quyết (Prerequisite), hoàn toàn tách biệt với quan hệ phân cấp (Hierarchy). Quy tắc phân tích phụ thuộc được quy định tại [`TESTER_STANDARD.md`](./TESTER_STANDARD.md#6-quy-tắc-phân-tích-phụ-thuộc-dependency-rules).

### 8.1. Story → Story Dependency
- **`S-01`**: Cột mốc khởi nguyên (Root Baseline). Không phụ thuộc Story nào khác.
- **`S-02`**: Phụ thuộc trực tiếp vào **`S-01`** (Cần cụm container app + database và migration schema baseline hoạt động để lưu bảng users).
- **`S-03`**: Phụ thuộc trực tiếp vào **`S-02`** (Cần phiên làm việc và danh tính đã xác thực của người dùng để kiểm tra phân quyền RBAC và quyền sở hữu).
- **`S-04`**: Phụ thuộc trực tiếp vào **`S-03`** (Cần vai trò `STATION_OWNER` và cơ chế cô lập dữ liệu đã xác thực để tạo và sửa trạm của chính mình).
- **`S-47`** *(Downstream)*: Phụ thuộc vào **`S-04`** (Tìm trạm sạc gần phụ thuộc vào toạ độ số thực hợp lệ được lưu trữ tại S-04).
- **`S-05 / K-01`** *(Downstream)*: Phụ thuộc vào **`S-04`** (Khai báo trụ sạc phụ thuộc vào trạm sạc đã được tạo trước).
- **`Integration (FB-01..11)`**: Phụ thuộc đồng thời vào **`S-01`**, **`S-02`**, **`S-03`** và **`S-04`** (Đòi hỏi runtime sẵn sàng, xác thực cookie hoạt động, route guard áp dụng và API trạm sạc sẵn sàng).

### 8.2. Task → Task Dependency
- **`T-01`** (Khởi tạo DB & Container) $\longrightarrow$ **Độc lập ban đầu**.
- **`T-04`** (Bảng users, roles & seed) $\longrightarrow$ Phụ thuộc vào **`T-01`** (yêu cầu PostgreSQL connection pool và runner migration `migrate.js`).
- **`T-05`** (Login, session cookie & throttle) $\longrightarrow$ Phụ thuộc vào **`T-04`** (yêu cầu có bảng `users`, 5 vai trò trong `roles`, và mật khẩu băm Argon2id).
- **`T-06`** (Route Guard & Default Deny) $\longrightarrow$ Phụ thuộc vào **`T-05`** (yêu cầu middleware `authenticate.js` trích xuất thông tin `req.user`).
- **`T-07`** (Ownership Scope & Audit Log) $\longrightarrow$ Phụ thuộc vào **`T-06`** (yêu cầu vượt qua bước kiểm tra vai trò tại route guard trước khi áp đặt điều kiện lọc sở hữu `scopeByOwner`).
- **`T-08`** (Khai báo trạm, toạ độ & schema) $\longrightarrow$ Phụ thuộc vào **`T-07`** (yêu cầu bảng `stations` và cột `owner_id` kết hợp với `scopeByOwner`).
- **`T-09`** (Sửa trạm, danh sách trạm & chống double-click) $\longrightarrow$ Phụ thuộc vào **`T-08`** (yêu cầu endpoint tạo trạm và bảng `station_idempotency_keys` hoạt động).

### 8.3. Test → Prerequisite Dependency
- **`TC-S01-01`** $\longrightarrow$ Tiền đề: Docker Desktop đang chạy, cổng 3000 và 5432 chưa bị chiếm dụng.
- **`TC-S02-01`..`03`** $\longrightarrow$ Tiền đề: Container `app` và `db` ở trạng thái healthy; database đã seed tài khoản test (`admin@csms.local`,...).
- **`TC-S03-01`..`02`** $\longrightarrow$ Tiền đề: Đã chạy migration 003, đã nạp phiên hợp lệ qua file cookie (`owner_a.cookie`, `owner_b.cookie`).
- **`TC-S04-01`..`04`** $\longrightarrow$ Tiền đề: Đã chạy migration 004, đăng nhập vai trò `STATION_OWNER`, có header `Idempotency-Key` khi tạo trạm.
- **`TC-FB-01`..`11`** $\longrightarrow$ Tiền đề: Express server lắng nghe trên port 3000, serve thư mục tĩnh `frontend/`.

### 8.4. Source → Dependent Component
- `backend/src/config/env.js` $\longrightarrow$ Ảnh hưởng toàn bộ ứng dụng: `pool.js`, `app.js`, `server.js`.
- `backend/src/lib/password.js` $\longrightarrow$ Ảnh hưởng trực tiếp: `create-admin.js`, `auth.service.js`, `users.service.js`.
- `backend/src/middlewares/authenticate.js` $\longrightarrow$ Ảnh hưởng trực tiếp: mọi route được bảo vệ trong `app.js`.
- `backend/src/db/scope.js` $\longrightarrow$ Ảnh hưởng trực tiếp: `stations.repository.js`, `charge-points.repository.js`.
- `backend/src/modules/stations/stations.service.js` $\longrightarrow$ Ảnh hưởng trực tiếp: API CRUD trạm sạc, phân quyền owner.

---

## 9. Source → Historical Test Mapping (Bản đồ ánh xạ lịch sử kiểm thử)

Bảng đối chiếu phục vụ tra cứu nhanh các bài test lịch sử bị ảnh hưởng khi một thành phần mã nguồn có sự thay đổi:

| Thành phần mã nguồn (Source Component) | Test Case ID | Story liên kết | Task liên kết | Tiêu chí yêu cầu | Trạng thái lịch sử | Snapshot xác minh |
|:---|:---|:---:|:---:|:---|:---:|:---:|
| `backend/src/config/env.js` | `TC-S01-02`<br>`UT-ENV-01` | S-01 | T-01 | `S01-NFR-01`<br>`T01-NFR-01` | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/src/config/nodeVersion.js` | `UT-NODE-01` | S-01 | T-01 | Node >= 22.7 | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/migrations/001_baseline.sql` | `TC-T01-01`<br>`TC-T01-03`<br>`TC-T04-01`..`05`<br>`IT-MIGRATE-01` | S-01<br>S-02 | T-01<br>T-04 | `T01-01`..`05`<br>`T04-01`..`05` | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/migrations/002_login_throttle_...` | `TC-S02-03`<br>`TC-T05-02`..`03` | S-02 | T-05 | `S02-AC-03`<br>`T05-02`..`03` | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/migrations/003_stations_owner.sql` | `TC-S03-01`<br>`TC-T07-01` | S-03 | T-07 | `S03-AC-01`<br>`T07-01` | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/src/lib/password.js` | `TC-S02-01`<br>`TC-T04-NFR` | S-02 | T-04 | `S02-NFR-01`<br>`T04-NFR` | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/src/modules/auth/auth.service.js` | `TC-S02-01`..`02`<br>`ACC-S02-01`<br>`IT-AUTH-01` | S-02 | T-05 | `S02-AC-01`..`02`<br>`T05-01` | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/src/modules/auth/login-throttle...` | `TC-S02-03`<br>`ACC-S02-02`<br>`TC-T05-02` | S-02 | T-05 | `S02-AC-03`<br>`S02-NFR-02` | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/src/security/routeGuard.js` | `TC-S03-03`<br>`TC-T06-02`<br>`TC-S03-04` | S-03 | T-06 | `S03-AC-03`<br>`T06-02`<br>`S03-AC-04` | **PASS**<br>**PASS**<br>**NOT VERIFIED** | 24/09/2026 (`4bc5758`) |
| `backend/src/db/scope.js` | `TC-S03-01`<br>`TC-T07-01`<br>`TC-T07-03` | S-03 | T-07 | `S03-AC-01`<br>`S03-NFR-01`<br>`T07-NFR` | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/src/modules/audit/audit.repo...` | `TC-S03-02`<br>`TC-T07-02` | S-03 | T-07 | `S03-AC-02`<br>`T07-02` | **PASS** | 24/09/2026 (`4bc5758`) |
| `frontend/js/api.js` | `TC-FB-01`<br>`TC-S02-04` | Integration<br>S-02 | FB-01<br>S-02 | `FB-01`<br>`S02-AC-04` | **PASS** | 24/09/2026 (`4bc5758`) |
| `frontend/js/router.js` | `TC-FB-06`<br>`TC-S02-04` | Integration<br>S-02 | FB-06<br>S-02 | `FB-06`<br>`S02-AC-04` | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/src/middlewares/errorHandler.js` | `TC-FB-04`<br>`UT-ERR-01` | Integration<br>S-01 | FB-04<br>T-01 | `FB-04`<br>Standard Error | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/src/middlewares/requireJson.js` | `TC-FB-11` | Integration | FB-11 | `FB-11`<br>CSRF Defense | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/migrations/004_station_management.sql` | `TC-S04-01`<br>`TC-T08-01`<br>`IT-MIGRATE-01` | S-04 | T-08 | `S04-AC-01`<br>`T08-01` | **PASS** | 27/09/2026 (`4ab9f0f`) |
| `backend/src/modules/stations/stations.service.js` | `TC-S04-01`..`04`<br>`TC-T08-01`..`03`<br>`TC-T09-01`..`03` | S-04 | T-08<br>T-09 | `S04-AC-01`..`04`<br>`S04-NFR-01` | **PASS** | 27/09/2026 (`4ab9f0f`) |
| `backend/src/modules/stations/stations.schema.js` | `TC-S04-02`<br>`TC-T08-02`<br>`TC-T08-NFR-01` | S-04 | T-08 | `S04-AC-02`<br>`S04-NFR-01` | **PASS** | 27/09/2026 (`4ab9f0f`) |
| `backend/src/modules/charge-points/connection-registry.js` | `UT-CP-01` | S-05 (Prep) | K-01 | OCPP Socket Registry | **PASS** | 27/09/2026 (`4ab9f0f`) |
| `frontend/js/pages/station-owner.js` | `TC-S04-03`<br>`TC-S04-04`<br>`TC-T08-03`<br>`TC-T09-02` | S-04 | T-08<br>T-09 | `S04-AC-03`<br>`S04-AC-04` | **PASS** | 27/09/2026 (`4ab9f0f`) |

---

## 10. Project-Specific Hierarchy & Traceability Facts (Phân cấp nhiệm vụ & Thực tế truy vết dự án)

> **Lưu ý quy chuẩn**: Toàn bộ quy tắc chuẩn mực về Mô hình truy vết 4 tầng, Canonical Enums và cơ chế State Transition được quản lý tập trung tại [`TESTER_STANDARD.md`](./TESTER_STANDARD.md#7-mô-hình-truy-vết-chuẩn-canonical-traceability-model). Phần này chỉ lưu trữ các sự thật cấu trúc (Project Facts) của dự án CSMS.

### 10.1. Project Hierarchy Facts (Cây phân cấp nhiệm vụ thực tế của dự án CSMS)
Thực tế mã nguồn và hồ sơ Jira chính thức từ Product Backlog của PO (Mentor Lê Đình Tuấn) được phân cấp theo mô hình 3 tầng chuẩn $E \rightarrow S \rightarrow T$:

```text
CSMS-CORE (Khối nền tảng hạ tầng, bảo mật và quản lý trạm sạc CSMS)
├── E-01: Hạ tầng, CI/CD và môi trường [Must]
│   │   (Mục tiêu: Mọi thành viên chạy được dự án và 20 trụ ảo bằng 1 lệnh; CI chặn merge kịch bản thất bại)
│   └── S-01: Khung ứng dụng chạy được trên máy cá nhân [Must | 3 SP]
│       └── T-01: Dựng khung dự án và kết nối cơ sở dữ liệu (docker-compose, postgres, migration 001)
├── E-02: Tài khoản, đối tác và phân quyền [Must]
│   │   (Mục tiêu: 5 vai trò; Chủ trạm A không xem được trạm Chủ trạm B; Route chưa khai quyền bị chặn mặc định)
│   ├── S-02: Đăng nhập bằng email và mật khẩu, khoá tạm khi sai nhiều lần [Must | 2 SP]
│   │   ├── T-04: Bảng users, roles kèm migration 001, seed 5 vai trò và mật khẩu argon2id
│   │   └── T-05: Form đăng nhập, tạo phiên cookie httpOnly, đếm lần sai và khoá tạm 15 phút
│   └── S-03: Mỗi vai trò chỉ thấy và thao tác được phần việc của mình [Must | 2 SP]
│       ├── T-06: Middleware kiểm vai trò routeGuard, mặc định từ chối route chưa khai quyền
│       └── T-07: Lọc theo quyền sở hữu ở tầng truy vấn (scopeByOwner) và test 403 bằng curl
└── E-03: Trạm sạc, trụ và đầu nối [Must]
    │   (Mục tiêu: Cây dữ liệu 3 tầng trạm/trụ/đầu nối; mã trụ duy nhất; trạm tạm ngừng không nhận phiên mới)
    ├── S-04: Chủ trạm tạo và sửa thông tin trạm sạc [Must | 2 SP]
    │   ├── T-08: Bảng stations kèm migration 004 và liên kết chủ sở hữu (toạ độ số thực, index owner_id)
    │   └── T-09: Màn hình tạo, sửa và danh sách trạm của chủ trạm (idempotency key chống double-click)
    └── S-05: Khai báo số đầu nối từ 1 đến 4 cho mỗi trụ [Sprint 1 Backlog - K-01 / S-05]
```

### 10.2. Project Traceability Facts (Thực tế liên kết truy vết hai chiều)
- **Chiều thuận (Forward Traceability)**: Toàn bộ 4 Story (`S-01` đến `S-04`) và 7 Technical Task (`T-01`, `T-04`..`T-09`) đều đã được ánh xạ chính xác đến từng file mã nguồn hiện thực tại [Mục 7 (Requirement → Task → Source Mapping)](#7-requirement--task--source-mapping) và chỉ mục chi tiết 85 Test Case tại [`docs/TEST_INVENTORY.md`](./TEST_INVENTORY.md).
- **Chiều nghịch (Reverse Traceability)**: Khi có lỗi phát sinh hoặc mã nguồn thay đổi, Tester tra cứu ngược từ component bị ảnh hưởng tại [Mục 9 (Source → Historical Test Mapping)](#9-source--historical-test-mapping-bản-đồ-ánh-xạ-lịch-sử-kiểm-thử) và [Mục 11 (Impact / Regression Map)](#11-impact--regression-map-bản-đồ-phân-tích-tác-động--hồi-quy) để xác định danh sách bài test lịch sử cần chạy lại.

---

## 11. Impact / Regression Map (Bản đồ phân tích tác động & hồi quy)

Khi một thành phần mã nguồn dùng chung bị sửa đổi, Tester tra cứu bảng sau để xác định vùng bị ảnh hưởng và kịch bản hồi quy cần chạy lại:

| Thành phần sửa đổi | Vùng ảnh hưởng trực tiếp (Direct Impact) | Các Story / Task bị tác động | Bộ kiểm thử cần chạy lại (Regression Suite) |
|:---|:---|:---:|:---|
| **`backend/src/config/env.js`** | Khởi động server, kết nối DB, JWT secret, CORS | S-01, S-02, S-03, Integration | `tests/unit/env.test.js`<br>`tests/acceptance/S-01.baseline.test.js`<br>`curl http://localhost:3000/api/health` |
| **`backend/src/lib/password.js`** | Mã hóa Argon2id, kiểm tra mật khẩu khi login | S-02 (T-04, T-05) | `tests/acceptance/S-02.login.test.js`<br>`tests/integration/auth.regression.test.js`<br>`create-admin.test.js` |
| **`backend/src/middlewares/authenticate.js`** | Giải mã cookie token, nạp `req.user` | S-02, S-03, Integration | `tests/acceptance/S-02.frontend.test.js`<br>`tests/acceptance/S-03.rbac.test.js`<br>`TC-FB-03`, `TC-FB-05` |
| **`backend/src/security/routeGuard.js`** | Kiểm soát route, chặn 403 Default Deny | S-03 (T-06) | `tests/acceptance/S-03.route-guard.test.js`<br>`tests/acceptance/S-03.rbac-matrix.test.js` |
| **`backend/src/db/scope.js`** | Lọc dữ liệu `WHERE s.owner_id = ?` cho Owner | S-03 (T-07) | `tests/unit/scope.test.js`<br>`tests/acceptance/S-03.rbac.test.js`<br>Live curl giữa Owner A và Owner B |
| **`backend/migrations/*.sql`** | Cấu trúc bảng, ràng buộc khóa ngoại, index, bảng idempotency | S-01, S-02, S-03, S-04 | `tests/integration/migrate.test.js`<br>Chạy lại migration up và rollback trên DB test 5433 |
| **`backend/src/modules/stations/stations.service.js`** | Nghiệp vụ trạm sạc, toạ độ, gán owner_id, kiểm tra idempotency | S-03, S-04 (T-08, T-09) | `tests/acceptance/S-04.station-management.test.js`<br>`tests/acceptance/S-03.rbac.test.js` |
| **`frontend/js/api.js`** | Fetch API wrapper, headers, credentials | Toàn bộ Frontend Integration | `tests/unit/frontend.test.js`<br>`TC-FB-01`, `TC-FB-04`, `TC-FB-11` |
| **`frontend/js/router.js`** | Điều hướng theo vai trò, redirect 401 | S-02, S-03, Integration | `tests/unit/frontend.test.js`<br>`TC-FB-06`, `TC-S02-04` |
| **`frontend/js/pages/station-owner.js`** | Form khai báo/sửa trạm, bản đồ Leaflet, Idempotency-Key header | S-04 (T-08, T-09) | `tests/acceptance/S-04.station-management.test.js`<br>Kiểm tra form submit và render danh sách trạm |

> **Nguyên tắc an toàn**: Không kết luận nguyên nhân gốc rễ (Root Cause) chỉ dựa trên bản đồ tác động này. Mọi kết luận đều phải được chứng minh qua bằng chứng kiểm thử thực tế.

---

## 12. Current Structure Gaps (Các khoảng trống cấu trúc hiện tại)

Các thành phần mã nguồn hoặc chức năng hiện tại chưa được hiện thực hóa đầy đủ hoặc chưa đủ điều kiện để xác minh:

1. **`S03-AC-04` / `TC-T06-01` (Route chưa khai báo quyền trả về HTTP 403 cho Admin)**:
   - *Hiện trạng*: Trong mã nguồn hiện tại, 100% các route nghiệp vụ đều đã được khai báo quyền hạn tường minh trong `permissions.js`. Không có route nào bị bỏ quên.
   - *Đánh giá an toàn*: **NOT VERIFIED**. Tuân thủ nghiêm ngặt quy tắc Tester: Không tự ý thêm route rác vào mã nguồn để kiểm thử tính năng này.
2. **Giao diện UI quản lý trụ sạc trên Frontend (`frontend/pages/operator.html`, `charge-points`)**:
   - *Hiện trạng*: Giao diện quản lý trạm sạc của Station Owner (`frontend/pages/station-owner.html` và `frontend/js/pages/station-owner.js`) đã được hiện thực và kiểm chứng hoàn chỉnh ở Story S-04. Tuy nhiên, các màn hình cấu hình chi tiết trụ sạc (Charge Points) và kết nối OCPP WebSocket cho Operator chưa được nối giao diện đầy đủ.
   - *Đánh giá an toàn*: **PARTIALLY IMPLEMENTED / PENDING NEXT SPRINT**. Đã xác minh được API qua repository/service backend và unit test connection-registry, UI quản lý trụ sạc chuyển sang theo dõi cho Sprint tiếp theo (S-05 / K-01).
3. **Môi trường máy host không có sẵn `supertest` toàn cục**:
   - *Hiện trạng*: `supertest` được khai báo trong `backend/package.json` devDependencies. Một số test case acceptance cần chạy trong môi trường đã `npm install` đầy đủ hoặc bên trong container.
   - *Đánh giá*: Đã có bằng chứng thực thi thành công từ snapshot ngày 24/09/2026 và 27/09/2026.

---

## 13. Structure Verification Metadata (Thông tin kiểm chứng cấu trúc)

- **Structure Status**: **VERIFIED** (Đã đối chiếu 100% khớp với filesystem thực tế).
- **Snapshot Date**: 27/09/2026.
- **Git Commit Hash**: `4ab9f0f11f3b037f6e991984002243a0d80884d0`.
- **Git Branch**: `main`.
- **Operating System Environment**: Windows 11 x64, Node.js v24.19.0, npm 11.17.0.
- **Container Environment**: Docker Desktop (PostgreSQL 16 alpine trên ports 5432, 5433; App container trên port 3000).
- **Last Verification Timestamp**: `27/09/2026 17:48:00 +07:00`.
