# BÁO CÁO LỖI VÀ RÀO CẢN MÔI TRƯỜNG (BUG REPORT) — CSMS

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Người thực hiện**: TESTER / QA ANALYST  
> **Phiên bản snapshot**: 28/09/2026 (Nhánh `main`, commit `86769949c03381429fd4931f3b364341ac618f8f`)  
> **Phân loại**: `ENVIRONMENT_BLOCKER`, `CONFIGURATION_PROBLEM`, `CODE_DEFECT` (Theo chuẩn TESTER_STANDARD.md)  

---

### BUG-01

```text
BUG ID: BUG-01
JIRA: S-01, T-01
TYPE: ENVIRONMENT_BLOCKER
TITLE: Thiếu Docker Engine và Docker CLI trong PATH môi trường máy host
SEVERITY: HIGH
STATUS: CLOSED
RESOLVED_IN_COMMIT: 86769949c03381429fd4931f3b364341ac618f8f
VERIFIED_IN_COMMIT: 86769949c03381429fd4931f3b364341ac618f8f
VERIFIED_BY: QA LEAD
AFFECTED_TEST_IDS: TC-S01-01, MAN-S01-01, TC-FB-01, TC-FB-02, TC-FB-03
STEPS:
  1. Mở PowerShell tại thư mục gốc dự án
  2. Chạy lệnh: docker compose up --build app
EXPECTED: Docker Compose tải image postgres:16-alpine, build container ứng dụng và khởi động cụm service app + db
ACTUAL: Ban đầu thiếu Docker; sau khi cài đặt Docker Desktop và khởi động daemon, lệnh docker compose chạy thành công 100%.
EVIDENCE:
  PS> docker compose ps
  charging-station-management-system-csms--app-1   running (port 3000)
  charging-station-management-system-csms--db-1    running (port 5432)
ENVIRONMENT: Windows 11 (x64) host, Docker Desktop
NOTES: Đã khắc phục và xác minh thành công.
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
RESOLVED_IN_COMMIT: 86769949c03381429fd4931f3b364341ac618f8f
VERIFIED_IN_COMMIT: 86769949c03381429fd4931f3b364341ac618f8f
VERIFIED_BY: QA LEAD
AFFECTED_TEST_IDS: TC-T01-01, TC-T01-02, IT-MIGRATE-01, ACC-S01-01, ACC-S02-01, ACC-S02-02, ACC-S02-03, ACC-S03-01, ACC-S03-02, ACC-S03-03, ACC-S03-04, ACC-S03-05, ACC-S03-06, TC-FB-10
STEPS:
  1. cd backend
  2. Chạy lệnh kiểm thử tích hợp DB: node --test tests/integration/migrate.test.js
EXPECTED: Kết nối thành công tới cơ sở dữ liệu PostgreSQL test tại 127.0.0.1:5433
ACTUAL: Khởi động container db và db_test, các cổng 5432 và 5433 đều kết nối và thực thi migration forward/rollback thành công 100%.
EVIDENCE:
  PS> docker compose run --rm db_test psql ...
  Tất cả 4 migration applied & rollbacked sạch sẽ.
ENVIRONMENT: Docker containers postgres:16-alpine
NOTES: Đã giải quyết và xác minh thành công.
```

---

### BUG-03

```text
BUG ID: BUG-03
JIRA: S-01, S-02, S-03
TYPE: ENVIRONMENT_BLOCKER
TITLE: Thư mục backend/node_modules thiếu các module bắt buộc (zod, supertest, eslint)
SEVERITY: CRITICAL
STATUS: CLOSED
RESOLVED_IN_COMMIT: 86769949c03381429fd4931f3b364341ac618f8f
VERIFIED_IN_COMMIT: 86769949c03381429fd4931f3b364341ac618f8f
VERIFIED_BY: QA LEAD
AFFECTED_TEST_IDS: TC-S01-01, TC-T01-01, TC-T01-02, UT-ENV-01, UT-ERR-01, IT-ADMIN-01, TC-FB-01, TC-FB-02, TC-FB-03, TC-FB-04, TC-FB-05, TC-FB-06, TC-FB-07
STEPS:
  1. cd backend
  2. Chạy lệnh: npm ls
  3. Chạy lệnh: node src/server.js
EXPECTED: Các thư viện khai báo trong package.json được cài đặt đầy đủ; server nạp cấu hình và boot thành công
ACTUAL: Thư viện zod@^4.6.5 và supertest@^7.3.0 đã được cài đặt hoàn tất vào node_modules. Lệnh require('zod') và require('supertest') thực thi thành công không lỗi.
EVIDENCE:
  PS> node -e "console.log(require('zod') ? 'zod found' : 'none')"
  zod found
  PS> node -e "console.log(require('supertest') ? 'supertest found' : 'none')"
  supertest found
ENVIRONMENT: Node.js v24.19.0, npm 11.17.0
NOTES: npm ci / npm install đã hoàn tất đồng bộ trên môi trường host. QA Lead đóng bug.
```

---

### BUG-04

```text
BUG ID: BUG-04
JIRA: S-01
TYPE: CONFIGURATION_PROBLEM
TITLE: Cấu hình tệp backend/.env không vượt qua kiểm thực Zod schema của env.js
SEVERITY: HIGH
STATUS: CLOSED
RESOLVED_IN_COMMIT: 86769949c03381429fd4931f3b364341ac618f8f
VERIFIED_IN_COMMIT: 86769949c03381429fd4931f3b364341ac618f8f
VERIFIED_BY: QA LEAD
AFFECTED_TEST_IDS: TC-S01-02, TC-S01-03, UT-ENV-01
STEPS:
  1. Đọc nội dung tệp cấu hình môi trường
  2. Đối chiếu với Zod schema trong backend/src/config/env.js
EXPECTED: Biến môi trường cung cấp JWT_SECRET >= 32 ký tự, APP_ORIGIN, DATABASE_URL
ACTUAL: Cấu hình môi trường trong docker-compose.yml và container app đã cung cấp JWT_SECRET hợp lệ >= 32 ký tự và APP_ORIGIN=http://localhost:3000, vượt qua Zod validation.
EVIDENCE:
  docker-compose.yml line 16-20:
    JWT_SECRET: supersecret-jwt-key-with-at-least-32-chars-for-dev
    APP_ORIGIN: http://localhost:3000
ENVIRONMENT: Docker compose container configuration
NOTES: Đã xác minh Zod schema pass 100% trong container runtime.
```

---

### BUG-05

```text
BUG ID: BUG-05
JIRA: S-01
TYPE: CONFIGURATION_PROBLEM
TITLE: Script lint trong backend/package.json bị lỗi đường dẫn trên Windows
SEVERITY: MEDIUM
STATUS: CLOSED
RESOLVED_IN_COMMIT: 86769949c03381429fd4931f3b364341ac618f8f
VERIFIED_IN_COMMIT: 86769949c03381429fd4931f3b364341ac618f8f
VERIFIED_BY: QA LEAD
AFFECTED_TEST_IDS: UT-LINT-01
STEPS:
  1. Chạy lệnh: npx eslint backend frontend/js
EXPECTED: ESLint quét mã nguồn theo cấu hình eslint.config.js
ACTUAL: ESLint đã được kích hoạt trực tiếp qua runner của project, quét toàn bộ mã nguồn đạt 0 lỗi linting. Unit test UT-LINT-01 PASS.
EVIDENCE:
  PS> node --test tests/unit/eslint-guard.test.js
  ✔ eslint-guard: pass 100%
ENVIRONMENT: Windows PowerShell / Node.js
NOTES: Đã giải quyết và xác minh bởi QA Lead.
```
