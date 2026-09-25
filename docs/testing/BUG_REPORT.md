# BÁO CÁO LỖI VÀ RÀO CẢN MÔI TRƯỜNG (BUG REPORT) — CSMS

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Người thực hiện**: TESTER / QA ANALYST  
> **Phiên bản snapshot**: 24/09/2026 (Nhánh `main`, commit `4bc5758`)  
> **Phân loại**: `ENVIRONMENT_BLOCKER`, `CONFIGURATION_PROBLEM`, `CODE_DEFECT`, `DATA_PROBLEM`, `TEST_DEFECT`, `DOCUMENTATION_DEFECT`  

---

### BUG-01

```text
BUG ID: BUG-01
JIRA: S-01, T-01
TYPE: ENVIRONMENT_BLOCKER
TITLE: Thiếu Docker Engine và Docker CLI trong PATH môi trường máy host
SEVERITY: HIGH
STATUS: CLOSED
STEPS:
  1. Mở PowerShell tại thư mục gốc dự án
  2. Chạy lệnh: docker compose up --build app
EXPECTED: Docker Compose tải image postgres:16-alpine, build container ứng dụng và khởi động cụm service app + db
ACTUAL: Ban đầu thiếu Docker; sau khi người dùng cài đặt Docker Desktop và khởi động daemon, lệnh docker compose chạy thành công hoàn toàn.
EVIDENCE:
  PS> docker compose ps
  charging-station-management-system-csms--app-1   running (port 3000)
  charging-station-management-system-csms--db-1    running (port 5432)
ENVIRONMENT: Windows 11 (x64) host, Docker Desktop
AFFECTED TEST: TC-S01-01, MAN-S01-01, TC-FB-01 đến TC-FB-03
NOTES: Đã khắc phục thành công ngày 24/09/2026.
```

---

### BUG-02

```text
BUG ID: BUG-02
JIRA: S-01, T-01, S-02, S-03
TYPE: ENVIRONMENT_BLOCKER
TITLE: Cổng dịch vụ PostgreSQL 5432 (dev) và 5433 (test) bị đóng, dịch vụ không chạy
SEVERITY: HIGH
STATUS: CLOSED
STEPS:
  1. cd backend
  2. Chạy lệnh kiểm thử tích hợp DB: node --test tests/integration/migrate.test.js
EXPECTED: Kết nối thành công tới cơ sở dữ liệu PostgreSQL test tại 127.0.0.1:5433
ACTUAL: Sau khi khởi động container db và db_test, các cổng 5432 và 5433 đều kết nối và thực thi migration forward/rollback thành công 100%.
EVIDENCE:
  PS> docker compose run --rm db_test psql ...
  Tất cả 3 migration applied & rollbacked sạch sẽ.
ENVIRONMENT: Docker containers postgres:16-alpine
AFFECTED TEST: TC-T01-01, TC-T01-02, IT-MIGRATE-01, ACC-S01-01, ACC-S02-01..03, ACC-S03-01..06, TC-FB-10
NOTES: Đã giải quyết thành công ngày 24/09/2026.
```

---

### BUG-03

```text
BUG ID: BUG-03
JIRA: S-01, S-02, S-03
TYPE: ENVIRONMENT_BLOCKER
TITLE: Thư mục backend/node_modules thiếu các module bắt buộc (zod, supertest, eslint)
SEVERITY: CRITICAL
STATUS: OPEN
STEPS:
  1. cd backend
  2. Chạy lệnh: npm ls
  3. Chạy lệnh: node src/server.js
EXPECTED: Các thư viện khai báo trong package.json được cài đặt đầy đủ; server nạp cấu hình và boot thành công
ACTUAL:
  - npm ls báo lỗi ELSPROBLEMS: Missing zod@^4.6.5, supertest@^7.3.0, eslint@^9.39.5
  - node src/server.js crash: "Error: Cannot find module 'zod' Require stack: backend/src/config/env.js" (Exit code: 1)
EVIDENCE:
  npm error missing: zod@^4.6.5, required by csms-backend@1.0.0
  Error: Cannot find module 'zod' at Object.<anonymous> (backend/src/config/env.js:2:15)
ENVIRONMENT: Node.js v24.19.0, npm 11.17.0
AFFECTED TEST: TC-S01-01, TC-T01-01, TC-T01-02, UT-ENV-01, UT-ERR-01, IT-ADMIN-01, TC-FB-01..07
NOTES: Thư mục node_modules chưa được đồng bộ sau khi nhóm dev cập nhật package.json. Cần chạy npm install hoặc npm ci trong backend/.
```

---

### BUG-04

```text
BUG ID: BUG-04
JIRA: S-01
TYPE: CONFIGURATION_PROBLEM
TITLE: Cấu hình tệp backend/.env không vượt qua kiểm thực Zod schema của env.js
SEVERITY: HIGH
STATUS: OPEN
STEPS:
  1. Đọc nội dung tệp backend/.env
  2. Đối chiếu với Zod schema trong backend/src/config/env.js
EXPECTED: File .env cung cấp JWT_SECRET >= 32 ký tự, APP_ORIGIN, DATABASE_URL
ACTUAL:
  - backend/.env có JWT_SECRET=change-this-in-production (25 ký tự, nhỏ hơn quy định >= 32 ký tự)
  - backend/.env thiếu biến bắt buộc: APP_ORIGIN
  - backend/.env chứa biến thừa không sử dụng: CORS_ORIGIN=http://localhost:5500
EVIDENCE:
  backend/.env dòng 2-4:
    JWT_SECRET=change-this-in-production
    CORS_ORIGIN=http://localhost:5500
ENVIRONMENT: Backend configuration (.env)
AFFECTED TEST: Khởi động server backend, toàn bộ kịch bản chạy live
NOTES: Cần cập nhật tệp .env theo mẫu .env.example, đặt JWT_SECRET đủ 32 ký tự và thêm APP_ORIGIN=http://localhost:3000.
```

---

### BUG-05

```text
BUG ID: BUG-05
JIRA: S-01
TYPE: CONFIGURATION_PROBLEM
TITLE: Script lint trong backend/package.json bị lỗi đường dẫn trên Windows
SEVERITY: MEDIUM
STATUS: OPEN
STEPS:
  1. cd backend
  2. Chạy lệnh: npm run lint
EXPECTED: ESLint quét mã nguồn theo cấu hình eslint.config.js
ACTUAL: npm báo lỗi: "'eslint' is not recognized as an internal or external command, operable program or batch file." (Exit code: 1)
EVIDENCE:
  > csms-backend@1.0.0 lint
  > cd .. && eslint backend frontend/js
  'eslint' is not recognized as an internal or external command...
ENVIRONMENT: Windows PowerShell / CMD
AFFECTED TEST: npm run lint, kiểm tra tĩnh phong cách mã nguồn
NOTES: Lệnh cd .. && eslint chuyển ngữ cảnh ra ngoài thư mục gốc nơi không có node_modules/.bin trong PATH của shell Windows.
```
