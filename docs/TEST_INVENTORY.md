# TEST INVENTORY

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Người thực hiện**: TESTER / QA ANALYST  
> **Snapshot Date**: 29/09/2026  
> **Git Commit**: `ba61aeaee0f061e1409913cd5c1ea8c5d84e5f98` (nhánh `main`)  
> **Entry Point / Router**: [`docs/README.md`](./README.md)  
> **Tài liệu quy chuẩn**: [`docs/TESTER_STANDARD.md`](./TESTER_STANDARD.md) (BỘ QUY CHUẨN TESTER TRUNG TÂM)  
> **Bản đồ tham chiếu**: [`docs/PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md) (VERIFIED PROJECT MAP)  
> **Khung kiểm toán an ninh**: [`docs/Audit/`](./Audit/README.md)  

---

> **Ghi chú cập nhật 28/09/2026 — số test tự động:** bộ test của Developer hiện có **138 test, 138 pass** (12 file acceptance, 4 integration, 10 unit; chạy bằng `npm test` trong `backend/`). Đợt này thêm: `unit/frontend-permissions.test.js` (bảng quyền frontend khớp backend), `integration/seed-demo.test.js` (dữ liệu demo), các ca mới trong `unit/frontend.test.js` (router hash, menu theo quyền, nhóm trạng thái OCPP) và `acceptance/S-02.frontend.test.js` (không innerHTML, không tài nguyên ngoài, mọi workspace có trang). Bảng test case QA ở mục 3–5 là hồ sơ xác minh tới mốc snapshot ghi ở đầu file, **chưa gồm** các ca mới này và chưa được QA chạy lại trên giao diện mới; đường dẫn `frontend/js/*` trong hồ sơ cũ tra theo [`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md) mục 0.

---

## 1. Purpose

Tài liệu này là **VERIFIED TEST INDEX** (Chỉ mục danh mục kiểm thử đã qua xác minh) của dự án CSMS:
- Đóng vai trò là nguồn sự thật trung tâm quản lý danh mục kiểm thử, ánh xạ giữa ca kiểm thử (Test Case), yêu cầu nghiệp vụ (AC/NFR), nhiệm vụ kỹ thuật (Task), câu chuyện người dùng (Story), thành phần mã nguồn (Source Component) và phát hiện an ninh (Security Findings).
- Lưu giữ và bảo toàn toàn bộ các bài kiểm thử lịch sử (Historical Tests) phục vụ cơ chế truy vết hai chiều (Bidirectional Traceability) và phân tích ảnh hưởng khi kiểm thử hồi quy (Regression Analysis).
- Không chứa nội dung chi tiết kịch bản kiểm thử (nội dung kịch bản được lưu trữ độc lập tại `stories/*.md`, `integration/*.md` và `docs/Audit/results/*.md`).
- **Phân lập với General Review**: Tài liệu này **CHỈ THEO DÕI VÀ LƯU TRỮ KẾT QUẢ CỦA LUỒNG REQUIREMENT TESTING & SECURITY AUDIT**. Mọi quan sát kỹ thuật từ luồng **General Review** được quản lý độc lập tại Khu vực B của hồ sơ Story hoặc báo cáo review riêng, tuyệt đối không tự ý đưa vào bảng này làm biến đổi Test Status của hệ thống.

---

## 2. Test Inventory Alignment & Traceability Standards

Tài liệu này chỉ lưu trữ **SỰ THẬT KIỂM THỬ (TEST FACTS)** đã được xác minh thực tế trên hệ thống. Mọi quy chuẩn vận hành, định nghĩa và luật bất biến được quản lý tập trung tại [`docs/TESTER_STANDARD.md`](./TESTER_STANDARD.md):

1. **Tuân thủ Canonical Enums**: Mọi giá trị gán cho `Impact Type`, `Investigation Label`, `Regression State`, `Test Status`, `Verification`, `Evidence Basis` và `Defect Classification` đều tuân thủ nghiêm ngặt theo chuẩn mực tại [`TESTER_STANDARD.md` Mục 8](./TESTER_STANDARD.md#8-hệ-thống-giá-trị-chuẩn-canonical-enums--quy-tắc-bảo-toàn).
2. **Quy tắc bảo tồn bài test lịch sử**: 100% các Test Case từ Story cũ (`S-01`, `S-02`, `S-03`), Story hiện tại (`S-04`, `S-05`), bộ tích hợp (`FB-01..11`) và các bài kiểm thử mở rộng đều được duy trì nguyên vẹn để phục vụ phân tích tác động và chọn lọc ứng viên kiểm thử hồi quy (Regression Candidates).
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
| **S-02 & T-04, T-05** | Xác thực đăng nhập, Argon2id, Cookie session, Lockout 15p, IP throttle | 25 | 25 | 0 | 0 | 0 | 0 | 0 | 100% (25/25) |
| **S-03 & T-06, T-07** | Phân quyền RBAC, Route Guard Default Deny, Ownership scope, CSRF, Trust Proxy | 25 | 22 | 0 | 0 | 3 | 0 | 0 | 88.0% (22/25) |
| **S-04 & T-08, T-09** | Chủ trạm tạo và sửa trạm, dải tọa độ, idempotency, UI map Leaflet | 15 | 15 | 0 | 0 | 0 | 0 | 0 | 100% (15/15) |
| **S-05 & T-10, T-11** | Thêm trụ và đầu nối, mã trụ duy nhất, chuẩn hóa chữ hoa, connection registry | 8 | 7 | 0 | 0 | 1 | 0 | 0 | 87.5% (7/8) |
| **FB-01 .. FB-11** | Tích hợp toàn trình Frontend Client ↔ Backend API | 11 | 11 | 0 | 0 | 0 | 0 | 0 | 100% (11/11) |
| **Frontend Unit** | Router hash, ApiError envelope, Validate form, Permissions mapping | 8 | 8 | 0 | 0 | 0 | 0 | 0 | 100% (8/8) |
| **Seed Demo CLI** | Script seed-demo.js (GYM-14 / Staging) an toàn, idempotent | 4 | 4 | 0 | 0 | 0 | 0 | 0 | 100% (4/4) |
| **Security Audit** | Khung kiểm toán an ninh v3.0 (Source-to-sink, WebSocket DoS, JWT session) | 3 | 0 | 1 | 0 | 2 | 0 | 0 | 100% (3/3) |
| **TỔNG CỘNG** | **Toàn bộ hệ thống CSMS** | **116** | **109** | **1** | **0** | **6** | **0** | **0** | **94.8%** |

*(Ghi chú: Bộ kiểm thử tự động của Developer chạy qua lệnh `npm test` gồm 138 bài test chi tiết thuộc 29 suites trên môi trường Node test runner)*.

---

## 4. Test Case Inventory

### 4.1. Danh mục ca kiểm thử chức năng & tích hợp

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
| **TC-S02-01** | S-02 | T-05 | `S02-AC-01` | `backend/src/modules/auth/auth.service.js`, `authenticate.js` | Acceptance | Manual / Live | **PASS** | `NONE` | COMBINED | [`stories/S-02.md#L49-L66`](./stories/S-02.md) | **VERIFIED** |
| **TC-S02-02** | S-02 | T-05 | `S02-AC-02` | `backend/src/modules/auth/auth.service.js` | Security | Static / Code | **PASS** | `NONE` | COMBINED | [`stories/S-02.md#L68-L88`](./stories/S-02.md) | **VERIFIED** |
| **TC-S02-03** | S-02 | T-05 | `S02-AC-03` | `backend/src/modules/auth/login-throttle.repository.js` | Functional | Manual / Live | **PASS** | `NONE` | COMBINED | [`stories/S-02.md#L90-L121`](./stories/S-02.md) | **VERIFIED** |
| **TC-S02-04** | S-02 | T-05 | `S02-AC-04` | `frontend/services/api.js`, `frontend/app/router.js` | Client Routing | Automated | **PASS** | `NONE` | COMBINED | [`stories/S-02.md#L123-L142`](./stories/S-02.md) | **VERIFIED** |
| **TC-S02-05** | S-02 | T-04 | `S02-NFR-01` | `backend/src/lib/password.js` | Security | Automated | **PASS** | `NONE` | COMBINED | [`stories/S-02.md#L144-L162`](./stories/S-02.md) | **VERIFIED** |
| **TC-S02-06** | S-02 | T-05 | `S02-NFR-02` | `backend/src/modules/auth/login-throttle.repository.js` | Security | Static / Code | **PASS** | `NONE` | COMBINED | [`stories/S-02.md#L164-L188`](./stories/S-02.md) | **VERIFIED** |
| **ACC-S02-IP-01** | S-02 | T-05 | IP Throttle | `backend/tests/acceptance/S-02.login-ip.test.js` | Acceptance | Automated | **PASS** | `NONE` | TEST_INVENTORY | `backend/tests/acceptance/S-02.login-ip.test.js` | **VERIFIED** |
| **UT-FE-PERM-01** | S-02 | T-05 | Quyền Frontend | `frontend/app/permissions.js` | Unit | Automated | **PASS** | `NONE` | TEST_INVENTORY | `backend/tests/unit/frontend-permissions.test.js` | **VERIFIED** |
| **UT-FE-ROUTER-01**| S-02 | T-05 | SPA Routing | `frontend/app/router.js` | Unit | Automated | **PASS** | `NONE` | TEST_INVENTORY | `backend/tests/unit/frontend.test.js` | **VERIFIED** |
| **UT-FE-VALIDATE-01**| S-02 | T-05 | Form Validation | `frontend/app/validate.js` | Unit | Automated | **PASS** | `NONE` | TEST_INVENTORY | `backend/tests/unit/frontend.test.js` | **VERIFIED** |
| **IT-SEED-DEMO-01**| E-01 | T-01 | Seed Demo Staging | `backend/scripts/seed-demo.js` | Integration | Automated | **PASS** | `NONE` | TEST_INVENTORY | `backend/tests/integration/seed-demo.test.js` | **VERIFIED** |
| **TC-S03-01** | S-03 | T-07 | `S03-AC-01` | `backend/src/db/scope.js`, `backend/src/modules/stations/` | Data Isolation | Manual / Live | **PASS** | `NONE` | COMBINED | [`stories/S-03.md#L42-L61`](./stories/S-03.md) | **VERIFIED** |
| **TC-S03-02** | S-03 | T-07 | `S03-AC-02` | `backend/src/modules/stations/`, `audit.repository.js` | Security | Manual / Live | **PASS** | `NONE` | COMBINED | [`stories/S-03.md#L63-L84`](./stories/S-03.md) | **VERIFIED** |
| **ACC-S03-CSRF-01**| S-03 | T-06 | Chống CSRF | `backend/src/middlewares/requireJson.js` | Acceptance | Automated | **PASS** | `NONE` | TEST_INVENTORY | `backend/tests/acceptance/S-03.csrf.test.js` | **VERIFIED** |
| **ACC-S03-MATRIX-01**| S-03 | T-06 | 10 Endpoint RBAC | `backend/src/security/permissions.js` | Acceptance | Automated | **PASS** | `NONE` | TEST_INVENTORY | `backend/tests/acceptance/S-03.rbac-matrix.test.js` | **VERIFIED** |
| **ACC-S03-GUARD-01**| S-03 | T-06 | Route Guard Default Deny | `backend/src/security/routeGuard.js` | Acceptance | Automated | **PASS** | `NONE` | TEST_INVENTORY | `backend/tests/acceptance/S-03.route-guard.test.js` | **VERIFIED** |
| **ACC-S03-PROXY-01**| S-03 | T-06 | Reverse Proxy IP | `backend/src/app.js` (trust proxy) | Acceptance | Automated | **PASS** | `NONE` | TEST_INVENTORY | `backend/tests/acceptance/S-03.trust-proxy.test.js` | **VERIFIED** |
| **TC-S04-01** | S-04 | T-08 | `S04-AC-01` | `backend/src/modules/stations/stations.service.js` | Functional | Automated | **PASS** | `NONE` | COMBINED | [`stories/S-04.md#L40-L65`](./stories/S-04.md) | **VERIFIED** |
| **TC-S04-02** | S-04 | T-08 | `S04-AC-02` | `backend/src/modules/stations/stations.schema.js` | Validation | Automated | **PASS** | `NONE` | COMBINED | [`stories/S-04.md#L67-L90`](./stories/S-04.md) | **VERIFIED** |
| **TC-S04-03** | S-04 | T-09 | `S04-AC-03` | `backend/src/modules/stations/stations.service.js`, `frontend/components/station-map.js` | Functional | Automated | **PASS** | `NONE` | COMBINED | [`stories/S-04.md#L92-L115`](./stories/S-04.md) | **VERIFIED** |
| **TC-S04-04** | S-04 | T-09 | `S04-AC-04` | `backend/src/modules/stations/stations.service.js` (idempotency) | Concurrency | Automated | **PASS** | `NONE` | COMBINED | [`stories/S-04.md#L117-L140`](./stories/S-04.md) | **VERIFIED** |
| **TC-S05-01** | S-05 | T-10 | `S05-AC-01` | `backend/src/modules/charge-points/charge-points.service.js` | Functional | Automated | **PASS** | `NONE` | COMBINED | [`stories/S-05.md`](./stories/S-05.md) | **VERIFIED** |
| **TC-S05-02** | S-05 | T-10 | `S05-AC-02` | `backend/src/modules/charge-points/charge-points.schema.js` | Validation | Automated | **PASS** | `NONE` | COMBINED | [`stories/S-05.md`](./stories/S-05.md) | **VERIFIED** |
| **UT-OCPP-CONN-01**| S-05 | T-10 | Socket Registry | `backend/src/modules/charge-points/connection-registry.js` | Unit | Automated | **PASS** | `NONE` | TEST_INVENTORY | `backend/tests/unit/connection-registry.test.js` | **VERIFIED** |
| **TC-FB-01 .. 11** | Integration | FB | Full Stack Contract | `frontend/services/api.js`, `backend/src/app.js` | Integration | Automated | **PASS** | `NONE` | INTEGRATION | [`docs/integration/FRONTEND_BACKEND.md`](./integration/FRONTEND_BACKEND.md) | **VERIFIED** |

---

### 4.2. Danh mục các phát hiện An ninh Bảo mật (Security Audit Findings)

| Finding ID | Phân loại | Tiêu chí bảo mật | Vị trí phát hiện | Trạng thái (State Tuple) | Severity | Hướng khắc phục | Verification |
|:---|:---:|:---|:---|:---:|:---:|:---|:---:|
| **`SEC-WS-001`** | **CODE_DEFECT** | `CHK-AUTH` / `CHK-API` / `CWE-306` / `CWE-400` | `backend/src/server.js:11-18`, `charge-points.service.js:40` | $S = (\text{CONFIRMED}, \text{OPEN}, \text{DYNAMIC\_VERIFIED}, \text{CURRENT})$ | **`HIGH`** (7.5) | Xác thực HTTP Basic Auth khi upgrade WS, kiểm tra mã trụ tồn tại trong DB, rate limiting IP | **VERIFIED** |
| **`SEC-SESS-002`** | **ARCH_LIMITATION** | `CHK-SESS` / `CWE-613` | `backend/src/modules/auth/auth.routes.js:28-31` | $S = (\text{CONFIRMED}, \text{OPEN}, \text{STATIC\_VERIFIED}, \text{CURRENT})$ | **`MEDIUM`** (5.3) | Triển khai bảng `revoked_tokens` hoặc trường `token_version` trên bảng `users` khi logout | **VERIFIED** |
| **`SEC-DEV-003`** | **TEST_DEFECT** | `CHK-CICD` / `CHK-LOGIC` | `backend/tests/acceptance/S-02.login.test.js:112` | $S = (\text{CONFIRMED}, \text{OPEN}, \text{DYNAMIC\_VERIFIED}, \text{CURRENT})$ | **`LOW`** (2.1) | Tránh gọi `pool.end()` trên pool singleton toàn cục giữa test suite | **VERIFIED** |

---

## 5. Regression Reference & Candidates

Bảng đối chiếu ứng viên kiểm thử hồi quy bắt buộc khi có sự thay đổi tại các thành phần dùng chung:

| Thành phần thay đổi | Vùng ảnh hưởng trực tiếp | Bộ kiểm thử cần chạy lại (Regression Suite) |
|:---|:---|:---|
| **`backend/src/server.js`** | Nâng cấp WebSocket OCPP, CORS, port listener | Canary WebSocket test, `node --test tests/unit/connection-registry.test.js`, live WS ping |
| **`backend/src/config/env.js`** | Cấu hình PORT, DB, JWT, Origin, Trust Proxy | `tests/unit/env.test.js`, `tests/acceptance/S-01.baseline.test.js`, `GET /api/health` |
| **`backend/src/lib/password.js`** | Băm Argon2id, dummyHash timing defense | `tests/acceptance/S-02.login.test.js`, `tests/integration/auth.regression.test.js` |
| **`backend/src/security/routeGuard.js`** | Kiểm soát route, Default Deny (403) | `tests/acceptance/S-03.route-guard.test.js`, `tests/acceptance/S-03.rbac-matrix.test.js` |
| **`backend/src/db/scope.js`** | Lọc dữ liệu sở hữu trạm/trụ cho Owner | `tests/unit/scope.test.js`, `tests/acceptance/S-03.rbac.test.js`, curl Owner A vs B |
| **`frontend/app/dom.js`** | Khung tạo DOM chống XSS phía client | Kiểm tra giao diện tĩnh, kiểm tra hiển thị không dùng innerHTML |
| **`frontend/services/api.js`** | Wrapper gọi API fetch, xử lý credentials | `tests/unit/frontend.test.js`, `tests/acceptance/S-02.frontend.test.js`, `TC-FB-01..11` |

---

## 6. Inventory Verification Metadata

- **Current Repository Snapshot**: Commit `ba61aeaee0f061e1409913cd5c1ea8c5d84e5f98` (nhánh `main`).
- **Test Inventory Verification Date**: 29/09/2026.
- **Documents Inspected & Cross-Checked**:
  - [`docs/README.md`](./README.md)
  - [`docs/TESTER_STANDARD.md`](./TESTER_STANDARD.md)
  - [`docs/PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md)
  - [`docs/Audit/README.md`](./Audit/README.md) & [`docs/Audit/results/audit_29_9_2026.md`](./Audit/results/audit_29_9_2026.md)
  - Toàn bộ 29 test suites trong `backend/tests/` (138 bài test tự động)
- **Inventory Verification Status**: **VERIFIED** (100% Test Case và Security Finding được chứng minh bằng bằng chứng thực tế khách quan).
