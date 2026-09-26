# Project Structure

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Người thực hiện**: TESTER / QA ANALYST  
> **Snapshot Date**: 26/09/2026  
> **Git Commit**: `45de7c685f48c28b96f797b1f55965d4125d44e9` (nhánh `feature/update-csms-docs`)  
> **Structure Status**: **VERIFIED**  
> **Tài liệu tham chiếu**: [`docs/testing/README.md`](./README.md) (AI TESTER OPERATING MANUAL)  

---

## 1. Mục đích của tài liệu

Tài liệu này là **VERIFIED PROJECT MAP** (Bản đồ dự án đã qua xác minh thực tế) dành riêng cho AI Tester / QA Analyst:
- Cung cấp cái nhìn toàn diện, chuẩn xác và tức thì về cấu trúc thư mục, tệp tin và các thành phần mã nguồn của dự án CSMS.
- Xác định quyền sở hữu tài nguyên và ranh giới kiểm thử: Tester chỉ quản lý `docs/testing/` và đọc-kiểm tra (read-only) toàn bộ các thành phần khác.
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
| **`docs/`**<br>(đặc biệt `docs/testing/`) | **CREATE / EDIT / DELETE**<br>(Toàn quyền quản trị) | Là khu vực duy nhất Tester được phép tạo mới, chỉnh sửa, cập nhật hoặc dọn dẹp các tệp hồ sơ kiểm thử, test plan, inventory, report, bug và regression. |
| **`backend/`** | **READ-ONLY**<br>(Chỉ đọc & Phân tích) | Tuyệt đối không sửa source code, business logic, controller, service, middleware, schema hay test code của Developer. |
| **`frontend/`** | **READ-ONLY**<br>(Chỉ đọc & Phân tích) | Tuyệt đối không sửa đổi HTML, CSS, client scripts JS (`api.js`, `router.js`, `auth.js`,...). |
| **`database / migrations`** | **READ-ONLY**<br>(Chỉ kiểm tra DDL & Chạy test) | Tuyệt đối không sửa file SQL migration. Chỉ thực thi migration runner trên DB test để nghiệm thu. |
| **`Docker / Configuration`** | **READ-ONLY**<br>(Chỉ đọc để kiểm chứng NFR) | Tuyệt đối không sửa `docker-compose.yml`, `Dockerfile`, `.env`, `.env.example`, `package.json`, `eslint.config.js`. |
| **`Session Cookies (*.cookie)`** | **READ-ONLY**<br>(Chỉ nạp phiên kiểm thử) | Sử dụng làm dữ liệu phiên khi chạy kiểm thử live curl, không can thiệp nội dung file. |
| **`Git History & CI/CD`** | **READ-ONLY**<br>(Tuyệt đối không can thiệp) | Không commit, không push, không checkout/switch branch, không sửa đổi workflow `.github/`. |

---

## 4. Verified Project Tree (Cây thư mục đã xác minh)

Toàn bộ cây thư mục thực tế của dự án `Charging-Station-Management-System-CSMS-` đã được quét và kiểm chứng chi tiết:

```text
Charging-Station-Management-System-CSMS-/
├── .dockerignore                                      # Danh sách file/thư mục loại trừ khi Docker build image
├── .gitignore                                         # Danh sách file/thư mục Git không theo dõi (node_modules, .env,...)
├── .github/                                           # Thư mục cấu hình GitHub (CI/CD workflows và pull request templates)
│   ├── pull_request_template.md                       # Mẫu checklist tiêu chuẩn khi tạo Pull Request
│   └── workflows/                                     # Thư mục định nghĩa các pipeline tự động hóa GitHub Actions
│       └── ci.yml                                     # Pipeline tự động chạy lint, unit test, build container trên CI
├── admin.cookie                                       # Dữ liệu cookie phiên đã xác thực của tài khoản Admin (dùng cho curl test)
├── docker-compose.yml                                 # Cấu hình khởi chạy cụm container (db:5432, db_test:5433, app:3000)
├── driver2.cookie                                     # Dữ liệu cookie phiên của tài khoản Driver 2 (dùng cho curl test)
├── eslint.config.js                                   # Cấu hình kiểm tra cú pháp và quy chuẩn mã nguồn tĩnh (ESLint flat config)
├── operator.cookie                                    # Dữ liệu cookie phiên của tài khoản Operator (dùng cho curl test)
├── owner_a.cookie                                     # Dữ liệu cookie phiên của Station Owner A (dùng kiểm thử cô lập dữ liệu)
├── owner_b.cookie                                     # Dữ liệu cookie phiên của Station Owner B (dùng kiểm thử cô lập dữ liệu)
├── README.md                                          # Tài liệu gốc dự án: giới thiệu, hướng dẫn cài đặt, tài khoản seed
├── backend/                                           # Mã nguồn và cấu hình dịch vụ Backend (Node.js / Express)
│   ├── .env                                           # File biến môi trường runtime cục bộ (DB connection, JWT secret,...)
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
│   │   └── 003_stations_owner.down.sql                # Rollback quan hệ sở hữu trạm sạc
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
│   │   │   │   └── charge-points.service.js           # Nghiệp vụ quản lý trạng thái, công suất của trụ sạc
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
│       │   └── S-03.trust-proxy.test.js               # Kiểm tra xử lý IP phía sau reverse proxy (trust proxy)
│       ├── helpers/                                   # Tiện ích hỗ trợ thiết lập môi trường test
│       │   ├── app.js                                 # Helper khởi tạo instance ứng dụng phục vụ test
│       │   ├── auth.js                                # Helper tạo token/cookie giả lập phiên đăng nhập cho test
│       │   └── db.js                                  # Helper kết nối, dọn dẹp và reset cơ sở dữ liệu test
│       ├── integration/                               # Kiểm thử tích hợp giữa các thành phần backend
│       │   ├── auth.regression.test.js                # Kiểm tra hồi quy cơ chế xác thực và bảo mật phiên
│       │   ├── create-admin.test.js                   # Kiểm tra script tạo tài khoản admin CLI
│       │   └── migrate.test.js                        # Kiểm tra tiến trình chạy migration và rollback cơ sở dữ liệu
│       └── unit/                                      # Kiểm thử đơn vị độc lập từng hàm logic
│           ├── env.test.js                            # Unit test kiểm tra parse và validate biến môi trường
│           ├── errorHandler.test.js                   # Unit test kiểm tra middleware xử lý lỗi
│           ├── eslint-guard.test.js                   # Unit test rà soát quy tắc lint và bảo mật tĩnh
│           ├── frontend.test.js                       # Unit test logic validate form và router client-side
│           ├── no-backdoor.test.js                    # Unit test bảo đảm không có backdoor hoặc hardcode secret
│           ├── nodeVersion.test.js                    # Unit test kiểm tra điều kiện tương thích phiên bản Node
│           └── scope.test.js                          # Unit test logic hàm lọc dữ liệu scopeByOwner
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
│   │       └── login.js                               # Logic xử lý sự kiện form đăng nhập và thông báo khóa tạm thời
│   └── pages/                                         # Các trang giao diện HTML tương ứng theo vai trò người dùng
│       ├── accountant.html                            # Giao diện dành cho vai trò Kế toán (Accountant)
│       ├── admin.html                                 # Giao diện quản trị hệ thống dành cho Admin
│       ├── driver.html                                # Giao diện dành cho tài xế xe điện (Driver)
│       ├── operator.html                              # Giao diện dành cho nhân viên vận hành trạm sạc (Operator)
│       └── station-owner.html                         # Giao diện dành cho chủ đầu tư trạm sạc (Station Owner)
└── docs/                                              # Thư mục tài liệu dự án thuộc quyền quản lý của Tester/QA
    └── testing/                                       # Toàn bộ hệ thống hồ sơ và tài liệu kiểm thử của dự án CSMS
        ├── BUG_REPORT.md                              # Hồ sơ chi tiết các lỗi mã nguồn và rào cản môi trường phát hiện được
        ├── PROJECT_STRUCTURE.md                       # Bản đồ cấu trúc toàn bộ dự án và hệ thống tài liệu QA (file này)
        ├── README.md                                  # Hướng dẫn tổng quan sử dụng tài liệu kiểm thử và quy ước trạng thái
        ├── REGRESSION_REPORT.md                       # Đánh giá hồi quy chức năng và so sánh hành vi trước - sau refactor
        ├── TEST_INVENTORY.md                          # Bảng kê tập trung danh mục toàn bộ test case và trạng thái thực thi
        ├── TEST_PLAN.md                               # Kế hoạch kiểm thử: phạm vi, mục tiêu, môi trường, thứ tự thực thi
        ├── TEST_REPORT.md                             # Báo cáo tổng hợp kết quả kiểm thử tại mốc snapshot hiện tại
        ├── integration/                               # Thư mục tài liệu kiểm thử tích hợp giữa các hệ thống
        │   └── FRONTEND_BACKEND.md                    # Tài liệu kịch bản & bằng chứng kiểm thử tích hợp Frontend ↔ Backend
        └── stories/                                   # Thư mục tài liệu kiểm thử chi tiết theo từng User Story Jira
            ├── S-01.md                                # Chi tiết kiểm thử Story S-01 (Khung ứng dụng & Database T-01)
            ├── S-02.md                                # Chi tiết kiểm thử Story S-02 (Authentication & Lockout T-04, T-05)
            └── S-03.md                                # Chi tiết kiểm thử Story S-03 (RBAC Matrix & Ownership Isolation T-06, T-07)
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
| **Database Migrations** | `backend/migrations/*.sql` | Chứa 3 cặp tệp SQL DDL migration forward/rollback (001 baseline, 002 throttle, 003 stations owner) | Đối tượng kiểm thử `T-01`, `T-04`, `T-07`: migration up/down trên DB test 5433 | Read-Only |
| **Password Security** | `backend/src/lib/password.js` | Cung cấp hàm băm và xác thực mật khẩu sử dụng duy nhất thuật toán **Argon2id** | Trọng tâm kiểm thử `S02-NFR-01`: loại bỏ hoàn toàn bcrypt, băm mật khẩu chuẩn Argon2id | Read-Only |
| **Role Matrix** | `backend/src/lib/roles.js`, `backend/src/security/permissions.js` | Định nghĩa 5 vai trò hệ thống và ma trận phân quyền chi tiết cho từng vai trò | Đối tượng kiểm thử `T-04-04` (đúng 5 roles) và `S03-AC-03` (phân quyền vai trò) | Read-Only |
| **Route Guard** | `backend/src/security/routeGuard.js` | Middleware bảo vệ route kiểm tra quyền hạn theo ma trận và cơ chế **Default Deny** (403 cho route chưa khai quyền) | Trọng tâm kiểm thử `S-03 / T-06`: chặn 403 khi thiếu quyền hoặc route chưa đăng ký | Read-Only |
| **Auth & Throttle** | `backend/src/modules/auth/` | Cung cấp router, service, schema đăng nhập và repository `login-throttle.repository.js` | Trọng tâm kiểm thử `S-02 / T-05`: khóa tạm thời 15 phút sau 5 lần sai, cấp cookie HttpOnly | Read-Only |
| **Audit Logging** | `backend/src/modules/audit/audit.repository.js` | Ghi nhận nhật ký an ninh vào bảng `audit_logs` khi có sự kiện vi phạm (`ACCESS_DENIED`) | Điểm kiểm thử `S03-AC-02` và `T07-02`: xác minh vết kiểm toán trong database | Read-Only |
| **Station & Charge Modules**| `backend/src/modules/stations/`, `charge-points/` | Cung cấp API quản lý danh sách trạm sạc và trụ sạc | Điểm kiểm thử phân quyền RBAC và Ownership Isolation giữa các Station Owner | Read-Only |
| **Error Handling** | `backend/src/middlewares/errorHandler.js` | Bắt lỗi tập trung và chuẩn hóa cấu trúc JSON response `{ error: { code, message, details } }` | Điểm kiểm thử tích hợp `TC-FB-04` và `UT-ERR-01` | Read-Only |
| **CSRF / Origin Guard** | `backend/src/middlewares/requireJson.js` | Bắt buộc `Content-Type: application/json` và kiểm tra header `Origin` khớp với `APP_ORIGIN` | Điểm kiểm thử tích hợp `TC-FB-11` phòng vệ tấn công CSRF | Read-Only |
| **Dev Test Suites** | `backend/tests/` | Toàn bộ bộ test tự động của Developer (acceptance, integration, unit) | Nguồn cung cấp bằng chứng tự động (Automated Evidence) khách quan cho Tester | Read-Only |
| **Frontend Core JS** | `frontend/js/api.js`, `auth.js`, `router.js`, `validate.js` | Mã nguồn điều hướng client, wrapper gọi fetch API, quản lý phiên cookie và kiểm tra form | Đối tượng kiểm thử tích hợp Frontend ↔ Backend `FB-01` đến `FB-11` | Read-Only |
| **Frontend Shell & Pages** | `frontend/index.html`, `frontend/pages/*.html` | Trang Single Page Application và các trang giao diện tương ứng theo vai trò | Đối tượng kiểm thử giao diện UI, chuyển hướng theo vai trò sau đăng nhập | Read-Only |
| **QA Documentation** | `docs/testing/` | Toàn bộ hệ thống hồ sơ và tài liệu kiểm thử của dự án CSMS | Nơi Tester làm việc, thiết kế test, ghi nhận bằng chứng và báo cáo hiện trạng | **Tester Quản Lý** |

---

## 6. QA Documentation Map (Bản đồ tài liệu QA)

| Tệp tài liệu | Mục đích thực tế (Actual Purpose) | Khi nào cập nhật (Trigger) | Quan hệ với các tài liệu QA khác |
|:---|:---|:---|:---|
| **[`README.md`](./README.md)** | **AI Tester Operating Manual**: Bộ luật vận hành chuẩn mực của Tester, quy định quyền hạn, 19 nhóm quy tắc tác nghiệp, và tiêu chuẩn đầu ra. | Khi có thay đổi về quy chế kiểm thử, bổ sung quy tắc mới hoặc cập nhật lệnh thông dịch. | Là tài liệu pháp lý cao nhất, chỉ đạo trực tiếp cách vận hành của tất cả các tài liệu còn lại. |
| **[`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md)** | **Verified Project Map**: Bản đồ cấu trúc toàn bộ dự án, ma trận ánh xạ Traceability hai chiều, đồ thị phụ thuộc và nhật ký kiểm chứng filesystem. | Trước mỗi task mới (đồng bộ nếu filesystem thay đổi) hoặc khi có file/module mới được tạo. | Làm kim chỉ nam định vị mã nguồn và kết nối Story $\longleftrightarrow$ Task $\longleftrightarrow$ Test. |
| **[`TEST_PLAN.md`](./TEST_PLAN.md)** | **Kế hoạch kiểm thử**: Xác định phạm vi kiểm thử (Scope), mục tiêu chất lượng, chiến lược kiểm thử đa tầng, môi trường yêu cầu, tiêu chí Entry/Exit và thứ tự phụ thuộc. | Khi bắt đầu sprint mới, thay đổi phạm vi kiểm thử hoặc thay đổi yêu cầu môi trường máy test. | Định nghĩa phạm vi tổng thể cho các tài liệu chi tiết trong `stories/` và `integration/`. |
| **[`TEST_INVENTORY.md`](./TEST_INVENTORY.md)** | **Bảng kê danh mục kiểm thử**: Danh mục tổng hợp toàn bộ các Test Case (ID, Jira, Loại hình, Phân loại, Trạng thái PASS/FAIL/BLOCKED và ngày chạy gần nhất). | Bắt buộc cập nhật ngay sau khi thực thi bất kỳ ca kiểm thử nào. | Cung cấp dữ liệu thống kê số lượng và tỷ lệ đạt cho `TEST_REPORT.md`. |
| **[`TEST_REPORT.md`](./TEST_REPORT.md)** | **Báo cáo kết quả snapshot**: Báo cáo tổng hợp chất lượng tại mốc thời gian snapshot hiện tại, số liệu thống kê PASS/FAIL, các rào cản môi trường và tóm tắt lỗi mở. | Khi hoàn thành một chu kỳ kiểm thử snapshot hoặc trước các mốc release/demo. | Tổng hợp số liệu từ `TEST_INVENTORY.md`, danh sách lỗi từ `BUG_REPORT.md`. |
| **[`BUG_REPORT.md`](./BUG_REPORT.md)** | **Hồ sơ lỗi & rào cản**: Lưu trữ chi tiết các lỗi mã nguồn (`CODE_DEFECT`) và rào cản môi trường/cấu hình (`ENVIRONMENT_BLOCKER`, `CONFIGURATION_PROBLEM`). | Ngay khi phát hiện lỗi trong quá trình kiểm thử, hoặc khi lỗi được giải quyết (CLOSED). | Kết nối trực tiếp với các Test Case bị FAIL/BLOCKED trong `TEST_INVENTORY.md`. |
| **[`REGRESSION_REPORT.md`](./REGRESSION_REPORT.md)** | **Báo cáo kiểm thử hồi quy**: Ghi nhận kết quả chạy lại các bài test cũ sau các đợt refactor mã nguồn và lập bảng so sánh hành vi giữa các phiên bản. | Sau mỗi đợt refactor mã nguồn, sửa bug của Dev hoặc trước khi release. | Nhận đầu vào từ ma trận phân tích tác động (Impact Map) để chọn test cần chạy lại. |
| **[`stories/S-01.md`](./stories/S-01.md)** | **Hồ sơ kiểm thử Story S-01**: Chi tiết yêu cầu AC/NFR, phân rã Task T-01, các test case và bằng chứng thực tế cho baseline container & PostgreSQL. | Khi Story S-01 hoặc Task T-01 có sự thay đổi hoặc chạy lại kiểm thử. | Phản ánh chi tiết kết quả của cụm bài test baseline vào `TEST_INVENTORY.md`. |
| **[`stories/S-02.md`](./stories/S-02.md)** | **Hồ sơ kiểm thử Story S-02**: Chi tiết yêu cầu xác thực, Argon2id, lockout 15 phút, phiên cookie HttpOnly, phân rã Task T-04, T-05. | Khi tính năng đăng nhập, cơ chế khóa hoặc bảng users có cập nhật. | Kế thừa trạng thái của S-01; cung cấp cơ sở phiên làm việc cho S-03. |
| **[`stories/S-03.md`](./stories/S-03.md)** | **Hồ sơ kiểm thử Story S-03**: Chi tiết yêu cầu phân quyền RBAC, Route Guard Default Deny, cô lập dữ liệu theo Station Owner và ghi audit log (T-06, T-07). | Khi ma trận phân quyền, bộ lọc scopeByOwner hoặc API trạm sạc thay đổi. | Kế thừa phiên làm việc của S-02; cung cấp dữ liệu phân quyền cho Integration. |
| **[`integration/FRONTEND_BACKEND.md`](./integration/FRONTEND_BACKEND.md)** | **Hồ sơ kiểm thử tích hợp**: Kịch bản và bằng chứng kiểm thử giao tiếp toàn trình giữa Frontend Client và Backend API từ FB-01 đến FB-11. | Khi hợp đồng API, cấu hình fetch client hoặc chuỗi middleware Express thay đổi. | Tổng hợp kết quả tích hợp đa tầng giữa S-01, S-02 và S-03. |

---

## 7. Requirement → Task → Source Mapping

Ma trận liên kết từ Yêu cầu nghiệp vụ đến Mã nguồn thực tế và Bộ kiểm thử tương ứng:

| Jira Story | Task kỹ thuật | Tiêu chí chính (AC / NFR) | Thành phần mã nguồn thực tế (Source Mapping) | Dev Automated Tests (Evidence) | QA Test Document & Test IDs |
|:---|:---|:---|:---|:---|:---|
| **S-01** | **T-01** | `S01-AC-01`<br>`S01-NFR-01`<br>`S01-NFR-02`<br>`T01-01`..`05`<br>`T01-NFR-01` | • `docker-compose.yml`<br>• `backend/Dockerfile`<br>• `backend/src/config/env.js`<br>• `backend/src/config/nodeVersion.js`<br>• `backend/src/modules/health/health.routes.js`<br>• `backend/migrations/001_baseline.sql`<br>• `backend/src/db/migrate.js`, `pool.js`<br>• `frontend/index.html`<br>• `backend/scripts/create-admin.js` | • `tests/acceptance/S-01.baseline.test.js`<br>• `tests/integration/migrate.test.js`<br>• `tests/integration/create-admin.test.js`<br>• `tests/unit/env.test.js`<br>• `tests/unit/nodeVersion.test.js`<br>• `tests/unit/no-backdoor.test.js` | [`stories/S-01.md`](./stories/S-01.md)<br>(`TC-S01-01`..`03`, `TC-T01-01`..`04`, `UT-NODE-01`, `UT-BACKDOOR-01`, `UT-ENV-01`, `UT-ERR-01`, `IT-MIGRATE-01`, `IT-ADMIN-01`, `ACC-S01-01`, `MAN-S01-01`..`02`) |
| **S-02** | **T-04** | `T04-01`..`04`<br>`T04-NFR` | • `backend/migrations/001_baseline.sql`<br>• `backend/src/lib/roles.js`<br>• `backend/src/lib/password.js`<br>• `backend/src/modules/users/users.repository.js` | • `tests/acceptance/S-02.login.test.js`<br>• `tests/integration/auth.regression.test.js` | [`stories/S-02.md`](./stories/S-02.md)<br>(`TC-T04-01`..`05`) |
| **S-02** | **T-05** | `S02-AC-01`..`04`<br>`S02-NFR-01`<br>`S02-NFR-02`<br>`T05-01`..`03`<br>`T05-NFR-01`..`03` | • `backend/src/modules/auth/auth.routes.js`<br>• `backend/src/modules/auth/auth.service.js`<br>• `backend/src/modules/auth/auth.schema.js`<br>• `backend/src/modules/auth/login-throttle.repository.js`<br>• `backend/migrations/002_login_throttle_drop_user_lockout.sql`<br>• `backend/src/middlewares/authenticate.js`<br>• `frontend/js/auth.js`<br>• `frontend/js/pages/login.js`<br>• `frontend/index.html` | • `tests/acceptance/S-02.login.test.js`<br>• `tests/acceptance/S-02.login-ip.test.js`<br>• `tests/acceptance/S-02.frontend.test.js`<br>• `tests/integration/auth.regression.test.js` | [`stories/S-02.md`](./stories/S-02.md)<br>(`TC-S02-01`..`04`, `TC-T05-01`..`04`, `ACC-S02-01`..`04`, `IT-AUTH-01`) |
| **S-03** | **T-06** | `S03-AC-03`<br>`S03-AC-04`<br>`T06-01`<br>`T06-02` | • `backend/src/security/permissions.js`<br>• `backend/src/security/routeGuard.js`<br>• `backend/src/app.js`<br>• `frontend/js/router.js` | • `tests/acceptance/S-03.rbac.test.js`<br>• `tests/acceptance/S-03.rbac-matrix.test.js`<br>• `tests/acceptance/S-03.route-guard.test.js`<br>• `tests/acceptance/S-03.accounts.test.js` | [`stories/S-03.md`](./stories/S-03.md)<br>(`TC-S03-03`, `TC-S03-04`, `TC-T06-01`, `TC-T06-02`) |
| **S-03** | **T-07** | `S03-AC-01`<br>`S03-AC-02`<br>`S03-NFR-01`<br>`T07-01`..`03`<br>`T07-NFR` | • `backend/src/db/scope.js` (`scopeByOwner`)<br>• `backend/src/modules/stations/`<br>• `backend/src/modules/charge-points/`<br>• `backend/src/modules/audit/audit.repository.js`<br>• `backend/migrations/003_stations_owner.sql`<br>• `frontend/pages/station-owner.html` | • `tests/unit/scope.test.js`<br>• `tests/acceptance/S-03.rbac.test.js`<br>• `tests/acceptance/S-03.accounts.test.js` | [`stories/S-03.md`](./stories/S-03.md)<br>(`TC-S03-01`, `TC-S03-02`, `TC-T07-01`..`03`) |
| **Integration** | **FB-01 .. FB-11** | Hợp đồng API, Cookie credentials, Error envelope, CSRF guard | • `frontend/js/api.js`<br>• `frontend/js/auth.js`<br>• `frontend/js/router.js`<br>• `frontend/js/validate.js`<br>• `backend/src/app.js`<br>• `backend/src/middlewares/errorHandler.js`<br>• `backend/src/middlewares/requireJson.js` | • `tests/unit/frontend.test.js`<br>• `tests/acceptance/S-02.frontend.test.js`<br>• `tests/acceptance/S-03.csrf.test.js` | [`integration/FRONTEND_BACKEND.md`](./integration/FRONTEND_BACKEND.md)<br>(`TC-FB-01` đến `TC-FB-11`) |

---

## 8. Dependency Map (Bản đồ phụ thuộc hệ thống)

### 8.1. Story → Story Dependency
- **`S-01`**: Cột mốc khởi nguyên (Root Baseline). Không phụ thuộc Story nào khác.
- **`S-02`**: Phụ thuộc trực tiếp vào **`S-01`** (Cần cụm container app + database và migration schema baseline hoạt động để lưu bảng users).
- **`S-03`**: Phụ thuộc trực tiếp vào **`S-02`** (Cần phiên làm việc và danh tính đã xác thực của người dùng để kiểm tra phân quyền RBAC và quyền sở hữu).
- **`Integration (FB-01..11)`**: Phụ thuộc đồng thời vào **`S-01`**, **`S-02`** và **`S-03`** (Đòi hỏi runtime sẵn sàng, xác thực cookie hoạt động và ma trận route guard đã áp dụng).

### 8.2. Task → Task Dependency
- **`T-01`** (Khởi tạo DB & Container) $\longrightarrow$ **Độc lập ban đầu**.
- **`T-04`** (Bảng users, roles & seed) $\longrightarrow$ Phụ thuộc vào **`T-01`** (yêu cầu PostgreSQL connection pool và runner migration `migrate.js`).
- **`T-05`** (Login, session cookie & throttle) $\longrightarrow$ Phụ thuộc vào **`T-04`** (yêu cầu có bảng `users`, 5 vai trò trong `roles`, và mật khẩu băm Argon2id).
- **`T-06`** (Route Guard & Default Deny) $\longrightarrow$ Phụ thuộc vào **`T-05`** (yêu cầu middleware `authenticate.js` trích xuất thông tin `req.user`).
- **`T-07`** (Ownership Scope & Audit Log) $\longrightarrow$ Phụ thuộc vào **`T-06`** (yêu cầu vượt qua bước kiểm tra vai trò tại route guard trước khi áp đặt điều kiện lọc sở hữu `scopeByOwner`).

### 8.3. Test → Prerequisite Dependency
- **`TC-S01-01`** $\longrightarrow$ Tiền đề: Docker Desktop đang chạy, cổng 3000 và 5432 chưa bị chiếm dụng.
- **`TC-S02-01`..`03`** $\longrightarrow$ Tiền đề: Container `app` và `db` ở trạng thái healthy; database đã seed tài khoản test (`admin@csms.local`,...).
- **`TC-S03-01`..`02`** $\longrightarrow$ Tiền đề: Đã chạy migration 003, đã nạp phiên hợp lệ qua file cookie (`owner_a.cookie`, `owner_b.cookie`).
- **`TC-FB-01`..`11`** $\longrightarrow$ Tiền đề: Express server lắng nghe trên port 3000, serve thư mục tĩnh `frontend/`.

### 8.4. Source → Dependent Component
- `backend/src/config/env.js` $\longrightarrow$ Ảnh hưởng toàn bộ ứng dụng: `pool.js`, `app.js`, `server.js`.
- `backend/src/lib/password.js` $\longrightarrow$ Ảnh hưởng trực tiếp: `create-admin.js`, `auth.service.js`, `users.service.js`.
- `backend/src/middlewares/authenticate.js` $\longrightarrow$ Ảnh hưởng trực tiếp: mọi route được bảo vệ trong `app.js`.
- `backend/src/db/scope.js` $\longrightarrow$ Ảnh hưởng trực tiếp: `stations.repository.js`, `charge-points.repository.js`.

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

---

## 10. Canonical Traceability Logic (Mô hình chuỗi truy vết chuẩn)

Hệ thống truy vết QA tuân thủ mô hình chuẩn mực thống nhất kết nối giữa các tầng:

```text
SOURCE / REQUIREMENT CHANGE
        ↓
   IMPACT TYPE
        ↓
INVESTIGATION LABEL
        ↓
HISTORICAL TEST MAPPING
        ↓
 REGRESSION STATE
        ↓
 TEST EXECUTION
        ↓
  TEST STATUS
```

Và một trục độc lập kiểm thực bằng chứng:
```text
EVIDENCE
    ↓
VERIFICATION (VERIFIED / NOT VERIFIED)
```

### 10.1. Bảng 4 Tầng Bắt Buộc (4 Mandatory Layers)

| Tầng | Câu hỏi nghiệp vụ cần trả lời | Field tương ứng | Tập giá trị chuẩn (Canonical Enums) |
|:---:|---|---|---|
| **1** | Source thay đổi thuộc kiểu cơ chế ảnh hưởng kiến trúc nào? | **`Impact Type`** | `DIRECT`, `DEPENDENCY`, `SHARED_COMPONENT`, `POTENTIAL_IMPACT`, `NOT VERIFIED` |
| **2** | Trong quá trình điều tra, quan hệ nhân quả hiện đang ở mức nào? | **`Investigation Label`** | `RELATED`, `AFFECTED`, `REGRESSION CANDIDATE`, `CONFIRMED ROOT CAUSE` |
| **3** | Historical Test nào cần xem xét chạy lại trong chu trình hồi quy? | **`Regression State`** | `REGRESSION CANDIDATE`, `PASS`, `FAIL`, `BLOCKED`, `NOT VERIFIED` |
| **4** | Test thực tế khi thực thi đã cho kết quả gì? | **`Test Status`** | `PASS`, `FAIL`, `BLOCKED`, `NOT VERIFIED`, `NOT FOUND`, `NOT RUN` |
| **Độc lập** | Bằng chứng thực tế (Evidence) đã đủ căn cứ xác minh hay chưa? | **`Verification`** | `VERIFIED`, `NOT VERIFIED` |

### 10.2. Canonical Enums & Quy tắc cấm tuyệt đối (Forbidden Substitutions)

1. **Impact Type**:
   - **Chỉ dùng**: `DIRECT`, `DEPENDENCY`, `SHARED_COMPONENT`, `POTENTIAL_IMPACT`, `NOT VERIFIED`.
   - **CẤM**: `RELATED`, `AFFECTED`, `REGRESSION CANDIDATE`, `CONFIRMED ROOT CAUSE`, `PENDING_VERIFICATION`, `SUSPECTED_SHARED_COMPONENT`.
2. **Investigation Label**:
   - **Chỉ dùng**: `RELATED`, `AFFECTED`, `REGRESSION CANDIDATE`, `CONFIRMED ROOT CAUSE`.
   - **CẤM**: dùng `Investigation Label` thay cho `Impact Type` (vd: cấm gán `Investigation Label = SHARED_COMPONENT`).
3. **Regression State**:
   - **Chỉ dùng**: `REGRESSION CANDIDATE`, `PASS`, `FAIL`, `BLOCKED`, `NOT VERIFIED`.
   - **CẤM**: tạo enum tự chế: `PENDING_VERIFICATION`, `SUSPECTED_REGRESSION`, `REGRESSION_CONFIRMED`, `REGRESSION_PENDING`.
4. **Test Status**:
   - **Chỉ dùng đúng 6 trạng thái chuẩn**: `PASS`, `FAIL`, `BLOCKED`, `NOT VERIFIED`, `NOT FOUND`, `NOT RUN`.
5. **Verification**:
   - **Chỉ dùng**: `VERIFIED`, `NOT VERIFIED`.
   - **CẤM**: dùng Test Status thay cho Verification và ngược lại.

### 10.3. Chu trình chuyển trạng thái từ Source Change đến Regression (Flow)

```text
SOURCE CHANGE
    ↓
CHANGED SOURCE COMPONENT
    ↓
HISTORICAL TEST MAPPING (Tra cứu Mục 9)
    ↓
REQUIREMENT / TASK / STORY (Tra cứu Mục 7)
    ↓
IMPACT ANALYSIS (Impact Type & Investigation Label)
    ↓
REGRESSION CANDIDATE (Regression State)
    ↓
TEST EXECUTION
    ↓
TEST STATUS (PASS / FAIL / BLOCKED)
    ↓
EVIDENCE COLLECTION
    ↓
VERIFICATION UPDATE (VERIFIED / NOT VERIFIED)
```

- **Quy tắc Historical Test**:
  - Không tự tạo Historical Test ID. Không suy đoán Test ID từ tên file/module.
  - Nếu chưa xác định được Historical Test cụ thể: ghi `Historical Test ID = NONE`.
  - Nếu có Test ID thực tế nhưng mapping chưa đủ bằng chứng: ghi `Verification = NOT VERIFIED`.
- **Quy tắc Evidence Basis**:
  - Chỉ dùng: `STORY_DOC`, `TEST_INVENTORY`, `TEST_REPORT`, `SOURCE_LINK`, `REQUIREMENT_LINK`, `GIT_DIFF`, `DEPENDENCY`, `COMBINED`, `NONE`.
  - Cấm tạo enum tự chế: `CODE_REVIEWED`, `LOG_FOUND`, `MANUAL_CONFIRMATION`, `SHARED_LOGIC`.
- **Quy tắc Status vs Verification**:
  - Duy trì hai trục độc lập: Historical Test có thể có `Status = PASS` nhưng `Verification = NOT VERIFIED` (khi impact hiện tại chưa xác minh).
  - Không được đổi `Status = PASS` thành `Status = NOT VERIFIED` chỉ vì impact chưa xác minh.
  - `Verification = VERIFIED` không đồng nghĩa với `Test Status = PASS`.

### 10.4. Cơ chế truy vết hai chiều (Bidirectional Traceability)

1. **Chiều thuận (Forward Traceability — Từ Nghiệp vụ đến Bằng chứng)**:
   $$\text{Jira Requirement} \longrightarrow \text{Task Scope} \longrightarrow \text{Source File / API} \longrightarrow \text{QA Test Case Design} \longrightarrow \text{Execution} \longrightarrow \text{Evidence} \longrightarrow \text{Status}$$

2. **Chiều nghịch (Reverse Traceability — Từ Sự cố/Thay đổi đến Nghiệp vụ)**:
   $$\text{Test Failure / Changed Source} \longrightarrow \text{Source Mapping} \longrightarrow \text{Historical Test Mapping} \longrightarrow \text{Requirement / Task / Story} \longrightarrow \text{Regression Candidate} \longrightarrow \text{Selective Re-test}$$

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
| **`backend/migrations/*.sql`** | Cấu trúc bảng, ràng buộc khóa ngoại, index | S-01, S-02, S-03 | `tests/integration/migrate.test.js`<br>Chạy lại migration up và rollback trên DB test 5433 |
| **`frontend/js/api.js`** | Fetch API wrapper, headers, credentials | Toàn bộ Frontend Integration | `tests/unit/frontend.test.js`<br>`TC-FB-01`, `TC-FB-04`, `TC-FB-11` |
| **`frontend/js/router.js`** | Điều hướng theo vai trò, redirect 401 | S-02, S-03, Integration | `tests/unit/frontend.test.js`<br>`TC-FB-06`, `TC-S02-04` |

> **Nguyên tắc an toàn**: Không kết luận nguyên nhân gốc rễ (Root Cause) chỉ dựa trên bản đồ tác động này. Mọi kết luận đều phải được chứng minh qua bằng chứng kiểm thử thực tế.

---

## 12. Current Structure Gaps (Các khoảng trống cấu trúc hiện tại)

Các thành phần mã nguồn hoặc chức năng hiện tại chưa được hiện thực hóa đầy đủ hoặc chưa đủ điều kiện để xác minh:

1. **`S03-AC-04` / `TC-T06-01` (Route chưa khai báo quyền trả về HTTP 403 cho Admin)**:
   - *Hiện trạng*: Trong mã nguồn hiện tại, 100% các route nghiệp vụ đều đã được khai báo quyền hạn tường minh trong `permissions.js`. Không có route nào bị bỏ quên.
   - *Đánh giá an toàn*: **NOT VERIFIED**. Tuân thủ nghiêm ngặt quy tắc Tester: Không tự ý thêm route rác vào mã nguồn để kiểm thử tính năng này.
2. **Giao diện UI quản lý trạm sạc và trụ sạc trên Frontend (`frontend/pages/station-owner.html`, `operator.html`)**:
   - *Hiện trạng*: Các file HTML đã tồn tại nhưng phần lớn chứa khung sườn giao diện ban đầu; các form thao tác CRUD chuyên sâu của Sprint tiếp theo chưa được nối API hoàn chỉnh.
   - *Đánh giá an toàn*: **NOT FOUND / PARTIALLY IMPLEMENTED**. Xác minh được qua hợp đồng API backend, nhưng UI end-to-end đánh dấu theo dõi cho Sprint 2.
3. **Môi trường máy host không có sẵn `supertest` toàn cục**:
   - *Hiện trạng*: `supertest` được khai báo trong `backend/package.json` devDependencies. Một số test case acceptance cần chạy trong môi trường đã `npm install` đầy đủ hoặc bên trong container.
   - *Đánh giá*: Đã có bằng chứng thực thi thành công từ snapshot ngày 24/09/2026.

---

## 13. Structure Verification Metadata (Thông tin kiểm chứng cấu trúc)

- **Structure Status**: **VERIFIED** (Đã đối chiếu 100% khớp với filesystem thực tế).
- **Snapshot Date**: 26/09/2026.
- **Git Commit Hash**: `45de7c685f48c28b96f797b1f55965d4125d44e9`.
- **Git Branch**: `feature/update-csms-docs`.
- **Operating System Environment**: Windows 11 x64, Node.js v24.19.0, npm 11.17.0.
- **Container Environment**: Docker Desktop (PostgreSQL 16 alpine trên ports 5432, 5433; App container trên port 3000).
- **Last Verification Timestamp**: `26/09/2026 16:17:42 +07:00`.
