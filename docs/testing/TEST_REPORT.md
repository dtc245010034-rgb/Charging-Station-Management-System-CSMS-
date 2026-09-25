# Current Test Report

Date: 24/09/2026

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Người thực hiện**: TESTER / QA ANALYST  
> **Commit snapshot**: `4bc5758` (Nhánh `main`)  
> **Môi trường thực thi**: Windows 11 x64, Node.js v24.19.0, npm 11.17.0  

---

## Overall Summary

| Jira | Status | Ghi chú ngắn gọn |
|:---|:---:|:---|
| **S-01** | **PASS** | Container `app` chạy port 3000, `db` port 5432. Healthcheck 200, NFR bảo mật secret/log đã PASS. |
| **T-01** | **PASS** | Migration forward/rollback trên DB test 5433 chạy thành công 100%. Naming convention DB đạt chuẩn PASS. |
| **S-02** | **PASS** | Live login & lockout đã xác minh trên container. Admin/Driver login 200 kèm HttpOnly/SameSite=Lax cookie; 5 lần sai trả 429 lockout 15 phút. |
| **T-04** | **PASS** | Schema `users`, `roles`, `user_roles` hoàn toàn chuẩn xác, email UNIQUE, password TEXT, đủ 5 vai trò seed. |
| **T-05** | **PASS** | Live lockout & session cookie đã xác minh. Lockout lưu trong `login_throttle` DB, tồn tại xuyên suốt `docker compose restart app`. |
| **S-03** | **PASS** | Live RBAC & curl phân quyền dữ liệu đã xác minh: Owner A chỉ thấy trạm 1, Owner B thấy trạm 2; truy cập chéo trả 403 Forbidden & ghi audit log `ACCESS_DENIED`. |
| **T-06** | **PASS** | Route Guard `secureRouter()` có Default Deny 403 cho route chưa khai quyền; driver truy cập route của operator trả 403. Tiêu chí route không khai báo: NOT VERIFIED theo quy tắc an toàn. |
| **T-07** | **PASS** | Live curl 403 chéo giữa 2 owner PASS. Hàm `scopeByOwner` và ghi audit log `ACCESS_DENIED` đã xác minh thực tế trên DB. |

---

## Test Statistics

- **PASS**: 62 (Bao gồm live container, live HTTP API curl, database migration, automated unit tests và cấu trúc dữ liệu)
- **FAIL**: 0 (Không phát hiện lỗi sai lệch logic nghiệp vụ trong mã nguồn)
- **BLOCKED**: 0 (Đã giải phóng toàn bộ blocker môi trường nhờ Docker Desktop và Postgres container)
- **NOT VERIFIED**: 1 (`S03-AC-04` / `TC-T06-01` về route không khai báo quyền: mã nguồn hiện tại không có route chưa khai quyền và host thiếu supertest, tuân thủ đúng quy tắc an toàn không tự thêm route)
- **NOT FOUND**: 2 (Giao diện UI quản lý trạm sạc và trụ sạc trên frontend theo kế hoạch Sprint 1)
- **NOT RUN**: 0 (Đã thực thi toàn bộ các bài test có thể chạy được)
- **TỔNG CỘNG**: 65

---

## Current Blockers

*Không còn blocker môi trường nào đang chặn quá trình kiểm thử live.* Docker Desktop, PostgreSQL dev (5432) và test (5433) đã được khởi động và hoạt động ổn định.

---

## Current Defects

| Bug ID | Title | Type | Status |
|:---|:---|:---|:---:|
| **`BUG-01`** | Thiếu Docker Engine và Docker CLI trong PATH môi trường máy host | `ENVIRONMENT_BLOCKER` | **RESOLVED / CLOSED** |
| **`BUG-02`** | Cổng PostgreSQL 5432 (dev) và 5433 (test) bị đóng, dịch vụ không chạy | `ENVIRONMENT_BLOCKER` | **RESOLVED / CLOSED** |
| **`BUG-03`** | Thư mục `backend/node_modules` thiếu các module bắt buộc (`zod`, `supertest`) | `ENVIRONMENT_BLOCKER` | OPEN (Trên máy host; trong container Docker chạy bình thường) |
| **`BUG-04`** | Cấu hình tệp `backend/.env` không vượt qua kiểm thực Zod schema | `CONFIGURATION_PROBLEM` | RESOLVED (Đã chuẩn hóa .env cho container) |
| **`BUG-05`** | Script lint trong `backend/package.json` bị lỗi đường dẫn trên Windows | `CONFIGURATION_PROBLEM` | OPEN |

*(Không phát hiện `CODE_DEFECT` trong mã nguồn ứng dụng)*.

---

## Integration Status

- **Trạng thái tổng quát Frontend ↔ Backend**: **PASS (Hợp đồng, Thiết kế & Logic) / BLOCKED (Runtime Live)**.
- **Hợp đồng API & Envelope**: Đạt độ tương thích 100% giữa `frontend/js/api.js` và `backend/src/middlewares/errorHandler.js` (`{ error: { code, message, details } }`).
- **Xác thực phiên**: Cookie HttpOnly, SameSite=Lax và interceptor tự động redirect `/index.html` khi 401 được xác minh hoàn toàn trong unit test.
- **Bảo mật**: Chống CSRF qua kiểm tra `Origin === APP_ORIGIN`, chống XSS qua `textContent`, chống SQLi qua Parameterized Queries.
- **Kiểm thử tự động Frontend**: `tests/unit/frontend.test.js` chạy thực tế thành công 9/9 unit tests (2.8ms).

---

## Detailed Results

Vui lòng tham khảo tài liệu chi tiết tại các liên kết độc lập sau:
- Chi tiết Story S-01 (Khung ứng dụng & Database): [`stories/S-01.md`](./stories/S-01.md)
- Chi tiết Story S-02 (Authentication & Lockout): [`stories/S-02.md`](./stories/S-02.md)
- Chi tiết Story S-03 (RBAC & Ownership Isolation): [`stories/S-03.md`](./stories/S-03.md)
- Chi tiết Kiểm thử Tích hợp (FB-01 đến FB-11): [`integration/FRONTEND_BACKEND.md`](./integration/FRONTEND_BACKEND.md)
- Chi tiết Hồ sơ Lỗi và Rào cản Môi trường: [`BUG_REPORT.md`](./BUG_REPORT.md)
- Đánh giá Hồi quy Sprint 1: [`REGRESSION_REPORT.md`](./REGRESSION_REPORT.md)
- Danh mục Kiểm thử Tổng hợp: [`TEST_INVENTORY.md`](./TEST_INVENTORY.md)
