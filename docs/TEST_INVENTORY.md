# TEST INVENTORY

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Người thực hiện**: TESTER / QA ANALYST  
> **Snapshot Date**: 28/09/2026  
> **Git Commit**: `86769949c03381429fd4931f3b364341ac618f8f` (nhánh `main`)  
> **Entry Point / Router**: [`docs/README.md`](./README.md)  
> **Tài liệu quy chuẩn**: [`docs/TESTER_STANDARD.md`](./TESTER_STANDARD.md) (BỘ QUY CHUẨN TESTER TRUNG TÂM)  
> **Bản đồ tham chiếu**: [`docs/PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md) (VERIFIED PROJECT MAP)  

---

> **Ghi chú cập nhật 28/09/2026 — số test tự động:** bộ test của Developer hiện có **138 test, 138 pass** (12 file acceptance, 4 integration, 10 unit; chạy bằng `npm test` trong `backend/`). Đợt này thêm: `unit/frontend-permissions.test.js` (bảng quyền frontend khớp backend), `integration/seed-demo.test.js` (dữ liệu demo), các ca mới trong `unit/frontend.test.js` (router hash, menu theo quyền, nhóm trạng thái OCPP) và `acceptance/S-02.frontend.test.js` (không innerHTML, không tài nguyên ngoài, mọi workspace có trang). Bảng test case QA ở mục 3–5 là hồ sơ xác minh tới mốc snapshot ghi ở đầu file, **chưa gồm** các ca mới này và chưa được QA chạy lại trên giao diện mới; đường dẫn `frontend/js/*` trong hồ sơ cũ tra theo [`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md) mục 0.

---

## 1. Purpose

Tài liệu này là **VERIFIED TEST INDEX** (Chỉ mục danh mục kiểm thử đã qua xác minh) của dự án CSMS:
- Đóng vai trò là nguồn sự thật trung tâm quản lý danh mục kiểm thử, ánh xạ giữa ca kiểm thử (Test Case), yêu cầu nghiệp vụ (AC/NFR), nhiệm vụ kỹ thuật (Task), câu chuyện người dùng (Story) và thành phần mã nguồn (Source Component).
- Lưu giữ và bảo toàn toàn bộ các bài kiểm thử lịch sử (Historical Tests) phục vụ cơ chế truy vết hai chiều (Bidirectional Traceability) và phân tích ảnh hưởng khi kiểm thử hồi quy (Regression Analysis).
- Không chứa nội dung chi tiết kịch bản kiểm thử (nội dung kịch bản được lưu trữ độc lập tại `stories/*.md` và `integration/*.md`).
- **Phân lập với General Review**: Tài liệu này **CHỈ THEO DÕI VÀ LƯU TRỮ KẾT QUẢ CỦA LUỒNG REQUIREMENT TESTING**. Mọi quan sát kỹ thuật từ luồng **General Review** được quản lý độc lập tại Khu vực B của hồ sơ Story hoặc báo cáo review riêng, tuyệt đối không tự ý đưa vào bảng này làm biến đổi Test Status của hệ thống.

---

## 2. Test Inventory Alignment & Traceability Standards

Tài liệu này chỉ lưu trữ **SỰ THẬT KIỂM THỬ (TEST FACTS)** đã được xác minh thực tế trên hệ thống. Mọi quy chuẩn vận hành, định nghĩa và luật bất biến được quản lý tập trung tại [`docs/TESTER_STANDARD.md`](./TESTER_STANDARD.md):

1. **Tuân thủ Canonical Enums**: Mọi giá trị gán cho `Impact Type`, `Investigation Label`, `Regression State`, `Test Status`, `Verification`, `Evidence Basis` và `Defect Classification` đều tuân thủ nghiêm ngặt theo chuẩn mực tại [`TESTER_STANDARD.md` Mục 8](./TESTER_STANDARD.md#8-hệ-thống-giá-trị-chuẩn-canonical-enums--quy-tắc-bảo-toàn).
2. **Quy tắc bảo tồn bài test lịch sử**: 100% các Test Case từ Story cũ (`S-01`, `S-02`, `S-03`) và Story hiện tại (`S-04`) đều được duy trì nguyên vẹn để phục vụ phân tích tác động và chọn lọc ứng viên kiểm thử hồi quy (Regression Candidates).
3. **Phân biệt độc lập giữa Status và Verification**:
   - `Status`: Kết quả thực thi thực tế của bài test (`PASS`, `FAIL`, `BLOCKED`, `NOT VERIFIED`, `NOT FOUND`, `NOT RUN`).
   - `Verification`: Trạng thái kiểm thực của bằng chứng và mapping (`VERIFIED`, `NOT VERIFIED`).
   - Tuyệt đối không hoán đổi hoặc suy đoán kết quả khi chưa có bằng chứng thực tế đo được.
4. **Không định nghĩa luật tại đây**: Mọi thắc mắc về tiêu chí chấp nhận trạng thái, chu trình chuyển trạng thái 4 tầng và nguyên tắc điều tra lỗi, tham chiếu trực tiếp tại [`docs/TESTER_STANDARD.md`](./TESTER_STANDARD.md).
5. **Ranh giới bất khả xâm phạm**: Không biến General Review Observation thành Defect/Bug hay làm đổi `Status` trong bảng này nếu chưa có bằng chứng vi phạm AC/NFR.

---

## 3. Test Coverage Summary

| Nhóm kiểm thử | Phạm vi chức năng | Tổng số test | PASS | FAIL | BLOCKED | NOT VERIFIED | NOT FOUND | NOT RUN | Tỷ lệ VERIFIED |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **S-01 & T-01** | Khung ứng dụng, Docker container & PostgreSQL baseline | 17 | 17 | 0 | 0 | 0 | 0 | 0 | 100% (17/17) |
| **S-02 & T-04, T-05** | Xác thực đăng nhập, Argon2id, Cookie session, Lockout 15p | 23 | 23 | 0 | 0 | 0 | 0 | 0 | 100% (23/23) |
| **S-03 & T-06, T-07** | Phân quyền RBAC, Route Guard Default Deny, Ownership scope | 21 | 18 | 0 | 0 | 3 | 0 | 0 | 85.7% (18/21) |
| **S-04 & T-08, T-09** | Chủ trạm tạo và sửa trạm, dải tọa độ, idempotency, UI form | 14 | 14 | 0 | 0 | 0 | 0 | 0 | 100% (14/14) |
| **S-05 & T-10, T-11** | Thêm trụ và đầu nối, mã trụ duy nhất, kiểm tra trùng ô nhập | 5 | 4 | 0 | 0 | 1 | 0 | 0 | 80% (4/5) |
| **FB-01 .. FB-11** | Tích hợp toàn trình Frontend Client ↔ Backend API | 11 | 11 | 0 | 0 | 0 | 0 | 0 | 100% (11/11) |
| **Roadmap Gaps** | Giao diện UI quản lý trụ sạc (Sprint 1 backlog K-01/S-05) | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 0% (0/1) |
| **TỔNG CỘNG** | **Toàn bộ hệ thống CSMS** | **92** | **87** | **0** | **0** | **4** | **1** | **0** | **94.6% (87/92)** |

---

## 4. Test Case Inventory

Bảng danh mục chi tiết toàn bộ các ca kiểm thử trong hệ thống CSMS:

| Test ID | Story | Task | Requirement | Source Component | Type | Execution | Status | Defect ID | Evidence Basis | Evidence Location | Verification |
|:---|:---:|:---:|:---|:---|:---|:---:|:---:|:---:|:---:|:---|:---:|
| **TC-S01-01** | S-01 | T-01 | `S01-AC-01` | `docker-compose.yml`, `backend/Dockerfile`, `frontend/index.html` | Acceptance | Manual | **PASS** | `BUG-01, BUG-03 (CLOSED)` | COMBINED | [`stories/S-01.md#L37-L60`](./stories/S-01.md) | **VERIFIED** |
| **TC-S01-02** | S-01 | T-01 | `S01-NFR-01` | `backend/src/config/env.js`, `backend/tests/unit/no-backdoor.test.js` | Unit | Automated | **PASS** | `BUG-04 (CLOSED)` | COMBINED | [`stories/S-01.md#L62-L91`](./stories/S-01.md) | **VERIFIED** |
| **TC-S01-03** | S-01 | T-01 | `S01-NFR-02` | `backend/src/config/env.js`, `backend/src/db/pool.js` | Unit | Automated | **PASS** | `BUG-04 (CLOSED)` | COMBINED | [`stories/S-01.md#L93-L109`](./stories/S-01.md) | **VERIFIED** |
| **TC-T01-01** | S-01 | T-01 | `T01-01`, `T01-02` | `docker-compose.yml`, `backend/src/modules/health/health.routes.js` | Integration | Automated | **PASS** | `BUG-02, BUG-03 (CLOSED)` | COMBINED | [`stories/S-01.md#L111-L125`](./stories/S-01.md) | **VERIFIED** |
| **TC-T01-02** | S-01 | T-01 | `T01-03` | `backend/migrations/*.sql`, `backend/src/db/migrate.js` | Integration | Automated | **PASS** | `BUG-02, BUG-03 (CLOSED)` | COMBINED | [`stories/S-01.md#L127-L141`](./stories/S-01.md) | **VERIFIED** |
| **TC-T01-03** | S-01 | T-01 | `T01-04` | `backend/migrations/*.down.sql`, `backend/src/db/migrate.js` | Integration | Automated | **PASS** | `NONE` | COMBINED | [`stories/S-01.md#L143-L166`](./stories/S-01.md) | **VERIFIED** |
| **TC-T01-04** | S-01 | T-01 | `T01-05` | `backend/migrations/001_baseline.sql` | Static Inspection | Manual | **PASS** | `NONE` | COMBINED | [`stories/S-01.md#L168-L178`](./stories/S-01.md) | **VERIFIED** |
| **TC-T01-05** | S-01 | T-01 | `T01-NFR-01` | `docker-compose.yml`, `backend/src/db/pool.js` | Static Inspection | Manual | **PASS** | `NONE` | COMBINED | [`stories/S-01.md#L180-L191`](./stories/S-01.md) | **VERIFIED** |
| **UT-NODE-01** | S-01 | T-01 | Node >= 22.7 | `backend/src/config/nodeVersion.js` | Unit | Automated | **PASS** | `NONE` | TEST_INVENTORY | `backend/tests/unit/nodeVersion.test.js` | **VERIFIED** |
| **UT-BACKDOOR-01**| S-01 | T-01 | `S01-NFR-01` | `backend/tests/unit/no-backdoor.test.js` | Unit | Automated | **PASS** | `NONE` | TEST_INVENTORY | `backend/tests/unit/no-backdoor.test.js` | **VERIFIED** |
| **UT-ENV-01** | S-01 | T-01 | `S01-NFR-01` | `backend/src/config/env.js` | Unit | Automated | **PASS** | `BUG-03, BUG-04 (CLOSED)` | TEST_INVENTORY | `backend/tests/unit/env.test.js` | **VERIFIED** |
| **UT-ERR-01** | S-01 | T-01 | Error Handler | `backend/src/middlewares/errorHandler.js` | Unit | Automated | **PASS** | `BUG-03 (CLOSED)` | TEST_INVENTORY | `backend/tests/unit/errorHandler.test.js` | **VERIFIED** |
| **IT-MIGRATE-01** | S-01 | T-01 | `T01-03`, `T01-04` | `backend/src/db/migrate.js` | Integration | Automated | **PASS** | `BUG-02 (CLOSED)` | TEST_INVENTORY | `backend/tests/integration/migrate.test.js` | **VERIFIED** |
| **IT-ADMIN-01** | S-01 | T-01 | Seed Admin CLI | `backend/scripts/create-admin.js` | Integration | Automated | **PASS** | `BUG-03 (CLOSED)` | TEST_INVENTORY | `backend/tests/integration/create-admin.test.js` | **VERIFIED** |
| **ACC-S01-01** | S-01 | T-01 | `S01-AC-01` | `docker-compose.yml` | Acceptance | Automated | **PASS** | `BUG-02 (CLOSED)` | TEST_INVENTORY | `backend/tests/acceptance/S-01.baseline.test.js` | **VERIFIED** |
| **MAN-S01-01** | S-01 | T-01 | Container Up | `docker-compose.yml` | Runtime | Manual | **PASS** | `BUG-01 (CLOSED)` | STORY_DOC | [`stories/S-01.md#L48-L60`](./stories/S-01.md) | **VERIFIED** |
| **MAN-S01-02** | S-01 | T-01 | Health API 200 | `backend/src/modules/health/health.routes.js` | Runtime | Manual | **PASS** | `NONE` | STORY_DOC | [`stories/S-01.md#L119-L125`](./stories/S-01.md) | **VERIFIED** |
| **TC-S02-01** | S-02 | T-05 | `S02-AC-01` | `backend/src/modules/auth/auth.service.js`, `authenticate.js` | Acceptance | Manual / Live | **PASS** | `NONE` | COMBINED | [`stories/S-02.md#L49-L66`](./stories/S-02.md) | **VERIFIED** |
| **TC-S02-02** | S-02 | T-05 | `S02-AC-02` | `backend/src/modules/auth/auth.service.js` | Security | Static / Code | **PASS** | `NONE` | COMBINED | [`stories/S-02.md#L68-L88`](./stories/S-02.md) | **VERIFIED** |
| **TC-S02-03** | S-02 | T-05 | `S02-AC-03` | `backend/src/modules/auth/login-throttle.repository.js` | Functional | Manual / Live | **PASS** | `NONE` | COMBINED | [`stories/S-02.md#L90-L121`](./stories/S-02.md) | **VERIFIED** |
| **TC-S02-04** | S-02 | T-05 | `S02-AC-04` | `frontend/js/api.js`, `frontend/js/router.js` | Client Routing | Automated | **PASS** | `NONE` | COMBINED | [`stories/S-02.md#L123-L142`](./stories/S-02.md) | **VERIFIED** |
| **TC-S02-05** | S-02 | T-04 | `S02-NFR-01` | `backend/src/lib/password.js` | Security | Automated | **PASS** | `NONE` | COMBINED | [`stories/S-02.md#L144-L162`](./stories/S-02.md) | **VERIFIED** |
| **TC-S02-06** | S-02 | T-05 | `S02-NFR-02` | `backend/src/modules/auth/login-throttle.repository.js` | Security | Static / Code | **PASS** | `NONE` | COMBINED | [`stories/S-02.md#L164-L188`](./stories/S-02.md) | **VERIFIED** |
| **TC-T04-01** | S-02 | T-04 | `T04-01`, `T04-02` | `backend/migrations/001_baseline.sql` | Schema Check | Manual | **PASS** | `NONE` | COMBINED | [`stories/S-02.md#L190-L208`](./stories/S-02.md) | **VERIFIED** |
| **TC-T04-02** | S-02 | T-04 | `T04-03` | `backend/migrations/001_baseline.sql` | Schema Check | Manual | **PASS** | `NONE` | COMBINED | [`stories/S-02.md#L210-L224`](./stories/S-02.md) | **VERIFIED** |
| **TC-T04-03** | S-02 | T-04 | `T04-04` | `backend/src/lib/roles.js` | Schema Check | Manual | **PASS** | `NONE` | COMBINED | [`stories/S-02.md#L226-L241`](./stories/S-02.md) | **VERIFIED** |
| **TC-T04-04** | S-02 | T-04 | `T04-NFR` | `backend/migrations/001_baseline.sql` | Schema Check | Manual | **PASS** | `NONE` | COMBINED | [`stories/S-02.md#L243-L255`](./stories/S-02.md) | **VERIFIED** |
| **TC-T05-01** | S-02 | T-05 | `T05-01` | `frontend/js/pages/login.js`, `frontend/pages/` | UI Component | Automated | **PASS** | `NONE` | COMBINED | [`stories/S-02.md#L257-L268`](./stories/S-02.md) | **VERIFIED** |
| **TC-T05-02** | S-02 | T-05 | `T05-02`, `T05-03` | `backend/src/modules/auth/login-throttle.repository.js` | Functional | Manual / Live | **PASS** | `NONE` | COMBINED | [`stories/S-02.md#L270-L279`](./stories/S-02.md) | **VERIFIED** |
| **TC-T05-03** | S-02 | T-05 | `T05-NFR-01` | `backend/src/middlewares/authenticate.js` | Security | Automated | **PASS** | `NONE` | COMBINED | [`stories/S-02.md#L281-L292`](./stories/S-02.md) | **VERIFIED** |
| **TC-T05-04** | S-02 | T-05 | `T05-NFR-02` | `backend/src/modules/auth/login-throttle.repository.js` | Functional | Static / Code | **PASS** | `NONE` | COMBINED | [`stories/S-02.md#L294-L304`](./stories/S-02.md) | **VERIFIED** |
| **TC-T05-05** | S-02 | T-05 | `T05-NFR-03` | `backend/src/modules/auth/auth.service.js` | Security | Static / Code | **PASS** | `NONE` | COMBINED | [`stories/S-02.md#L306-L316`](./stories/S-02.md) | **VERIFIED** |
| **UT-FRONTEND-01**| S-02 | T-05 | Client Auth Router | `frontend/js/auth.js`, `frontend/js/router.js` | Unit | Automated | **PASS** | `NONE` | TEST_INVENTORY | `backend/tests/unit/frontend.test.js` | **VERIFIED** |
| **IT-AUTH-01** | S-02 | T-05 | Auth Regression | `backend/src/modules/auth/` | Integration | Automated | **PASS** | `NONE` | TEST_INVENTORY | `backend/tests/integration/auth.regression.test.js` | **VERIFIED** |
| **ACC-S02-01** | S-02 | T-05 | `S02-AC-01` | `backend/tests/acceptance/S-02.login.test.js` | Acceptance | Automated | **PASS** | `BUG-02 (CLOSED)` | TEST_INVENTORY | `backend/tests/acceptance/S-02.login.test.js` | **VERIFIED** |
| **ACC-S02-02** | S-02 | T-05 | `S02-NFR-02` | `backend/tests/acceptance/S-02.login-ip.test.js` | Acceptance | Automated | **PASS** | `BUG-02 (CLOSED)` | TEST_INVENTORY | `backend/tests/acceptance/S-02.login-ip.test.js` | **VERIFIED** |
| **ACC-S02-03** | S-02 | T-05 | Frontend Auth Flow | `backend/tests/acceptance/S-02.frontend.test.js` | Acceptance | Automated | **PASS** | `BUG-02 (CLOSED)` | TEST_INVENTORY | `backend/tests/acceptance/S-02.frontend.test.js` | **VERIFIED** |
| **MAN-S02-01** | S-02 | T-05 | Live API Login 200 | `backend/src/modules/auth/auth.routes.js` | Runtime | Manual | **PASS** | `NONE` | STORY_DOC | [`stories/S-02.md#L54-L66`](./stories/S-02.md) | **VERIFIED** |
| **MAN-S02-02** | S-02 | T-05 | Live Lockout 429 | `backend/src/modules/auth/login-throttle.repository.js` | Runtime | Manual | **PASS** | `NONE` | STORY_DOC | [`stories/S-02.md#L94-L121`](./stories/S-02.md) | **VERIFIED** |
| **MAN-S02-03** | S-02 | T-05 | Restart Persistence | `backend/src/modules/auth/login-throttle.repository.js` | Runtime | Manual | **PASS** | `NONE` | STORY_DOC | [`stories/S-02.md#L274-L279`](./stories/S-02.md) | **VERIFIED** |
| **TC-S03-01** | S-03 | T-07 | `S03-AC-01` | `backend/src/db/scope.js`, `backend/src/modules/stations/` | Data Isolation | Manual / Live | **PASS** | `NONE` | COMBINED | [`stories/S-03.md#L42-L61`](./stories/S-03.md) | **VERIFIED** |
| **TC-S03-02** | S-03 | T-07 | `S03-AC-02` | `backend/src/modules/stations/`, `audit.repository.js` | Security | Manual / Live | **PASS** | `NONE` | COMBINED | [`stories/S-03.md#L63-L84`](./stories/S-03.md) | **VERIFIED** |
| **TC-S03-03** | S-03 | T-06 | `S03-AC-03` | `backend/src/security/routeGuard.js`, `permissions.js` | Authorization | Manual / Live | **PASS** | `NONE` | COMBINED | [`stories/S-03.md#L86-L109`](./stories/S-03.md) | **VERIFIED** |
| **TC-S03-04** | S-03 | T-06 | `S03-AC-04` | `backend/src/security/routeGuard.js` | Security | Static / Code | **NOT VERIFIED** | `NONE` | COMBINED | [`stories/S-03.md#L111-L127`](./stories/S-03.md) | **NOT VERIFIED** |
| **TC-S03-05** | S-03 | T-07 | `S03-NFR-01` | `backend/src/db/scope.js` | Data Isolation | Static / Code | **PASS** | `NONE` | COMBINED | [`stories/S-03.md#L129-L141`](./stories/S-03.md) | **VERIFIED** |
| **TC-T06-01** | S-03 | T-06 | `T06-01` | `backend/src/security/routeGuard.js` | Security | Static / Code | **NOT VERIFIED** | `NONE` | COMBINED | [`stories/S-03.md#L143-L157`](./stories/S-03.md) | **NOT VERIFIED** |
| **TC-T06-02** | S-03 | T-06 | `T06-02` | `backend/src/security/routeGuard.js` | Authorization | Automated | **PASS** | `NONE` | COMBINED | [`stories/S-03.md#L159-L170`](./stories/S-03.md) | **VERIFIED** |
| **TC-T07-01** | S-03 | T-07 | `T07-01` | `backend/src/db/scope.js`, `backend/src/modules/stations/` | Data Isolation | Manual / Live | **PASS** | `NONE` | COMBINED | [`stories/S-03.md#L172-L182`](./stories/S-03.md) | **VERIFIED** |
| **TC-T07-02** | S-03 | T-07 | `T07-02` | `backend/src/modules/audit/audit.repository.js` | Security | Manual / SQL | **PASS** | `NONE` | COMBINED | [`stories/S-03.md#L184-L194`](./stories/S-03.md) | **VERIFIED** |
| **TC-T07-03** | S-03 | T-07 | `T07-03` | `backend/tests/acceptance/S-03.rbac.test.js` | Acceptance | Automated | **PASS** | `NONE` | COMBINED | [`stories/S-03.md#L196-L207`](./stories/S-03.md) | **VERIFIED** |
| **TC-T07-04** | S-03 | T-07 | `T07-NFR` | `backend/src/db/scope.js` | Architecture | Automated | **PASS** | `NONE` | COMBINED | [`stories/S-03.md#L209-L220`](./stories/S-03.md) | **VERIFIED** |
| **UT-SCOPE-01** | S-03 | T-07 | `S03-NFR-01` | `backend/src/db/scope.js` | Unit | Automated | **PASS** | `NONE` | TEST_INVENTORY | `backend/tests/unit/scope.test.js` | **VERIFIED** |
| **UT-LINT-01** | S-03 | T-06 | Code Style & Policy | `eslint.config.js` | Unit | Automated | **PASS** | `BUG-05 (CLOSED)` | TEST_INVENTORY | `backend/tests/unit/eslint-guard.test.js` | **VERIFIED** |
| **ACC-S03-01** | S-03 | T-06 | `S03-AC-03` (Accounts) | `backend/tests/acceptance/S-03.accounts.test.js` | Acceptance | Automated | **PASS** | `BUG-02 (CLOSED)` | TEST_INVENTORY | `backend/tests/acceptance/S-03.accounts.test.js` | **VERIFIED** |
| **ACC-S03-02** | S-03 | T-06 | CSRF Defense | `backend/tests/acceptance/S-03.csrf.test.js` | Acceptance | Automated | **PASS** | `BUG-02 (CLOSED)` | TEST_INVENTORY | `backend/tests/acceptance/S-03.csrf.test.js` | **VERIFIED** |
| **ACC-S03-03** | S-03 | T-06 | RBAC Matrix | `backend/tests/acceptance/S-03.rbac-matrix.test.js` | Acceptance | Automated | **PASS** | `BUG-02 (CLOSED)` | TEST_INVENTORY | `backend/tests/acceptance/S-03.rbac-matrix.test.js` | **VERIFIED** |
| **ACC-S03-04** | S-03 | T-07 | Ownership Isolation | `backend/tests/acceptance/S-03.rbac.test.js` | Acceptance | Automated | **PASS** | `BUG-02 (CLOSED)` | TEST_INVENTORY | `backend/tests/acceptance/S-03.rbac.test.js` | **VERIFIED** |
| **ACC-S03-05** | S-03 | T-06 | Route Guard Guarding | `backend/tests/acceptance/S-03.route-guard.test.js` | Acceptance | Automated | **PASS** | `BUG-02 (CLOSED)` | TEST_INVENTORY | `backend/tests/acceptance/S-03.route-guard.test.js` | **VERIFIED** |
| **ACC-S03-06** | S-03 | T-06 | Trust Proxy | `backend/tests/acceptance/S-03.trust-proxy.test.js` | Acceptance | Automated | **PASS** | `BUG-02 (CLOSED)` | TEST_INVENTORY | `backend/tests/acceptance/S-03.trust-proxy.test.js` | **VERIFIED** |
| **MAN-S03-01** | S-03 | T-07 | Live Curl Owner Isolation | `backend/src/db/scope.js` | Security | Manual | **PASS** | `NONE` | STORY_DOC | [`stories/S-03.md#L48-L61`](./stories/S-03.md) | **VERIFIED** |
| **MAN-S03-02** | S-03 | T-06 | Live Default Deny 403 | `backend/src/security/routeGuard.js` | Security | Manual | **NOT VERIFIED** | `NONE` | STORY_DOC | [`stories/S-03.md#L111-L127`](./stories/S-03.md) | **NOT VERIFIED** |
| **TC-FB-01** | FB-01 | FB-01 | Client Fetcher API | `frontend/js/api.js` | Integration Contract | Automated / Code | **PASS** | `BUG-01, BUG-03 (CLOSED)` | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L30-L50`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **TC-FB-02** | FB-02 | FB-02 | Middleware Chain / Host | `backend/src/app.js`, `middlewares/` | Integration Contract | Static / Code | **PASS** | `BUG-01, BUG-03 (CLOSED)` | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L52-L72`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **TC-FB-03** | FB-03 | FB-03 | E2E Login & Auth Flow | `frontend/js/auth.js`, `backend/src/modules/auth/` | E2E Integration | UI Flow / API | **PASS** | `BUG-01, BUG-03 (CLOSED)` | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L74-L95`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **TC-FB-04** | FB-04 | FB-04 | Error Handling Envelope | `backend/src/middlewares/errorHandler.js` | Client / Parser | UI Component | **PASS** | `BUG-03 (CLOSED)` | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L97-L118`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **TC-FB-05** | FB-05 | FB-05 | Cookie Session / 401 | `frontend/js/auth.js`, `authenticate.js` | Security / Protocol | Automated / Unit | **PASS** | `BUG-03 (CLOSED)` | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L120-L140`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **TC-FB-06** | FB-06 | FB-06 | RBAC UI Route Mapping | `frontend/js/router.js`, `frontend/pages/` | Authorization | UI Routing | **PASS** | `BUG-03 (CLOSED)` | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L142-L162`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **TC-FB-07** | FB-07 | FB-07 | Ownership Data Scope UI | `frontend/pages/station-owner.html`, `scope.js` | Data Isolation | Automated / Code | **PASS** | `BUG-03 (CLOSED)` | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L164-L184`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **TC-FB-08** | FB-08 | FB-08 | Error Envelope Match | `backend/src/middlewares/errorHandler.js` | API Contract | Schema Match | **PASS** | `NONE` | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L186-L200`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **TC-FB-09** | FB-09 | FB-09 | Client Logic Unit Tests | `frontend/js/` | Unit | Automated | **PASS** | `NONE` | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L202-L215`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **TC-FB-10** | FB-10 | FB-10 | Database Persistence SQL | `backend/src/modules/` | Data Integrity | Static / Code | **PASS** | `BUG-02 (CLOSED)` | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L217-L231`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **TC-FB-11** | FB-11 | FB-11 | OWASP Defense XSS/SQLi | `backend/src/middlewares/requireJson.js`, `login.js` | Security | Static / Code | **PASS** | `NONE` | STORY_DOC | [`integration/FRONTEND_BACKEND.md#L233-L253`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |
| **TC-S04-01** | S-04 | T-08 | `S04-AC-01` | `backend/src/modules/stations/stations.service.js` | Acceptance | Automated / Live | **PASS** | `NONE` | COMBINED | [`stories/S-04.md#tc-s04-01`](./stories/S-04.md) | **VERIFIED** |
| **TC-S04-02** | S-04 | T-08 | `S04-AC-02` | `backend/src/modules/stations/stations.service.js` | Functional | Automated / Live | **PASS** | `NONE` | COMBINED | [`stories/S-04.md#tc-s04-02`](./stories/S-04.md) | **VERIFIED** |
| **TC-S04-03** | S-04 | T-08 | `S04-AC-03` | `backend/src/modules/stations/stations.schema.js` | Functional | Automated / Live | **PASS** | `NONE` | COMBINED | [`stories/S-04.md#tc-s04-03`](./stories/S-04.md) | **VERIFIED** |
| **TC-S04-04** | S-04 | T-09 | `S04-AC-04` | `backend/src/modules/stations/stations.service.js` | Functional | Automated / Live | **PASS** | `NONE` | COMBINED | [`stories/S-04.md#tc-s04-04`](./stories/S-04.md) | **VERIFIED** |
| **TC-S04-05** | S-04 | T-09 | `S04-AC-05` | `backend/src/modules/stations/stations.service.js` | Acceptance | Automated / Live | **PASS** | `NONE` | COMBINED | [`stories/S-04.md#tc-s04-05`](./stories/S-04.md) | **VERIFIED** |
| **TC-S04-06** | S-04 | T-09 | `S04-AC-06` | `backend/src/modules/stations/stations.schema.js` | Security | Automated / Live | **PASS** | `NONE` | COMBINED | [`stories/S-04.md#tc-s04-06`](./stories/S-04.md) | **VERIFIED** |
| **TC-S04-07** | S-04 | T-09 | `S04-AC-07` | `backend/src/modules/stations/stations.service.js` | Security | Automated / Live | **PASS** | `NONE` | COMBINED | [`stories/S-04.md#tc-s04-07`](./stories/S-04.md) | **VERIFIED** |
| **TC-S04-08** | S-04 | T-08 | `S04-NFR-01`| `backend/migrations/004_station_management.sql` | Data Integrity | Automated / DB | **PASS** | `NONE` | COMBINED | [`stories/S-04.md#tc-s04-08`](./stories/S-04.md) | **VERIFIED** |
| **TC-T08-01** | T-08 | T-08 | `T08-01` | `backend/migrations/004_station_management.sql` | Integration | Automated / DB | **PASS** | `NONE` | COMBINED | [`stories/S-04.md#tc-t08-01`](./stories/S-04.md) | **VERIFIED** |
| **TC-T08-02** | T-08 | T-08 | `T08-01` | `backend/migrations/004_station_management.sql` | Security | Automated / DB | **PASS** | `NONE` | COMBINED | [`stories/S-04.md#tc-t08-02`](./stories/S-04.md) | **VERIFIED** |
| **TC-T08-03** | T-08 | T-08 | `T08-NFR-01`| `backend/migrations/004_station_management.sql` | Architecture | Automated / DB | **PASS** | `NONE` | COMBINED | [`stories/S-04.md#tc-t08-03`](./stories/S-04.md) | **VERIFIED** |
| **TC-T09-01** | T-09 | T-09 | `T09-01` | `frontend/js/pages/station-owner.js` | UI Validation | Static Inspection | **PASS** | `NONE` | SOURCE_LINK | [`stories/S-04.md#tc-t09-01`](./stories/S-04.md) | **VERIFIED** |
| **TC-T09-02** | T-09 | T-09 | `T09-01` | `frontend/js/pages/station-owner.js` | UI Flow | Static Inspection | **PASS** | `NONE` | SOURCE_LINK | [`stories/S-04.md#tc-t09-02`](./stories/S-04.md) | **VERIFIED** |
| **TC-T09-03** | T-09 | T-09 | `T09-NFR-01`| `frontend/js/pages/station-owner.js` | UI Defense | Static Inspection | **PASS** | `NONE` | SOURCE_LINK | [`stories/S-04.md#tc-t09-03`](./stories/S-04.md) | **VERIFIED** |
| **TC-S05-01** | S-05 | T-10 | `S05-AC-01` | `backend/src/modules/charge-points/charge-points.service.js` | Acceptance | Automated / Live | **PASS** | `NONE` | COMBINED | [`stories/S-05.md#tc-s05-01`](./stories/S-05.md) | **VERIFIED** |
| **TC-S05-02** | S-05 | T-10 | `S05-AC-02` | `backend/src/modules/charge-points/charge-points.service.js` | Security | Automated / Live | **PASS** | `NONE` | COMBINED | [`stories/S-05.md#tc-s05-02`](./stories/S-05.md) | **VERIFIED** |
| **TC-S05-03** | S-05 | T-10 | `S05-AC-03` | `backend/src/modules/charge-points/charge-points.service.js` | Functional | Automated / Live | **NOT VERIFIED** | `NONE` | COMBINED | [`stories/S-05.md#tc-s05-03`](./stories/S-05.md) | **NOT VERIFIED** |
| **TC-T10-01** | T-10 | T-10 | `T10-01` | `backend/migrations/005_charge_point_code_upper.sql` | Data Integrity | Automated / DB | **PASS** | `NONE` | COMBINED | [`stories/S-05.md#tc-t10-01`](./stories/S-05.md) | **VERIFIED** |
| **TC-T11-01** | T-11 | T-11 | `T11-01` | `frontend/js/pages/station-owner.js` | UI Validation | Automated / Live | **PASS** | `NONE` | COMBINED | [`stories/S-05.md#tc-t11-01`](./stories/S-05.md) | **VERIFIED** |
| **UI-CP-01** | Roadmap | S-03 | Form quản lý trụ sạc | `frontend/pages/operator.html` | UI Component | Manual | **NOT FOUND** | `NONE` | REQUIREMENT_LINK | `TEST_REPORT.md` (Roadmap Sprint 1) | **VERIFIED** |

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
| **UI Quản lý Trụ Sạc** (`UI-CP-01`) | Story S-05 / Task T-06 | Chưa có bảng điều khiển và biểu mẫu CRUD trụ sạc (Charge Points) trên giao diện `frontend/pages/operator.html`. | **NOT FOUND** | Thiết kế kiểm thử E2E UI khi module giao diện Operator hoàn thành. |

---

## 8. Regression Reference

Danh sách các bài kiểm thử lịch sử được xác định là **Regression Candidates** (Ứng viên kiểm thử hồi quy bắt buộc) khi có sự thay đổi tại các thành phần dùng chung hoặc tầng phụ thuộc cốt lõi:

### 8.1. Bảng ma trận ánh xạ kiểm thử hồi quy (Canonical Regression Mapping Matrix)

Bảng ma trận truy vết hồi quy này tuân thủ cấu trúc 4 tầng phân tách độc lập và bộ Canonical Enums chuẩn hóa quy định tại [`TESTER_STANDARD.md` Mục 7](./TESTER_STANDARD.md#7-mô-hình-truy-vết-chuẩn-và-hai-luồng-phân-tích-độc-lập-canonical-traceability--dual-stream-model):

| Source Change | Historical Test | Impact Type | Investigation Label | Regression State | Evidence Basis | Verification |
|:---|:---|:---:|:---:|:---:|:---:|:---:|
| `backend/src/config/env.js` | `TC-S01-02`, `UT-ENV-01`, `UT-BACKDOOR-01`, `ACC-S01-01` | `SHARED_COMPONENT` | `AFFECTED` | `REGRESSION CANDIDATE` | `SOURCE_LINK` | `VERIFIED` |
| `backend/src/lib/password.js` | `TC-S02-01`, `TC-S02-05`, `TC-T04-04`, `IT-AUTH-01`, `ACC-S02-01` | `SHARED_COMPONENT` | `AFFECTED` | `REGRESSION CANDIDATE` | `SOURCE_LINK` | `VERIFIED` |
| `backend/src/middlewares/authenticate.js` | `TC-S02-01`, `TC-T05-03`, `TC-FB-03`, `TC-FB-05`, `ACC-S02-03`, `ACC-S03-05` | `SHARED_COMPONENT` | `AFFECTED` | `REGRESSION CANDIDATE` | `SOURCE_LINK` | `VERIFIED` |
| `backend/src/db/scope.js` | `TC-S03-01`, `TC-T07-01`, `TC-T07-04`, `UT-SCOPE-01`, `ACC-S03-04`, `TC-FB-07`, `MAN-S03-01` | `SHARED_COMPONENT` | `AFFECTED` | `REGRESSION CANDIDATE` | `SOURCE_LINK` | `VERIFIED` |
| `backend/src/security/routeGuard.js`, `backend/src/security/permissions.js` | `TC-S03-03`, `TC-T06-02`, `ACC-S03-01`, `ACC-S03-03`, `ACC-S03-05`, `TC-FB-06` | `SHARED_COMPONENT` | `AFFECTED` | `REGRESSION CANDIDATE` | `SOURCE_LINK` | `VERIFIED` |
| `backend/src/modules/charge-points/*.js` | `TC-S05-01`, `TC-S05-02`, `TC-T11-01` | `SHARED_COMPONENT` | `AFFECTED` | `REGRESSION CANDIDATE` | `SOURCE_LINK` | `VERIFIED` |
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
- **Khi sửa đổi module quản lý trụ sạc `backend/src/modules/charge-points/`**:
  - `TC-S05-01`, `TC-S05-02`, `TC-T11-01`.
- **Khi sửa đổi migration DDL cơ sở dữ liệu `backend/migrations/*.sql`**:
  - `TC-T01-02`, `TC-T01-03`, `TC-T04-01`, `IT-MIGRATE-01`.

---

## 9. Inventory Verification Metadata

- **Current Repository Snapshot**: Commit `86769949c03381429fd4931f3b364341ac618f8f` (nhánh `main`).
- **Baseline Test Snapshot**: Commit `4bc5758` (24/09/2026).
- **Test Inventory Verification Date**: 28/09/2026.
- **Documents Inspected & Cross-Checked**:
  - [`docs/README.md`](./README.md) (AI Tester Entry Point & Router)
  - [`docs/TESTER_STANDARD.md`](./TESTER_STANDARD.md) (Bộ quy chuẩn Tester trung tâm)
  - [`docs/PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md) (Verified Project Map)
  - [`docs/stories/S-01.md`](./stories/S-01.md)
  - [`docs/stories/S-02.md`](./stories/S-02.md)
  - [`docs/stories/S-03.md`](./stories/S-03.md)
  - [`docs/stories/S-04.md`](./stories/S-04.md)
  - [`docs/stories/S-05.md`](./stories/S-05.md)
  - [`docs/integration/FRONTEND_BACKEND.md`](./integration/FRONTEND_BACKEND.md)
  - [`docs/testing/TEST_REPORT.md`](./testing/TEST_REPORT.md)
  - [`docs/testing/REGRESSION_REPORT.md`](./testing/REGRESSION_REPORT.md)
  - [`docs/testing/BUG_REPORT.md`](./testing/BUG_REPORT.md)
  - [`docs/testing/TEST_PLAN.md`](./testing/TEST_PLAN.md)
- **Inventory Verification Status**: **VERIFIED** (100% Test Case có bằng chứng thực tế, không có Test Case mồ côi hoặc suy đoán).
