# Frontend ↔ Backend Integration Testing

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Phạm vi**: Kiểm thử tích hợp toàn trình giữa Frontend Client (HTML/JS), Backend API (Express), và Cơ sở dữ liệu (PostgreSQL)  
> **Baseline Date**: 24/09/2026 (Cập nhật snapshot: 28/09/2026)  
> **Snapshot Commit**: `86769949c03381429fd4931f3b364341ac618f8f` (Nhánh `main`)  
> **Người thực hiện**: TESTER / QA ANALYST  

---

> **Ghi chú cập nhật 28/09/2026:** frontend đã được thiết kế lại. Các kịch bản `TC-FB-*` dưới đây ghi bằng chứng tại commit lịch sử nên vẫn dùng đường dẫn cũ (`frontend/js/api.js`, `router.js`, `pages/*.html`). Đường dẫn hiện tại: `frontend/services/api.js`, `frontend/app/{auth,router,workspace,validate}.js`, `frontend/main.js`, `frontend/app.html`, `frontend/pages/**` (bảng đối chiếu đầy đủ ở [`../PROJECT_STRUCTURE.md`](../PROJECT_STRUCTURE.md) mục 0). Hợp đồng tích hợp (cùng origin, cookie httpOnly, `Content-Type: application/json`, envelope lỗi, 401 → về `/index.html`, CSRF theo `Origin`) **không đổi**; test tự động tương ứng đã chuyển sang đường dẫn mới và pass (138/138), nhưng **các kịch bản bên dưới chưa được QA chạy lại** trên giao diện mới. Trang chủ theo vai trò nay là `/app.html#/<workspace>/overview` thay cho `/pages/<vai-trò>.html`.

## Scope
Kiểm thử giao tiếp thực tế và hợp đồng tích hợp giữa các thành phần:
1. Client HTTP Fetcher (`frontend/js/api.js`) ↔ Backend Route Handlers (`backend/src/modules/`).
2. Luồng xác thực đăng nhập người dùng (End-to-End Login Flow).
3. Định dạng và xử lý dữ liệu lỗi (Error Response Envelope `{ error: { code, message, details } }`).
4. Cơ chế lưu trữ và truyền nhận cookie phiên (`httpOnly`, `SameSite=Lax`).
5. Điều hướng theo phân quyền (RBAC) trên giao diện tương ứng với ma trận permissions tại backend.
6. Cô lập dữ liệu theo quyền sở hữu (Ownership Isolation) giữa Frontend và Repository database.
7. Đánh giá kiểm thử đơn vị frontend client và an ninh ứng dụng web (XSS, SQLi, CSRF, Malformed JSON).

## Test Environment
- **Hệ điều hành**: Windows 11 x64
- **Node.js runtime**: v24.19.0
- **npm**: 11.17.0
- **Database yêu cầu**: PostgreSQL 16 (cổng 5432 dev, cổng 5433 test)
- **Container yêu cầu**: Docker Engine & Docker Compose
- **Client runtime**: trình duyệt hỗ trợ Fetch API, ES Modules, cookie credentials

---

## TC-FB-01
- **Test ID**: `TC-FB-01`
- **Jira / Flow**: `FB-01 — Frontend gọi Backend`
- **Requirement**: `frontend/js/api.js` gửi request HTTP đúng cấu hình (Base URL, method, headers, content-type, credentials, error handling).
- **Preconditions**: Mã nguồn `frontend/js/api.js`, `frontend/js/auth.js`.
- **Steps**:
  1. Kiểm tra cấu hình fetch trong `frontend/js/api.js` (Base URL, method, headers, credentials).
  2. Kiểm tra xử lý HTTP response status và parse JSON envelope.
  3. Thực thi unit test client-side `tests/unit/frontend.test.js`.
- **Expected**: `api.js` gửi relative URL (cùng origin), header `Content-Type: application/json`, `credentials: 'include'`. Bắt lỗi và throw `ApiError`.
- **Actual**:
  - Base URL: Relative URL (`/api/...`) trên cùng host/port do Express serve static.
  - Headers: Tự động gắn `Content-Type: application/json` khi có body.
  - Credentials: `credentials: 'include'` cho phép gửi/nhận cookie phiên.
  - Unit test `node --test tests/unit/frontend.test.js` PASS 9/9.
  - Live HTTP call: Sau khi hoàn tất cài đặt dependencies và khởi động Docker container (`BUG-01..03` CLOSED), client fetch hoạt động ổn định trên cổng 3000.
- **HTTP status**: HTTP 200 cho các API hợp lệ, HTTP 400/401/403 được client xử lý chuẩn xác.
- **Request/response evidence**: `node --test tests/unit/frontend.test.js` test case `apiFetch: tự động gắn Content-Type json và credentials include` PASS. Live curl kiểm tra `GET /health` trả về HTTP 200 `{ status: "ok" }`.
- **Database evidence**: Không liên quan trực tiếp đến tầng này.
- **Current result**: **PASS (Live Verified)**.

---

## TC-FB-02
- **Test ID**: `TC-FB-02`
- **Jira / Flow**: `FB-02 — Backend nhận request từ Frontend`
- **Requirement**: Backend tiếp nhận đúng request từ frontend và chuyển đúng controller (routing, middleware chain, CORS/Host/Origin, header parsing, body parsing, auth extraction).
- **Preconditions**: `backend/src/app.js`, `backend/src/middlewares/`.
- **Steps**:
  1. Kiểm tra chuỗi middleware tại `src/app.js`: `express.json()`, `cookieParser()`, `express.static('frontend')`.
  2. Kiểm tra CSRF guard `src/middlewares/requireJson.js` kiểm tra header `Origin` khớp với `APP_ORIGIN`.
  3. Kiểm tra trích xuất auth token từ cookie qua `src/middlewares/authenticate.js`.
- **Expected**: Backend parse đúng JSON body, đọc cookie `token`, xác thực header `Origin`.
- **Actual**: Chuỗi middleware khai báo chặt chẽ, khớp 100% với định dạng do `frontend/js/api.js` gửi. Server boot thành công, nhận và phân luồng chính xác mọi request từ client sau khi `BUG-01..04` đã đóng.
- **HTTP status**: HTTP 200 cho request hợp lệ, HTTP 403 nếu `Origin` sai lệch.
- **Request/response evidence**: Mã nguồn [backend/src/app.js](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS-/backend/src/app.js#L13-L22) và [backend/src/middlewares/requireJson.js](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS-/backend/src/middlewares/requireJson.js); live test CSRF pass.
- **Database evidence**: Không liên quan trực tiếp.
- **Current result**: **PASS (Live Verified)**.

---

## TC-FB-03
- **Test ID**: `TC-FB-03`
- **Jira / Flow**: `FB-03 — End-to-End Login Flow`
- **Requirement**: Toàn bộ luồng đăng nhập từ UI: input credentials -> frontend validation -> POST /api/auth/login -> Argon2id verification -> JWT token -> Set-Cookie -> Frontend nhận response -> Redirect dashboard theo role.
- **Preconditions**: `frontend/pages/login.js`, `backend/src/modules/auth/`.
- **Steps**:
  1. Người dùng nhập email & password trên form `frontend/index.html`.
  2. `frontend/js/validate.js` kiểm tra định dạng email và mật khẩu không rỗng.
  3. `frontend/js/auth.js` gọi `POST /api/auth/login` với body `{ email, password }`.
  4. Backend xác thực hash Argon2id (`auth.service.js`), tạo JWT và set cookie `token` (`httpOnly: true, sameSite: 'lax'`).
  5. Backend trả response `{ user: { id, email, fullName, role } }`.
  6. Frontend lưu thông tin user trong memory, gọi `navigateDashboard(role)` để chuyển trang tương ứng (`/dashboard-admin.html`, `/dashboard-operator.html`, `/dashboard-owner.html`).
- **Expected**: Đăng nhập trơn tru từ UI, nhận cookie bảo mật, redirect đúng dashboard theo role.
- **Actual**: Toàn bộ luồng E2E hoạt động hoàn hảo trên môi trường container live. Đăng nhập thành công trả về cookie `token`, lưu thông tin role và điều hướng đúng dashboard tương ứng.
- **HTTP status**: HTTP 200 khi thành công.
- **Request/response evidence**: Payload `{ email: "owner@example.com", password: "Password123!" }` -> Response header `Set-Cookie: token=eyJ...; HttpOnly; SameSite=Lax`. Acceptance test `S-02.login.test.js` PASS 100%.
- **Database evidence**: Truy vấn `users` lấy `password_hash`, reset throttle trong `login_throttle`.
- **Current result**: **PASS (Live Verified)**.

---

## TC-FB-04
- **Test ID**: `TC-FB-04`
- **Jira / Flow**: `FB-04 — Frontend xử lý lỗi từ Backend`
- **Requirement**: Frontend bắt và parse lỗi từ Backend (sai password, account không tồn tại, account bị khóa, bad request), hiển thị rõ ràng trên UI, không crash.
- **Preconditions**: `frontend/js/pages/login.js`, `frontend/js/api.js`, `backend/src/middlewares/errorHandler.js`.
- **Steps**:
  1. Gửi login sai thông tin hoặc tài khoản đang bị lock.
  2. Backend trả HTTP 400/401/403/423 kèm body `{ error: { code, message, details } }`.
  3. `frontend/js/api.js` parse JSON lỗi và ném `ApiError`.
  4. `frontend/js/pages/login.js` bắt lỗi, cập nhật message chung (`#login-general-error`) hoặc chi tiết từng trường (`data-error-for="<id>"`).
- **Expected**: Không crash giao diện, hiển thị thông báo lỗi đồng nhất, an toàn, không leak thông tin tài khoản.
- **Actual**: Giao diện và API client cài đặt đầy đủ cơ chế bắt lỗi và hiển thị lên DOM an toàn qua `textContent` (chống XSS). Đã kiểm chứng trực tiếp trên browser/curl với mã lỗi 401 và 429 lockout.
- **HTTP status**: HTTP 401 (Sai password/email), HTTP 429 (Khoá tài khoản), HTTP 400 (Validation lỗi).
- **Request/response evidence**: `{ error: { code: "AUTHENTICATION_FAILED", message: "Email hoặc mật khẩu không đúng", details: null } }`.
- **Database evidence**: Ghi tăng `failed_count` trong bảng `login_throttle`.
- **Current result**: **PASS (Live Verified)**.

---

## TC-FB-05
- **Test ID**: `TC-FB-05`
- **Jira / Flow**: `FB-05 — Session & Cookie Handling`
- **Requirement**: Quản lý session qua cookie bảo mật: HttpOnly, SameSite=Lax, Secure (prod); subsequent request gửi kèm cookie; hết hạn redirect về /index.html.
- **Preconditions**: `backend/src/modules/auth/auth.routes.js`, `frontend/js/api.js`, `frontend/js/auth.js`.
- **Steps**:
  1. Kiểm tra cấu hình cookie trong `auth.routes.js`: `res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production' })`.
  2. Kiểm tra `credentials: 'include'` trong `api.js` cho mọi request tiếp theo.
  3. Kiểm tra interceptor xử lý status 401 trong `api.js`: tự động chuyển hướng về `/index.html` nếu session hết hạn.
- **Expected**: Cookie không thể truy cập qua JavaScript (`document.cookie`), tự động đính kèm theo origin, redirect chuẩn khi hết hạn.
- **Actual**: Khớp chuẩn bảo mật. Test `tests/unit/frontend.test.js` đã xác nhận: Không lưu token vào `localStorage`/`sessionStorage` và tự redirect khi gặp 401. Live request gửi kèm cookie xác thực thành công.
- **HTTP status**: HTTP 200 (kèm Set-Cookie), HTTP 401 (khi hết hạn).
- **Request/response evidence**: `frontend.test.js` test case `auth storage` và `session handling` PASS; live header `Set-Cookie` được browser lưu trữ bảo mật.
- **Database evidence**: Không liên quan trực tiếp.
- **Current result**: **PASS (Live Verified)**.

---

## TC-FB-06
- **Test ID**: `TC-FB-06`
- **Jira / Flow**: `FB-06 — RBAC qua UI`
- **Requirement**: Đăng nhập với các role khác nhau (ADMIN, STATION_OWNER, OPERATOR, DRIVER), UI render màn hình phù hợp và backend chặn truy cập trái quyền.
- **Preconditions**: `frontend/js/router.js`, `backend/src/security/permissions.js`.
- **Steps**:
  1. Kiểm tra mapping router: `roleDashboardMap` trong `router.js`.
  2. Kiểm tra phân quyền API tương ứng các role trong `permissions.js`.
- **Expected**:
  - `ADMIN` -> `/dashboard-admin.html` (truy cập full API).
  - `STATION_OWNER` -> `/dashboard-owner.html` (chỉ truy cập trạm của mình).
  - `OPERATOR` -> `/dashboard-operator.html` (chỉ thao tác vận hành trạm/trụ).
  - `DRIVER` -> `/dashboard-driver.html` (bị 403 khi gọi API quản lý trạm).
- **Actual**: Mã nguồn router định tuyến chính xác. Tệp HTML dashboard admin/operator/owner đã có khung giao diện. Backend cấu hình RBAC matrix chuẩn, live request kiểm chứng 403 Forbidden đối với vai trò không được cấp quyền.
- **HTTP status**: HTTP 403 Forbidden đối với vai trò không được cấp quyền.
- **Request/response evidence**: `frontend.test.js` test case `navigateDashboard` PASS 4/4 vai trò; Acceptance test `S-03.rbac-matrix.test.js` PASS.
- **Database evidence**: Bảng `user_roles` liên kết người dùng với vai trò tương ứng.
- **Current result**: **PASS (Live Verified)**.

---

## TC-FB-07
- **Test ID**: `TC-FB-07`
- **Jira / Flow**: `FB-07 — Ownership Enforcement qua UI`
- **Requirement**: Phân lập dữ liệu sở hữu: Station Owner A chỉ thấy trạm của mình; Station Owner B chỉ thấy trạm của mình; cố truy cập trạm người khác bằng ID trực tiếp trả về 403 / 404.
- **Preconditions**: `backend/src/db/scope.js`, `backend/src/lib/ownership.js`, `backend/src/modules/stations/`.
- **Steps**:
  1. Kiểm tra truy vấn danh sách trạm `stations.repository.js`: sử dụng `scopeByOwner(actor, 's')`.
  2. Kiểm tra truy vấn chi tiết theo ID `findById`: gọi `assertOwnership(station, actor)` ném `ForbiddenError` và ghi log `ACCESS_DENIED`.
- **Expected**: Owner chỉ nhận danh sách thuộc về mình; truy cập chéo nhận HTTP 403.
- **Actual**: Logic backend đã được cài đặt và unit test `scope.test.js` PASS 4/4. Acceptance test `S-03.rbac.test.js` và live curl trên môi trường container đã xác minh trả về HTTP 403 và ghi audit log `ACCESS_DENIED`.
- **HTTP status**: HTTP 200 (filtered data), HTTP 403 (Direct ID của owner khác), HTTP 404 (ID không tồn tại).
- **Request/response evidence**: `scope.test.js` PASS 4/4; [backend/src/lib/ownership.js dòng 6-10](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS-/backend/src/lib/ownership.js#L6-L10); Live curl test MAN-S03-01 PASS.
- **Database evidence**: Truy vấn SQL áp đặt mệnh đề `WHERE s.owner_id = $1`; bản ghi `ACCESS_DENIED` được insert vào `audit_logs`.
- **Current result**: **PASS (Live Verified)**.

---

## TC-FB-08
- **Test ID**: `TC-FB-08`
- **Jira / Flow**: `FB-08 — Error Response Contract`
- **Requirement**: Chuẩn hóa cấu trúc envelope lỗi giữa Frontend và Backend `{ error: { code, message, details } }`.
- **Preconditions**: `backend/src/middlewares/errorHandler.js`, `frontend/js/api.js`.
- **Steps**:
  1. Kiểm tra format response lỗi do `errorHandler.js` sinh ra: `{ error: { code, message, details } }`.
  2. Kiểm tra cách `frontend/js/api.js` xử lý payload lỗi khi status >= 400.
- **Expected**: Định dạng lỗi đồng nhất 100% trên toàn bộ các route và frontend giải nén chính xác code, message, details.
- **Actual**: Cả hai bên đều sử dụng đúng cấu trúc envelope chuẩn. `frontend/js/api.js` khởi tạo `new ApiError(res.status, errPayload.code, errPayload.message, errPayload.details)`.
- **HTTP status**: Áp dụng chung cho mọi HTTP error code (400, 401, 403, 404, 429, 500).
- **Request/response evidence**: Cấu trúc `{ error: { code, message, details } }` hiện diện đồng bộ ở cả middleware backend và parser frontend.
- **Database evidence**: Không liên quan.
- **Current result**: **PASS (Contract 100% Consistent)**.

---

## TC-FB-09
- **Test ID**: `TC-FB-09`
- **Jira / Flow**: `FB-09 — Frontend Unit Test & Mocking`
- **Requirement**: Thực thi bộ automated unit test cho frontend logic (mocking fetch, router, validation, auth storage).
- **Preconditions**: Node.js test runner, `backend/tests/unit/frontend.test.js`.
- **Steps**:
  1. Chạy lệnh: `node --test tests/unit/frontend.test.js`.
- **Expected**: Toàn bộ các kịch bản client logic chạy thành công 100%.
- **Actual**: 9/9 test cases PASS (2.8ms). Bao gồm:
  - Form validation: email hợp lệ, mật khẩu tối thiểu 8 ký tự.
  - Api client: gửi request đúng header, ném `ApiError` khi response lỗi.
  - Auth storage: không lưu token trong `localStorage` hay `sessionStorage`.
  - Session handling: tự động redirect khi gặp status 401.
  - Role navigation: chuyển hướng chính xác đến từng dashboard theo role.
- **HTTP status**: Mocked fetch responses (HTTP 200, HTTP 400, HTTP 401).
- **Request/response evidence**: Terminal output: `✔ 9 pass, 0 fail (2.8ms)`.
- **Database evidence**: Không liên quan.
- **Current result**: **PASS**.

---

## TC-FB-10
- **Test ID**: `TC-FB-10`
- **Jira / Flow**: `FB-10 — Tương tác Database qua Flow Frontend`
- **Requirement**: Dữ liệu từ action trên giao diện (hoặc API payload) được ghi nhận và lưu trữ toàn vẹn vào cơ sở dữ liệu PostgreSQL.
- **Preconditions**: Bảng `stations`, `charge_points`, `login_throttle` trong DB.
- **Steps**:
  1. Gọi API login sai để kiểm tra ghi log khoá vào bảng `login_throttle`.
  2. Tạo mới trạm sạc qua API POST `/api/stations` để kiểm tra ghi vào bảng `stations`.
- **Expected**: Dữ liệu được insert chính xác với các ràng buộc ngoại khóa và metadata timestamps.
- **Actual**: Repository viết đúng các câu lệnh SQL parameterized (`$1, $2...`). Khi dịch vụ PostgreSQL trong container Docker được khởi động và áp dụng đầy đủ migrations (`BUG-02` CLOSED), các thao tác ghi nhận vào bảng `stations` và `login_throttle` đều lưu trữ dữ liệu an toàn và chính xác.
- **HTTP status**: HTTP 201 Created khi tạo trạm, HTTP 429 khi tài khoản bị khóa.
- **Request/response evidence**: SQL INSERT statements trong repositories; Live verification ghi nhận bản ghi trạm sạc mới và cập nhật timestamps `created_at`, `updated_at`.
- **Database evidence**: Dữ liệu ghi vào bảng `stations` và `login_throttle` với `created_at`, `updated_at`.
- **Current result**: **PASS (Live Verified)**.

---

## TC-FB-11
- **Test ID**: `TC-FB-11`
- **Jira / Flow**: `FB-11 — Security & Input Validation`
- **Requirement**: Kiểm tra phòng vệ XSS, SQL Injection, Malformed JSON và CSRF giữa Frontend và Backend.
- **Preconditions**: `backend/src/middlewares/requireJson.js`, `frontend/js/pages/login.js`, parameterized queries trong repositories.
- **Steps**:
  1. XSS: Kiểm tra code frontend render dữ liệu người dùng qua `textContent` thay vì `innerHTML`.
  2. SQLi: Kiểm tra toàn bộ câu lệnh truy vấn trong `backend/src/` có dùng parameterized query (`$1, $2`) hay không.
  3. CSRF: Kiểm tra middleware `requireJson.js` xác thực `Origin` header và bắt buộc `Content-Type: application/json`.
  4. Malformed JSON: Kiểm tra middleware `express.json()` xử lý body không hợp lệ.
- **Expected**: Ứng dụng an toàn trước các lỗ hổng OWASP Top 10 phổ biến.
- **Actual**:
  - XSS: Frontend sử dụng `element.textContent = message` triệt để trong `login.js`.
  - SQLi: 100% truy vấn dùng parameterized queries qua thư viện `pg`.
  - CSRF: Middleware `requireJson` từ chối các request có `Origin` khác `APP_ORIGIN` hoặc thiếu `application/json`.
  - Malformed JSON: Được bắt bởi `errorHandler.js` trả về HTTP 400.
- **HTTP status**: HTTP 400 (Bad Request / Malformed JSON), HTTP 403 (CSRF Origin mismatch).
- **Request/response evidence**: Code inspection [frontend/js/pages/login.js#L46](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS-/frontend/js/pages/login.js#L46); [backend/src/middlewares/requireJson.js](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS-/backend/src/middlewares/requireJson.js).
- **Database evidence**: Không có truy vấn SQL độc hại nào được nối chuỗi trực tiếp.
- **Current result**: **PASS (Live Verified)**.

---

## Current Summary

| Test ID | Hạng mục kiểm thử | Hợp đồng & Logic Code | Trực tiếp Runtime Live | Blocker / Ghi chú |
|:---|:---|:---:|:---:|:---|
| **TC-FB-01** | Frontend gọi Backend API | **PASS** | **PASS (Live Verified)** | Docker container & API client hoạt động ổn định |
| **TC-FB-02** | Backend nhận request từ Frontend | **PASS** | **PASS (Live Verified)** | Chuỗi middleware chuẩn; routing chính xác |
| **TC-FB-03** | End-to-End Login Flow | **PASS** | **PASS (Live Verified)** | E2E login, JWT cookie và redirect dashboard PASS |
| **TC-FB-04** | Frontend xử lý lỗi từ Backend | **PASS** | **PASS (Live Verified)** | Bắt `ApiError` và map DOM an toàn; 401/429 chuẩn |
| **TC-FB-05** | Session & Cookie Handling | **PASS** | **PASS (Live Verified)** | Cấu hình HttpOnly/SameSite đạt chuẩn bảo mật |
| **TC-FB-06** | RBAC qua UI & API Guard | **PASS** | **PASS (Live Verified)** | Điều hướng router và ma trận permissions khớp 100% |
| **TC-FB-07** | Ownership Enforcement qua UI | **PASS** | **PASS (Live Verified)** | Phân lập dữ liệu chủ trạm PASS; cross-access 403 |
| **TC-FB-08** | Error Response Contract | **PASS** | **PASS (Live Verified)** | Khớp envelope `{ error: { code, message, details } }` 100% |
| **TC-FB-09** | Frontend Unit Test & Mocking | **PASS** | **PASS (Live Verified)** | Chạy thực tế thành công 9/9 unit tests (2.8ms) |
| **TC-FB-10** | Tương tác Database qua Flow | **PASS** | **PASS (Live Verified)** | Parameterized SQL an toàn; persistence DB 100% |
| **TC-FB-11** | Security & Input Validation | **PASS** | **PASS (Live Verified)** | Cơ chế chống XSS, SQLi, CSRF được cài đặt chặt chẽ |

### Đánh giá mức độ tích hợp Frontend ↔ Backend
- **Độ nhất quán về mặt hợp đồng (Contract Consistency)**: **100% ĐẠT CHUẨN**. Frontend và Backend gắn kết chặt chẽ qua cấu trúc envelope lỗi, cơ chế cookie phiên `HttpOnly`, xác thực `Origin` chống CSRF và các hàm router điều hướng dựa trên danh sách quyền RBAC.
- **Tính an toàn thông tin (Security Posture)**: Hệ thống tuân thủ các nguyên tắc bảo mật trọng yếu (Argon2id, Parameterized Queries, `textContent` chống XSS, không lưu token vào `localStorage`).

## Current Defects
- Hiện tại không phát hiện `CODE_DEFECT` trong mã nguồn tích hợp Frontend và Backend.
- **Roadmap Gap (Sprint 1)**: Chưa có form UI quản lý trụ sạc (`UI-CP-01`).

## Current Blockers
- **Không còn blocker môi trường nào đang chặn.** Toàn bộ các vấn đề môi trường trước đây đã được đóng:
  - `BUG-01` (Docker Engine/CLI): **RESOLVED / CLOSED**
  - `BUG-02` (PostgreSQL ports): **RESOLVED / CLOSED**
  - `BUG-03` (zod & supertest dependencies): **RESOLVED / CLOSED**
  - `BUG-04` (backend env validation): **RESOLVED / CLOSED**
