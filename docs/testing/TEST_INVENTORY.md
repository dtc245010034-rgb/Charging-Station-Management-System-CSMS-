# TEST INVENTORY

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Người thực hiện**: TESTER / QA ANALYST  
> **Snapshot Date**: 26/09/2026  
> **Git Commit**: `45de7c685f48c28b96f797b1f55965d4125d44e9` (nhánh `feature/update-csms-docs`)  
> **Tài liệu quy chuẩn**: [`docs/testing/README.md`](./README.md) (AI TESTER OPERATING MANUAL)  
> **Bản đồ tham chiếu**: [`docs/testing/PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md) (VERIFIED PROJECT MAP)  

---

## 1. Purpose

Tài liệu này là **VERIFIED TEST INDEX** (Chỉ mục danh mục kiểm thử đã qua xác minh) của dự án CSMS:
- Đóng vai trò là nguồn sự thật trung tâm quản lý danh mục kiểm thử, ánh xạ giữa ca kiểm thử (Test Case), yêu cầu nghiệp vụ (AC/NFR), nhiệm vụ kỹ thuật (Task), câu chuyện người dùng (Story) và thành phần mã nguồn (Source Component).
- Lưu giữ và bảo toàn toàn bộ các bài kiểm thử lịch sử (Historical Tests) phục vụ cơ chế truy vết hai chiều (Bidirectional Traceability) và phân tích ảnh hưởng khi kiểm thử hồi quy (Regression Analysis).
- Không chứa nội dung chi tiết kịch bản kiểm thử (nội dung kịch bản được lưu trữ độc lập tại `stories/*.md` và `integration/*.md`).

---

## 2. Inventory Rules & Canonical Traceability Logic

1. **Nguyên tắc định danh thực tế**: Tuyệt đối không tự bịa đặt hoặc suy diễn Test ID. Chỉ ghi nhận các Test ID thực sự tồn tại trong tài liệu kiểm định hoặc bằng chứng thực thi. Nếu chưa tìm thấy test cụ thể, bắt buộc ghi `Historical Test ID = NONE`.
2. **Mô hình 4 Tầng Bắt Buộc (4 Mandatory Layers)**:

| Tầng | Câu hỏi nghiệp vụ cần trả lời | Field tương ứng | Tập giá trị chuẩn (Canonical Enums) |
|:---:|---|---|---|
| **1** | Source thay đổi thuộc kiểu cơ chế ảnh hưởng kiến trúc nào? | **`Impact Type`** | `DIRECT`, `DEPENDENCY`, `SHARED_COMPONENT`, `POTENTIAL_IMPACT`, `NOT VERIFIED` |
| **2** | Trong quá trình điều tra, quan hệ nhân quả hiện đang ở mức nào? | **`Investigation Label`** | `RELATED`, `AFFECTED`, `REGRESSION CANDIDATE`, `CONFIRMED ROOT CAUSE` |
| **3** | Historical Test nào cần xem xét chạy lại trong chu trình hồi quy? | **`Regression State`** | `REGRESSION CANDIDATE`, `PASS`, `FAIL`, `BLOCKED`, `NOT VERIFIED` |
| **4** | Test thực tế khi thực thi đã cho kết quả gì? | **`Test Status`** | `PASS`, `FAIL`, `BLOCKED`, `NOT VERIFIED`, `NOT FOUND`, `NOT RUN` |
| **Độc lập** | Bằng chứng thực tế (Evidence) đã đủ căn cứ xác minh hay chưa? | **`Verification`** | `VERIFIED`, `NOT VERIFIED` |

3. **Quy tắc cấm tuyệt đối (Forbidden Substitutions)**:
   - CẤM dùng `RELATED`, `AFFECTED`, `REGRESSION CANDIDATE`, `CONFIRMED ROOT CAUSE` làm `Impact Type`.
   - CẤM dùng `SHARED_COMPONENT`, `DIRECT`, `DEPENDENCY` làm `Investigation Label`.
   - CẤM tạo enum tự chế: `PENDING_VERIFICATION`, `SUSPECTED_SHARED_COMPONENT`, `SUSPECTED_REGRESSION`, `REGRESSION_CONFIRMED`.
   - CẤM gộp hoặc dùng `Test Status` thay cho `Verification` và ngược lại.
4. **Phân biệt độc lập giữa Status và Verification**:
   - `Status`: Kết quả thực thi thực tế của bài test (`PASS`, `FAIL`, `BLOCKED`, `NOT VERIFIED`, `NOT FOUND`, `NOT RUN`).
   - `Verification`: Trạng thái kiểm thực của bằng chứng và mapping (`VERIFIED`, `NOT VERIFIED`).
   - Một Historical Test có thể có `Status = PASS` nhưng `Verification = NOT VERIFIED` (khi impact hiện tại chưa xác minh). Không được đổi `Status = PASS` thành `Status = NOT VERIFIED` chỉ vì impact chưa xác minh.
5. **Phân loại nguồn bằng chứng (Evidence Basis)**:
   - Chỉ được sử dụng: `STORY_DOC`, `TEST_INVENTORY`, `TEST_REPORT`, `SOURCE_LINK`, `REQUIREMENT_LINK`, `GIT_DIFF`, `DEPENDENCY`, `COMBINED`, `NONE`.
   - CẤM tự tạo enum: `CODE_REVIEWED`, `LOG_FOUND`, `MANUAL_CONFIRMATION`, `SHARED_LOGIC`.
6. **Bảo tồn bài test lịch sử**: Không xóa các bài test thuộc Story cũ (S-01, S-02, S-03). Chúng là cơ sở bắt buộc để bảo vệ hệ thống trước nguy cơ hồi quy (Regression Candidate).
7. **Phân biệt rõ ràng**:
   - `NOT RUN`: Test đã thiết kế nhưng chưa đến lượt chạy.
   - `NOT VERIFIED`: Chưa đủ evidence để xác minh kết luận.
   - `BLOCKED`: Bị chặn do rào cản môi trường/cấu hình.
   - `FAIL`: Đã chạy và hành vi sai lệch yêu cầu.
   - `PASS`: Đã chạy và có bằng chứng đạt 100%.

---

## 3. Test Coverage Summary

| Nhóm kiểm thử | Phạm vi chức năng | Tổng số test | PASS | FAIL | BLOCKED | NOT VERIFIED | NOT FOUND | NOT RUN | Tỷ lệ VERIFIED |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **S-01 & T-01** | Khung ứng dụng, Docker container & PostgreSQL baseline | 17 | 17 | 0 | 0 | 0 | 0 | 0 | 100% (17/17) |
| **S-02 & T-04, T-05** | Xác thực đăng nhập, Argon2id, Cookie session, Lockout 15p | 23 | 23 | 0 | 0 | 0 | 0 | 0 | 100% (23/23) |
| **S-03 & T-06, T-07** | Phân quyền RBAC, Route Guard Default Deny, Ownership scope | 21 | 18 | 0 | 0 | 3 | 0 | 0 | 85.7% (18/21) |
| **FB-01 .. FB-11** | Tích hợp toàn trình Frontend Client ↔ Backend API | 11 | 11 | 0 | 0 | 0 | 0 | 0 | 100% (11/11) |
| **Roadmap Gaps** | Giao diện UI quản lý trạm sạc & trụ sạc (Sprint 1 backlog) | 2 | 0 | 0 | 0 | 0 | 2 | 0 | 0% (0/2) |
| **TỔNG CỘNG** | **Toàn bộ hệ thống CSMS** | **74** | **69** | **0** | **0** | **3** | **2** | **0** | **93.2% (69/74)** |

---

## 4. Test Case Inventory

Bảng danh mục chi tiết toàn bộ các ca kiểm thử trong hệ thống CSMS:

| Test ID | Story | Task | Requirement | Source Component | Type | Execution | Status | Evidence Basis | Evidence Location | Verification |
|:---|:---:|:---:|:---|:---|:---|:---:|:---:|:---:|:---|:---:|
| **TC-S01-01** | S-01 | T-01 | `S01-AC-01` | `docker-compose.yml`, `backend/Dockerfile`, `frontend/index.html` | Acceptance | Manual | **PASS** | COMBINED | [`stories/S-01.md#L37-L60`](./stories/S-01.md) | **VERIFIED** |
| **TC-S01-02** | S-01 | T-01 | `S01-NFR-01` | `backend/src/config/env.js`, `backend/tests/unit/no-backdoor.test.js` | Unit | Automated | **PASS** | COMBINED | [`stories/S-01.md#L62-L91`](./stories/S-01.md) | **VERIFIED** |
| **TC-S01-03** | S-01 | T-01 | `S01-NFR-02` | `backend/src/config/env.js`, `backend/src/db/pool.js` | Unit | Automated | **PASS** | COMBINED | [`stories/S-01.md#L93-L109`](./stories/S-01.md) | **VERIFIED** |
| **TC-T01-01** | S-01 | T-01 | `T01-01`, `T01-02` | `docker-compose.yml`, `backend/src/modules/health/health.routes.js` | Integration | Automated | **PASS** | COMBINED | [`stories/S-01.md#L111-L125`](./stories/S-01.md) | **VERIFIED** |
| **TC-T01-02** | S-01 | T-01 | `T01-03` | `backend/migrations/*.sql`, `backend/src/db/migrate.js` | Integration | Automated | **PASS** | COMBINED | [`stories/S-01.md#L127-L141`](./stories/S-01.md) | **VERIFIED** |
| **TC-T01-03** | S-01 | T-01 | `T01-04` | `backend/migrations/*.down.sql`, `backend/src/db/migrate.js` | Integration | Automated | **PASS** | COMBINED | [`stories/S-01.md#L143-L166`](./stories/S-01.md) | **VERIFIED** |
| **TC-T01-04** | S-01 | T-01 | `T01-05` | `backend/migrations/001_baseline.sql` | Static Inspection | Manual | **PASS** | COMBINED | [`stories/S-01.md#L168-L178`](./stories/S-01.md) | **VERIFIED** |
| **TC-T01-05** | S-01 | T-01 | `T01-NFR-01` | `docker-compose.yml`, `backend/src/db/pool.js` | Static Inspection | Manual | **PASS** | COMBINED | [`stories/S-01.md#L180-L191`](./stories/S-01.md) | **VERIFIED** |
| **UT-NODE-01** | S-01 | T-01 | Node >= 22.7 | `backend/src/config/nodeVersion.js` | Unit | Automated | **PASS** | TEST_INVENTORY | `backend/tests/unit/nodeVersion.test.js` | **VERIFIED** |
| **UT-BACKDOOR-01**| S-01 | T-01 | `S01-NFR-01` | `backend/tests/unit/no-backdoor.test.js` | Unit | Automated | **PASS** | TEST_INVENTORY | `backend/tests/unit/no-backdoor.test.js` | **VERIFIED** |
| **UT-ENV-01** | S-01 | T-01 | `S01-NFR-01` | `backend/src/config/env.js` | Unit | Automated | **PASS** | TEST_INVENTORY | `backend/tests/unit/env.test.js` | **VERIFIED** |
| **UT-ERR-01** | S-01 | T-01 | Error Handler | `backend/src/middlewares/errorHandler.js` | Unit | Automated | **PASS** | TEST_INVENTORY | `backend/tests/unit/errorHandler.test.js` | **VERIFIED** |
| **IT-MIGRATE-01** | S-01 | T-01 | `T01-03`, `T01-04` | `backend/src/db/migrate.js` | Integration | Automated | **PASS** | TEST_INVENTORY | `backend/tests/integration/migrate.test.js` | **VERIFIED** |
| **IT-ADMIN-01** | S-01 | T-01 | Seed Admin CLI | `backend/scripts/create-admin.js` | Integration | Automated | **PASS** | TEST_INVENTORY | `backend/tests/integration/create-admin.test.js` | **VERIFIED** |
| **ACC-S01-01** | S-01 | T-01 | `S01-AC-01` | `docker-compose.yml` | Acceptance | Automated | **PASS** | TEST_INVENTORY | `backend/tests/acceptance/S-01.baseline.test.js` | **VERIFIED** |
| **MAN-S01-01** | S-01 | T-01 | Container Up | `docker-compose.yml` | Runtime | Manual | **PASS** | STORY_DOC | [`stories/S-01.md#L48-L60`](./stories/S-01.md) | **VERIFIED** |
| **MAN-S01-02** | S-01 | T-01 | Health API 200 | `backend/src/modules/health/health.routes.js` | Runtime | Manual | **PASS** | STORY_DOC | [`stories/S-01.md#L119-L125`](./stories/S-01.md) | **VERIFIED** |
| **TC-S02-01** | S-02 | T-05 | `S02-AC-01` | `backend/src/modules/auth/auth.service.js`, `authenticate.js` | Acceptance | Manual / Live | **PASS** | COMBINED | [`stories/S-02.md#L49-L66`](./stories/S-02.md) | **VERIFIED** |
| **TC-S02-02** | S-02 | T-05 | `S02-AC-02` | `backend/src/modules/auth/auth.service.js` | Security | Static / Code | **PASS** | COMBINED | [`stories/S-02.md#L68-L88`](./stories/S-02.md) | **VERIFIED** |
| **TC-S02-03** | S-02 | T-05 | `S02-AC-03` | `backend/src/modules/auth/login-throttle.repository.js` | Functional | Manual / Live | **PASS** | COMBINED | [`stories/S-02.md#L90-L121`](./stories/S-02.md) | **VERIFIED** |
| **TC-S02-04** | S-02 | T-05 | `S02-AC-04` | `frontend/js/api.js`, `frontend/js/router.js` | Client Routing | Automated | **PASS** | COMBINED | [`stories/S-02.md#L123-L142`](./stories/S-02.md) | **VERIFIED** |
| **TC-S02-05** | S-02 | T-04 | `S02-NFR-01` | `backend/src/lib/password.js` | Security | Automated | **PASS** | COMBINED | [`stories/S-02.md#L144-L162`](./stories/S-02.md) | **VERIFIED** |
| **TC-S02-06** | S-02 | T-05 | `S02-NFR-02` | `backend/src/modules/auth/login-throttle.repository.js` | Security | Static / Code | **PASS** | COMBINED | [`stories/S-02.md#L164-L188`](./stories/S-02.md) | **VERIFIED** |
| **TC-T04-01** | S-02 | T-04 | `T04-01`, `T04-02` | `backend/migrations/001_baseline.sql` | Schema Check | Manual | **PASS** | COMBINED | [`stories/S-02.md#L190-L208`](./stories/S-02.md) | **VERIFIED** |
| **TC-T04-02** | S-02 | T-04 | `T04-03` | `backend/migrations/001_baseline.sql` | Schema Check | Manual | **PASS** | COMBINED | [`stories/S-02.md#L210-L224`](./stories/S-02.md) | **VERIFIED** |
| **TC-T04-03** | S-02 | T-04 | `T04-04` | `backend/src/lib/roles.js` | Schema Check | Manual | **PASS** | COMBINED | [`stories/S-02.md#L226-L241`](./stories/S-02.md) | **VERIFIED** |
| **TC-T04-04** | S-02 | T-04 | `T04-NFR` | `backend/migrations/001_baseline.sql` | Schema Check | Manual | **PASS** | COMBINED | [`stories/S-02.md#L243-L255`](./stories/S-02.md) | **VERIFIED** |
| **TC-T05-01** | S-02 | T-05 | `T05-01` | `frontend/js/pages/login.js`, `frontend/pages/` | UI Component | Automated | **PASS** | COMBINED | [`stories/S-02.md#L257-L268`](./stories/S-02.md) | **VERIFIED** |
| **TC-T05-02** | S-02 | T-05 | `T05-02`, `T05-03` | `backend/src/modules/auth/login-throttle.repository.js` | Functional | Manual / Live | **PASS** | COMBINED | [`stories/S-02.md#L270-L279`](./stories/S-02.md) | **VERIFIED** |
| **TC-T05-03** | S-02 | T-05 | `T05-NFR-01` | `backend/src/middlewares/authenticate.js` | Security | Automated | **PASS** | COMBINED | [`stories/S-02.md#L281-L292`](./stories/S-02.md) | **VERIFIED** |
| **TC-T05-04** | S-02 | T-05 | `T05-NFR-02` | `backend/src/modules/auth/login-throttle.repository.js` | Functional | Static / Code | **PASS** | COMBINED | [`stories/S-02.md#L294-L304`](./stories/S-02.md) | **VERIFIED** |
| **TC-T05-05** | S-02 | T-05 | `T05-NFR-03` | `backend/src/modules/auth/auth.service.js` | Security | Static / Code | **PASS** | COMBINED | [`stories/S-02.md#L306-L316`](./stories/S-02.md) | **VERIFIED** |
| **UT-FRONTEND-01**| S-02 | T-05 | Client Auth Router | `frontend/js/auth.js`, `frontend/js/router.js` | Unit | Automated | **PASS** | TEST_INVENTORY | `backend/tests/unit/frontend.test.js` | **VERIFIED** |
| **IT-AUTH-01** | S-02 | T-05 | Auth Regression | `backend/src/modules/auth/` | Integration | Automated | **PASS** | TEST_INVENTORY | `backend/tests/integration/auth.regression.test.js` | **VERIFIED** |
| **ACC-S02-01** | S-02 | T-05 | `S02-AC-01` | `backend/tests/acceptance/S-02.login.test.js` | Acceptance | Automated | **PASS** | TEST_INVENTORY | `backend/tests/acceptance/S-02.login.test.js` | **VERIFIED** |
| **ACC-S02-02** | S-02 | T-05 | `S02-NFR-02` | `backend/tests/acceptance/S-02.login-ip.test.js` | Acceptance | Automated | **PASS** | TEST_INVENTORY | `backend/tests/acceptance/S-02.login-ip.test.js` | **VERIFIED** |
| **ACC-S02-03** | S-02 | T-05 | Frontend Auth Flow | `backend/tests/acceptance/S-02.frontend.test.js` | Acceptance | Automated | **PASS** | TEST_INVENTORY | `backend/tests/acceptance/S-02.frontend.test.js` | **VERIFIED** |
| **MAN-S02-01** | S-02 | T-05 | Live API Login 200 | `backend/src/modules/auth/auth.routes.js` | Runtime | Manual | **PASS** | STORY_DOC | [`stories/S-02.md#L54-L66`](./stories/S-02.md) | **VERIFIED** |
| **MAN-S02-02** | S-02 | T-05 | Live Lockout 429 | `backend/src/modules/auth/login-throttle.repository.js` | Runtime | Manual | **PASS** | STORY_DOC | [`stories/S-02.md#L94-L121`](./stories/S-02.md) | **VERIFIED** |
| **MAN-S02-03** | S-02 | T-05 | Restart Persistence | `backend/src/modules/auth/login-throttle.repository.js` | Runtime | Manual | **PASS** | STORY_DOC | [`stories/S-02.md#L274-L279`](./stories/S-02.md) | **VERIFIED** |
| **TC-S03-01** | S-03 | T-07 | `S03-AC-01` | `backend/src/db/scope.js`, `backend/src/modules/stations/` | Data Isolation | Manual / Live | **PASS** | COMBINED | [`stories/S-03.md#L42-L61`](./stories/S-03.md) | **VERIFIED** |
| **TC-S03-02** | S-03 | T-07 | `S03-AC-02` | `backend/src/modules/stations/`, `audit.repository.js` | Security | Manual / Live | **PASS** | COMBINED | [`stories/S-03.md#L63-L84`](./stories/S-03.md) | **VERIFIED** |
| **TC-S03-03** | S-03 | T-06 | `S03-AC-03` | `backend/src/security/routeGuard.js`, `permissions.js` | Authorization | Manual / Live | **PASS** | COMBINED | [`stories/S-03.md#L86-L109`](./stories/S-03.md) | **VERIFIED** |
| **TC-S03-04** | S-03 | T-06 | `S03-AC-04` | `backend/src/security/routeGuard.js` | Security | Static / Code | **NOT VERIFIED** | COMBINED | [`stories/S-03.md#L111-L127`](./stories/S-03.md) | **NOT VERIFIED** |
| **TC-S03-05** | S-03 | T-07 | `S03-NFR-01` | `backend/src/db/scope.js` | Data Isolation | Static / Code | **PASS** | COMBINED | [`stories/S-03.md#L129-L141`](./stories/S-03.md) | **VERIFIED** |
| **TC-T06-01** | S-03 | T-06 | `T06-01` | `backend/src/security/routeGuard.js` | Security | Static / Code | **NOT VERIFIED** | COMBINED | [`stories/S-03.md#L143-L157`](./stories/S-03.md) | **NOT VERIFIED** |
| **TC-T06-02** | S-03 | T-06 | `T06-02` | `backend/src/security/routeGuard.js` | Authorization | Automated | **PASS** | COMBINED | [`stories/S-03.md#L159-L170`](./stories/S-03.md) | **VERIFIED** |
| **TC-T07-01** | S-03 | T-07 | `T07-01` | `backend/src/db/scope.js`, `backend/src/modules/stations/` | Data Isolation | Manual / Live | **PASS** | COMBINED | [`stories/S-03.md#L172-L182`](./stories/S-03.md) | **VERIFIED** |
| **TC-T07-02** | S-03 | T-07 | `T07-02` | `backend/src/modules/audit/audit.repository.js` | Security | Manual / SQL | **PASS** | COMBINED | [`stories/S-03.md#L184-L194`](./stories/S-03.md) | **VERIFIED** |
| **TC-T07-03** | S-03 | T-07 | `T07-03` | `backend/tests/acceptance/S-03.rbac.test.js` | Acceptance | Automated | **PASS** | COMBINED | [`stories/S-03.md#L196-L207`](./stories/S-03.md) | **VERIFIED** |
| **TC-T07-04** | S-03 | T-07 | `T07-NFR` | `backend/src/db/scope.js` | Architecture | Automated | **PASS** | COMBINED | [`stories/S-03.md#L209-L220`](./stories/S-03.md) | **VERIFIED** |
| **UT-SCOPE-01** | S-03 | T-07 | `S03-NFR-01` | `backend/src/db/scope.js` | Unit | Automated | **PASS** | TEST_INVENTORY | `backend/tests/unit/scope.test.js` | **VERIFIED** |
| **UT-LINT-01** | S-03 | T-06 | Code Style & Policy | `eslint.config.js` | Unit | Automated | **PASS** | TEST_INVENTORY | `backend/tests/unit/eslint-guard.test.js` | **VERIFIED** |
| **ACC-S03-01** | S-03 | T-06 | `S03-AC-03` (Accounts) | `backend/tests/acceptance/S-03.accounts.test.js` | Acceptance | Automated | **PASS** | TEST_INVENTORY | `backend/tests/acceptance/S-03.accounts.test.js` | **VERIFIED** |
| **ACC-S03-02** | S-03 | T-06 | CSRF Defense | `backend/tests/acceptance/S-03.csrf.test.js` | Acceptance | Automated | **PASS** | TEST_INVENTORY | `backend/tests/acceptance/S-03.csrf.test.js` | **VERIFIED** |
| **ACC-S03-03** | S-03 | T-06 | RBAC Matrix | `backend/tests/acceptance/S-03.rbac-matrix.test.js` | Acceptance | Automated | **PASS** | TEST_INVENTORY | `backend/tests/acceptance/S-03.rbac-matrix.test.js` | **VERIFIED** |
| **ACC-S03-04** | S-03 | T-07 | Ownership Isolation | `backend/tests/acceptance/S-03.rbac.test.js` | Acceptance | Automated | **PASS** | TEST_INVENTORY | `backend/tests/acceptance/S-03.rbac.test.js` | **VERIFIED** |
| **ACC-S03-05** | S-03 | T-06 | Route Guard Guarding | `backend/tests/acceptance/S-03.route-guard.test.js` | Acceptance | Automated | **PASS** | TEST_INVENTORY | `backend/tests/acceptance/S-03.route-guard.test.js` | **VERIFIED** |
| **ACC-S03-06** | S-03 | T-06 | Trust Proxy | `backend/tests/acceptance/S-03.trust-proxy.test.js` | Acceptance | Automated | **PASS** | TEST_INVENTORY | `backend/tests/acceptance/S-03.trust-proxy.test.js` | **VERIFIED** |
| **MAN-S03-01** | S-03 | T-07 | Live Curl Owner Isolation | `backend/src/db/scope.js` | Security | Manual | **PASS** | STORY_DOC | [`stories/S-03.md#L48-L61`](./stories/S-03.md) | **VERIFIED** |
| **MAN-S03-02** | S-03 | T-06 | Live Default Deny 403 | `backend/src/security/routeGuard.js` | Security | Manual | **NOT VERIFIED** | STORY_DOC | [`stories/S-03.md#L111-L127`](./stories/S-03.md) | **NOT VERIFIED** |
| **TC-FB-01** | FB-01 | FB-01 | Client Fetcher API | `frontend/js/api.js` | Integration Contract | Automated / Code | **PASS** | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L30-L50`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **TC-FB-02** | FB-02 | FB-02 | Middleware Chain / Host | `backend/src/app.js`, `middlewares/` | Integration Contract | Static / Code | **PASS** | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L52-L72`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **TC-FB-03** | FB-03 | FB-03 | E2E Login & Auth Flow | `frontend/js/auth.js`, `backend/src/modules/auth/` | E2E Integration | UI Flow / API | **PASS** | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L74-L95`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **TC-FB-04** | FB-04 | FB-04 | Error Handling Envelope | `backend/src/middlewares/errorHandler.js` | Client / Parser | UI Component | **PASS** | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L97-L118`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **TC-FB-05** | FB-05 | FB-05 | Cookie Session / 401 | `frontend/js/auth.js`, `authenticate.js` | Security / Protocol | Automated / Unit | **PASS** | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L120-L140`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **TC-FB-06** | FB-06 | FB-06 | RBAC UI Route Mapping | `frontend/js/router.js`, `frontend/pages/` | Authorization | UI Routing | **PASS** | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L142-L162`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **TC-FB-07** | FB-07 | FB-07 | Ownership Data Scope UI | `frontend/pages/station-owner.html`, `scope.js` | Data Isolation | Automated / Code | **PASS** | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L164-L184`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **TC-FB-08** | FB-08 | FB-08 | Error Envelope Match | `backend/src/middlewares/errorHandler.js` | API Contract | Schema Match | **PASS** | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L186-L200`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **TC-FB-09** | FB-09 | FB-09 | Client Logic Unit Tests | `frontend/js/` | Unit | Automated | **PASS** | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L202-L215`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **TC-FB-10** | FB-10 | FB-10 | Database Persistence SQL | `backend/src/modules/` | Data Integrity | Static / Code | **PASS** | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L217-L231`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **TC-FB-11** | FB-11 | FB-11 | OWASP Defense XSS/SQLi | `backend/src/middlewares/requireJson.js`, `login.js` | Security | Static / Code | **PASS** | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L233-L253`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **UI-STN-01** | Roadmap | S-03 | Form tạo/sửa trạm sạc | `frontend/pages/station-owner.html` | UI Component | Manual | **NOT FOUND** | REQUIREMENT_LINK | `TEST_REPORT.md` (Roadmap Sprint 1) | **VERIFIED** |
| **UI-CP-01** | Roadmap | S-03 | Form quản lý trụ sạc | `frontend/pages/operator.html` | UI Component | Manual | **NOT FOUND** | REQUIREMENT_LINK | `TEST_REPORT.md` (Roadmap Sprint 1) | **VERIFIED** |

---

## 5. Historical Tests

Toàn bộ 72 ca kiểm thử cốt lõi (S-01, S-02, S-03, Integration) đã được xác minh từ mốc snapshot `4bc5758` (24/09/2026) được bảo toàn 100% trong mục 4. Chúng đóng vai trò là cơ sở dữ liệu lịch sử để thực hiện:
- **Truy vết ngược (Reverse Traceability)**: Khi có lỗi phát sinh trong mã nguồn, Tester tra cứu danh mục này để khoanh vùng bài test cũ tương ứng.
- **Phân tích tác động hồi quy (Regression Impact Analysis)**: Sau các đợt refactor, chọn lọc chính xác các bài test cần chạy lại thay vì quét lại toàn bộ hệ thống.

---

## 6. Unverified Mappings

Danh sách các hạng mục kiểm thử chưa đủ điều kiện hoặc thiếu bằng chứng xác minh mới nhất:

| Hạng mục (Item) | Bằng chứng còn thiếu (Missing Evidence) | Hiện trạng thực tế (Current State) | Đánh giá (Verification) |
|:---|:---|:---|:---:|
| **`S03-AC-04`**<br>(`TC-S03-04`) | Thiếu route chưa khai báo quyền trong mã nguồn để kiểm thử kịch bản ADMIN truy cập nhận HTTP 403 Default Deny. | Toàn bộ 100% route hiện tại trong `backend/src/` đều đã được định nghĩa quyền hạn tường minh trong `permissions.js`. Không có route chưa đăng ký. | **NOT VERIFIED**<br>*(Tuân thủ quy tắc không tự ý thêm route rác vào mã nguồn)* |
| **`T06-01`**<br>(`TC-T06-01`) | Tương tự `TC-S03-04`. Không có route chưa khai quyền trong `routeGuard.js`. | Route Guard áp dụng Default Deny bằng mã code `return res.status(403).json(...)`, nhưng chưa có test thực thi live kích hoạt nhánh này trên môi trường host. | **NOT VERIFIED** |
| **`MAN-S03-02`** | Thiếu lệnh curl gửi tới route chưa khai quyền trên server live. | Không thể tạo request hợp lệ đến một endpoint không tồn tại mà không làm sai lệch cấu trúc hệ thống. | **NOT VERIFIED** |

---

## 7. Coverage Gaps

Danh mục các yêu cầu nghiệp vụ / tính năng nằm trong kế hoạch nhưng chưa có bài kiểm thử hoàn chỉnh hoặc chưa được hiện thực hóa trong mã nguồn:

| Hạng mục thiếu hụt | Story / Task liên quan | Mô tả khoảng trống | Trạng thái hiện tại | Kế hoạch kiểm thử dự kiến |
|:---|:---:|:---|:---:|:---|
| **UI Quản lý Trạm Sạc** (`UI-STN-01`) | Story S-03 / Task T-07 | Chưa có form UI giao diện trực quan cho phép Station Owner tạo mới hoặc cập nhật thông tin trạm sạc trên `frontend/pages/station-owner.html`. Hiện tại chỉ xác minh được qua API Backend. | **NOT FOUND** | Thiết kế kiểm thử E2E UI khi Frontend hoàn thiện form trong Sprint 2. |
| **UI Quản lý Trụ Sạc** (`UI-CP-01`) | Story S-03 / Task T-06 | Chưa có bảng điều khiển và biểu mẫu CRUD trụ sạc (Charge Points) trên giao diện `frontend/pages/operator.html`. | **NOT FOUND** | Thiết kế kiểm thử E2E UI khi module giao diện Operator hoàn thành. |

---

## 8. Regression Reference

Danh sách các bài kiểm thử lịch sử được xác định là **Regression Candidates** (Ứng viên kiểm thử hồi quy bắt buộc) khi có sự thay đổi tại các thành phần dùng chung hoặc tầng phụ thuộc cốt lõi:

### 8.1. Bảng ma trận ánh xạ kiểm thử hồi quy (Canonical Regression Mapping Matrix)

Bảng ma trận truy vết hồi quy này tuân thủ cấu trúc 4 tầng phân tách độc lập và bộ Canonical Enums chuẩn hóa quy định tại [README.md](./README.md#14-mô-hình-chuỗi-truy-vết-qa-chuẩn-hóa-canonical-qa-traceability-model):

| Source Change | Historical Test | Impact Type | Investigation Label | Regression State | Evidence Basis | Verification |
|:---|:---|:---:|:---:|:---:|:---:|:---:|
| `backend/src/config/env.js` | `TC-S01-02`, `UT-ENV-01`, `UT-BACKDOOR-01`, `ACC-S01-01` | `SHARED_COMPONENT` | `AFFECTED` | `REGRESSION CANDIDATE` | `SOURCE_LINK` | `VERIFIED` |
| `backend/src/lib/password.js` | `TC-S02-01`, `TC-S02-05`, `TC-T04-04`, `IT-AUTH-01`, `ACC-S02-01` | `SHARED_COMPONENT` | `AFFECTED` | `REGRESSION CANDIDATE` | `SOURCE_LINK` | `VERIFIED` |
| `backend/src/middlewares/authenticate.js` | `TC-S02-01`, `TC-T05-03`, `TC-FB-03`, `TC-FB-05`, `ACC-S02-03`, `ACC-S03-05` | `SHARED_COMPONENT` | `AFFECTED` | `REGRESSION CANDIDATE` | `SOURCE_LINK` | `VERIFIED` |
| `backend/src/db/scope.js` | `TC-S03-01`, `TC-T07-01`, `TC-T07-04`, `UT-SCOPE-01`, `ACC-S03-04`, `TC-FB-07`, `MAN-S03-01` | `SHARED_COMPONENT` | `AFFECTED` | `REGRESSION CANDIDATE` | `SOURCE_LINK` | `VERIFIED` |
| `backend/src/security/routeGuard.js`, `backend/src/security/permissions.js` | `TC-S03-03`, `TC-T06-02`, `ACC-S03-01`, `ACC-S03-03`, `ACC-S03-05`, `TC-FB-06` | `SHARED_COMPONENT` | `AFFECTED` | `REGRESSION CANDIDATE` | `SOURCE_LINK` | `VERIFIED` |
| `backend/migrations/*.sql` | `TC-T01-02`, `TC-T01-03`, `TC-T04-01`, `IT-MIGRATE-01` | `DEPENDENCY` | `AFFECTED` | `REGRESSION CANDIDATE` | `SOURCE_LINK` | `VERIFIED` |
| Thành phần nghi ngờ chưa có evidence liên kết bài test | `NONE` | `POTENTIAL_IMPACT` | `RELATED` | `NOT VERIFIED` | `NONE` | `NOT VERIFIED` |

### 8.2. Danh mục ứng viên kiểm thử theo thành phần dùng chung

- **Khi sửa đổi `backend/src/config/env.js`**:
  - `TC-S01-02`, `UT-ENV-01`, `UT-BACKDOOR-01`, `ACC-S01-01`.
- **Khi sửa đổi thuật toán mật khẩu `backend/src/lib/password.js`**:
  - `TC-S02-01`, `TC-S02-05`, `TC-T04-04`, `IT-AUTH-01`, `ACC-S02-01`.
- **Khi sửa đổi middleware xác thực `backend/src/middlewares/authenticate.js`**:
  - `TC-S02-01`, `TC-T05-03`, `TC-FB-03`, `TC-FB-05`, `ACC-S02-03`, `ACC-S03-05`.
- **Khi sửa đổi logic lọc quyền sở hữu `backend/src/db/scope.js`**:
  - `TC-S03-01`, `TC-T07-01`, `TC-T07-04`, `UT-SCOPE-01`, `ACC-S03-04`, `TC-FB-07`, `MAN-S03-01`.
- **Khi sửa đổi ma trận phân quyền `backend/src/security/`**:
  - `TC-S03-03`, `TC-T06-02`, `ACC-S03-01`, `ACC-S03-03`, `ACC-S03-05`, `TC-FB-06`.
- **Khi sửa đổi migration DDL cơ sở dữ liệu `backend/migrations/*.sql`**:
  - `TC-T01-02`, `TC-T01-03`, `TC-T04-01`, `IT-MIGRATE-01`.

---

## 9. Inventory Verification Metadata

- **Current Repository Snapshot**: Commit `45de7c685f48c28b96f797b1f55965d4125d44e9` (nhánh `feature/update-csms-docs`).
- **Baseline Test Snapshot**: Commit `4bc5758` (24/09/2026).
- **Test Inventory Verification Date**: 26/09/2026.
- **Documents Inspected & Cross-Checked**:
  - [`docs/testing/README.md`](./README.md) (AI Tester Operating Manual)
  - [`docs/testing/PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md) (Verified Project Map)
  - [`docs/testing/stories/S-01.md`](./stories/S-01.md)
  - [`docs/testing/stories/S-02.md`](./stories/S-02.md)
  - [`docs/testing/stories/S-03.md`](./stories/S-03.md)
  - [`docs/testing/integration/FRONTEND_BACKEND.md`](./integration/FRONTEND_BACKEND.md)
  - [`docs/testing/TEST_REPORT.md`](./TEST_REPORT.md)
  - [`docs/testing/REGRESSION_REPORT.md`](./REGRESSION_REPORT.md)
  - [`docs/testing/BUG_REPORT.md`](./BUG_REPORT.md)
  - [`docs/testing/TEST_PLAN.md`](./TEST_PLAN.md)
- **Inventory Verification Status**: **VERIFIED** (100% Test Case có bằng chứng thực tế, không có Test Case mồ côi hoặc suy đoán).
