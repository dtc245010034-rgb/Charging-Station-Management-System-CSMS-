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
| **S-01** | **BLOCKED** | Khung ứng dụng chưa khởi động được do thiếu Docker (`BUG-01`) và module `zod` (`BUG-03`). NFR bảo mật secret/log đã PASS. |
| **T-01** | **BLOCKED** | Migration forward/rollback bị chặn do PostgreSQL cổng 5433 chưa mở (`BUG-02`). Naming convention DB đạt chuẩn PASS. |
| **S-02** | **BLOCKED** | Live login & lockout bị chặn do server chưa boot. Logic Argon2id, timing defense, throttle DB và client unit tests đã PASS. |
| **T-04** | **PASS** | Schema `users`, `roles`, `user_roles` hoàn toàn chuẩn xác, email UNIQUE, password TEXT, đủ 5 vai trò. |
| **T-05** | **BLOCKED** | Live lockout & session cookie bị chặn do server chưa boot. Logic cookie httpOnly và lưu trữ `login_throttle` DB đã PASS. |
| **S-03** | **BLOCKED** | Live RBAC & curl 403 bị chặn do server chưa boot. Unit test `scopeByOwner` PASS 4/4; Route Guard Default Deny đã PASS. |
| **T-06** | **BLOCKED** | Live guard bị chặn do server chưa boot. Logic `secureRouter()` Default Deny 403 cho route chưa khai quyền đã PASS. |
| **T-07** | **BLOCKED** | Live curl 403 chéo giữa 2 owner bị chặn do server chưa boot. Hàm `scopeByOwner` và ghi audit log `ACCESS_DENIED` đã PASS. |

---

## Test Statistics

- **PASS**: 37 (Bao gồm 18 automated unit tests con chạy xanh 100% cùng các hạng mục hợp đồng, thiết kế an ninh và cấu trúc dữ liệu)
- **FAIL**: 0 (Không phát hiện lỗi sai lệch logic nghiệp vụ trong mã nguồn)
- **BLOCKED**: 28 (Các bài test chạy thực tế live HTTP, container, live API curl, migration bị chặn do môi trường)
- **NOT VERIFIED**: 0 (Toàn bộ các tiêu chí đã được xác minh qua mã nguồn hoặc xác định nguyên nhân môi trường cụ thể)
- **NOT FOUND**: 2 (Giao diện UI quản lý trạm sạc và trụ sạc trên frontend theo kế hoạch Sprint 1)
- **NOT RUN**: 0 (Đã thực thi toàn bộ các bài test có thể chạy được trong điều kiện máy host hiện tại)
- **TỔNG CỘNG**: 65

---

## Current Blockers

1. **`BUG-01`**: Máy host chưa cài đặt Docker Desktop hoặc chưa có lệnh `docker` trong PATH.
2. **`BUG-02`**: Cổng dịch vụ PostgreSQL 5432 (dev) và 5433 (test) bị từ chối kết nối (`ECONNREFUSED`).
3. **`BUG-03`**: Thư mục `backend/node_modules` thiếu module `zod@^4.6.5`, `supertest@^7.3.0`, `eslint@^9.39.5`.
4. **`BUG-04`**: Tệp cấu hình `backend/.env` có `JWT_SECRET` < 32 ký tự và thiếu biến `APP_ORIGIN`.

---

## Current Defects

| Bug ID | Title | Type | Status |
|:---|:---|:---|:---:|
| **`BUG-01`** | Thiếu Docker Engine và Docker CLI trong PATH môi trường máy host | `ENVIRONMENT_BLOCKER` | OPEN |
| **`BUG-02`** | Cổng PostgreSQL 5432 (dev) và 5433 (test) bị đóng, dịch vụ không chạy | `ENVIRONMENT_BLOCKER` | OPEN |
| **`BUG-03`** | Thư mục `backend/node_modules` thiếu các module bắt buộc (`zod`, `supertest`) | `ENVIRONMENT_BLOCKER` | OPEN |
| **`BUG-04`** | Cấu hình tệp `backend/.env` không vượt qua kiểm thực Zod schema | `CONFIGURATION_PROBLEM` | OPEN |
| **`BUG-05`** | Script lint trong `backend/package.json` bị lỗi đường dẫn trên Windows | `CONFIGURATION_PROBLEM` | OPEN |

*(Hiện tại không phát hiện `CODE_DEFECT` trong mã nguồn ứng dụng)*.

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
