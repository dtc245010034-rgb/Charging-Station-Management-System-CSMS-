# BÁO CÁO LỖI (BUG REPORT) — CSMS

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Người phát hiện**: Nguyễn Hà Nam (Developer / QA — Team-Codegym)  
> **Giai đoạn**: Giai đoạn 3 — Viết Unit Test  
> **Ngày lập**: 2026-09-22  
> **Quy tắc tuân thủ**: Tuyệt đối KHÔNG tự ý sửa production code. Mọi lỗi được ghi nhận minh bạch kèm theo phân loại mức độ và bằng chứng tái hiện.

---

## Danh sách lỗi phát hiện từ quá trình kiểm thử

### BUG-01: Unhandled Promise Rejection khi tự động nâng cấp hash mật khẩu legacy bcrypt

- **BUG-ID**: `BUG-01`
- **Module**: `Authentication & Security`
- **File**: [`backend/src/auth.js`](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS--main/Charging-Station-Management-System-CSMS--main/backend/src/auth.js#L92-L95)
- **Function**: `verifyPassword(user, password)`
- **Test phát hiện**: `UT-AUTH-02 [P1]: verifyPassword legacy bcrypt support and auto-upgrade`
- **Mức độ nghiêm trọng (Severity)**: `CRITICAL`
- **Mô tả chi tiết**:
  Khi người dùng đăng nhập bằng mật khẩu cũ được băm bằng bcrypt (`$2a$` hoặc `$2b$`), hệ thống xác thực đúng và khởi chạy một Promise ngầm (`fire-and-forget`) để băm lại mật khẩu sang Argon2id rồi lưu vào DB:
  ```javascript
  // auth.js dòng 91-95:
  if (match) {
    hashPassword(password).then((newHash) => {
      db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newHash, user.id);
    }).catch(() => {});
  }
  ```
  Hàm `db.prepare(...).run(...)` là một hàm bất đồng bộ trả về một `Promise`. Tuy nhiên, bên trong callback của `.then((newHash) => { ... })`, Promise này **không được return** và cũng **không có `.catch()`**.
- **Hậu quả**:
  Nếu cơ sở dữ liệu gặp sự cố kết nối, quá tải hoặc query lỗi, Promise bị từ chối (`rejected`) sẽ không được bắt bởi `.catch(() => {})` bên ngoài, dẫn tới sự kiện `UnhandledPromiseRejection` (trong Node.js 16+ có thể làm crash toàn bộ tiến trình ứng dụng hoặc gây lỗi kiểm thử tự động `AggregateError`).
- **Các bước tái hiện (Steps to reproduce)**:
  1. Khởi tạo một user có mật khẩu dạng bcrypt (`$2a$...` hoặc `$2b$...`).
  2. Gọi `verifyPassword(user, password)` khi cơ sở dữ liệu tạm thời không thể thực thi truy vấn (ví dụ DB pool bị ngắt kết nối).
  3. Quan sát log hệ thống.
- **Kết quả mong đợi (Expected Result)**:
  Promise cập nhật ngầm phải được xử lý lỗi đầy đủ (return Promise hoặc gắn `.catch()` trực tiếp lên `.run()`) để tránh Unhandled Promise Rejection.
- **Kết quả thực tế (Actual Result)**:
  Node.js v24 bắt được unhandled rejection và báo lỗi `generated asynchronous activity after the test ended: AggregateError`.
- **Trạng thái**: `OPEN (Ghi nhận để Dev team xử lý)`

---

### BUG-02: Hàm tiện ích `numeric` coi `null` là giá trị hợp lệ bằng 0 thay vì fallback

- **BUG-ID**: `BUG-02`
- **Module**: `Utility & Validation`
- **File**: [`backend/src/server.js`](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS--main/Charging-Station-Management-System-CSMS--main/backend/src/server.js#L31)
- **Function**: `numeric(value, fallback = 0)`
- **Test phát hiện**: `UT-UTIL-02 [P1]: numeric helper handling`
- **Mức độ nghiêm trọng (Severity)**: `MINOR`
- **Mô tả chi tiết**:
  Hàm `numeric` được định nghĩa:
  ```javascript
  const numeric = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  ```
  Trong JavaScript: `Number(null)` có giá trị là `0`. Vì `0` là một số hữu hạn (`Number.isFinite(0) === true`), nên biểu thức luôn trả về `0` khi `value = null`, khiến tham số `fallback` bị bỏ qua.
- **Hậu quả**:
  Nếu một request truyền giá trị `{ end_meter: null }` lên `/api/sessions/:id/stop`, thay vì fallback về giá trị mặc định `start_meter + energy_kwh`, hàm lại ép về `0`, dẫn đến tính sai số điện và tiền sạc.
- **Kết quả mong đợi (Expected Result)**:
  Khi `value === null` hoặc `value === undefined`, nên sử dụng giá trị `fallback`.
- **Kết quả thực tế (Actual Result)**:
  `numeric(null, 5)` trả về `0` thay vì `5`.
- **Trạng thái**: `OPEN (Ghi nhận để Dev team xem xét chuẩn hóa)`
