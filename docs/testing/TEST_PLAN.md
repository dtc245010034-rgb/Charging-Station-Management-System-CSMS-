# KẾ HOẠCH KIỂM THỬ (TEST PLAN) — CSMS

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Người lập kế hoạch**: Nguyễn Hà Nam (Developer / QA — Team-Codegym)  
> **Giai đoạn**: Giai đoạn 2 — Test Inventory & Test Plan  
> **Ngày lập**: 2026-09-22  
> **Cam kết thực hiện**: Tuyệt đối không can thiệp hay sửa đổi production code.

---

## 1. Scope (Phạm vi kiểm thử)

Kế hoạch kiểm thử này bao phủ toàn bộ các thành phần mã nguồn backend và giao thức kết nối thực tế trong workspace:

1. **Authentication & Security Module (`backend/src/auth.js`)**:
   - Thuật toán băm và xác thực mật khẩu (Argon2id, bcrypt fallback).
   - Cơ chế khóa đăng nhập (Account Lockout: 5 lần liên tiếp -> khóa 15 phút, tính thời gian còn lại, mở khóa sau thời gian chờ hoặc reset khi thành công).
   - Cấp phát và xác thực JWT token (httpOnly cookie & Authorization header).
   - Phân quyền RBAC qua middleware `allow(...)`.
   - Hàm tiện ích người dùng (`publicUser`, `getUserRoles`).
2. **Station & Charge Point Management (`backend/src/server.js`)**:
   - Nghiệp vụ Trạm sạc (`stations`): Thêm mới, đọc danh sách, chi tiết, cập nhật thông tin.
   - Nghiệp vụ Trụ sạc (`charge_points`): Thêm mới kèm sinh 4 cổng sạc (connectors 1-4), kiểm tra ràng buộc mã `code` UNIQUE, chặn đổi mã khi đã có lịch sử phiên sạc.
3. **Charging Sessions & Meter Values (`backend/src/server.js`)**:
   - Bắt đầu phiên sạc: kiểm tra cổng sạc bận/rảnh, cập nhật trạng thái `CHARGING`.
   - Ghi nhận chỉ số đồng hồ (`meter_values`): kiểm tra điều kiện không giảm (`meter >= start_meter`), cập nhật `energy_kwh`.
   - Kết thúc phiên sạc: tính tiền dựa trên biểu giá hoạt động (`tariffs`), chuyển cổng sạc về `AVAILABLE`.
4. **Billing, Tariffs & Reconciliation (`backend/src/server.js`)**:
   - Quản lý biểu giá điện năng (`tariffs`).
   - Ghi nhận thanh toán (`payments`).
   - Đối soát doanh thu theo ngày (`reconciliation`).
5. **OCPP 1.6-style WebSocket Server (`backend/src/server.js`)**:
   - Kết nối WebSocket handshake theo mã trụ sạc (`/ocpp/:chargePointCode`).
   - Xử lý các bản tin: `BootNotification`, `Heartbeat`, `StatusNotification`, `Authorize`.
   - Xử lý các trường hợp ngoại lệ: sai định dạng JSON (`FormatViolation`), action không hỗ trợ (`NotSupported`).
6. **Audit Logs & Maintenance (`backend/src/server.js`)**:
   - Ghi nhật ký hệ thống tự động khi tạo/sửa trạm và trụ sạc.
   - Lịch bảo trì thiết bị.

---

## 2. Out of Scope (Ngoài phạm vi kiểm thử)

1. **Power Management (Điều phối / Cân bằng công suất động)**:
   - *Lý do*: Trong source code hiện tại chỉ lưu trữ giá trị `power_kw` trên bảng dữ liệu, chưa triển khai thuật toán cân bằng tải hay giới hạn công suất động. Ghi nhận `CHƯA XÁC ĐỊNH TỪ SOURCE`.
2. **Frontend UI Automation (E2E bằng Selenium / Cypress / Playwright)**:
   - *Lý do*: Dự án chưa cài đặt framework E2E; mục tiêu trọng tâm trong Sprint là kiểm thử Unit Test và Integration Test cho backend API & WebSocket logic.
3. **Stress / Load Testing quy mô lớn**:
   - *Lý do*: Nằm ngoài phạm vi kiểm thử chức năng và tính toàn vẹn của Team Charter hiện tại.

---

## 3. Test Objectives (Mục tiêu kiểm thử)

1. Đạt độ tin cậy cao cho toàn bộ logic nghiệp vụ cốt lõi (Session, Billing, Lockout, RBAC).
2. Phát hiện sớm các lỗi tiềm ẩn (logic bugs, unhandled exceptions, thiếu validation) mà không tự ý sửa đổi code.
3. Đo lường chính xác tỷ lệ bao phủ mã nguồn (Code Coverage: Line, Branch, Function) bằng công cụ có sẵn.
4. Đảm bảo toàn bộ test case có thể chạy tự động, lặp lại và độc lập trên mọi môi trường (sử dụng in-memory database fallback `pg-mem`).

---

## 4. Test Levels & Chiến lược kiểm thử

| Cấp độ | Mục tiêu | Kỹ thuật & Công cụ | Phạm vi áp dụng |
|:---|:---|:---|:---|
| **Unit Test** | Kiểm tra độc lập các hàm nghiệp vụ, logic toán học, validation và middleware | Node.js native assert (`node:assert`), hàm thuần túy | `auth.js` (hash, verify, lockout, roles, publicUser) |
| **Integration Test (DB)** | Kiểm tra sự tương tác giữa code nghiệp vụ và tầng cơ sở dữ liệu qua các truy vấn SQL | In-memory PostgreSQL (`pg-mem`) thông qua pool proxy trong `db.js` | Migrations, seed data, CRUD operations, transactions |
| **API Automated Test** | Kiểm tra trọn vẹn request/response HTTP, status code, cookie, header và JSON body | `http` request runner nội bộ kết hợp Express app instance | Các endpoint REST tại `server.js` |
| **WebSocket Test** | Kiểm tra luồng gửi/nhận bản tin 2 chiều theo giao thức OCPP | Thư viện `ws` kết nối tới WebSocket server | Kênh `/ocpp/:chargePointCode` |

---

## 5. Phân loại mức độ ưu tiên (Test Priority)

- **P0 — Bắt buộc kiểm thử trước**:
  - *Lý do*: Các module quyết định tính an toàn, bảo mật và dòng tiền của hệ thống. Nếu các module này lỗi, hệ thống bị xâm nhập hoặc mất dữ liệu tài chính (Authentication, Account Lockout, RBAC, Charging Session Life-cycle, Biểu giá tính tiền).
- **P1 — Quan trọng**:
  - *Lý do*: Các chức năng vận hành thiết bị hàng ngày, ràng buộc toàn vẹn dữ liệu phần cứng (Station CRUD, Charge Point CRUD, ràng buộc 4 Connectors, cấm đổi mã trụ khi đã có session, WebSocket OCPP handshake & actions cơ bản).
- **P2 — Bổ sung**:
  - *Lý do*: Các chức năng báo cáo, thống kê phụ trợ và nhật ký (Payments, Dashboard, Reconciliation, Audit Logs, Maintenance).
- **P3 — Backlog / Tối ưu sau**:
  - *Lý do*: Các kiểm thử hiệu năng, stress test, kiểm thử UI frontend.

---

## 6. Traceability Matrix (Ma trận truy vết từ Code sang Test)

| Source File | Function / Route | Behavior / Logic nghiệp vụ | Kịch bản kiểm thử (Test Scenario) | Loại Test | Trạng thái |
|:---|:---|:---|:---|:---|:---:|
| `backend/src/auth.js` | `hashPassword` | Mã hóa bằng Argon2id | Băm mật khẩu, kiểm tra tiền tố `$argon2id$` | Unit | Đã có (EXT-01) |
| `backend/src/auth.js` | `verifyPassword` | So khớp mật khẩu đã băm | Mật khẩu đúng -> true, sai -> false | Unit | Đã có (EXT-01) |
| `backend/src/auth.js` | `verifyPassword` | Hỗ trợ bcrypt hash cũ và tự động nâng cấp | Mật khẩu dạng `$2a$...` so khớp bcrypt đúng | Unit | **CẦN BỔ SUNG** |
| `backend/src/auth.js` | `checkUserLock` | Kiểm tra thời hạn khóa 15 phút sau 5 lần sai | 1-4 lần không khóa; lần 5 khóa; tính số phút còn lại | Unit | Đã có (EXT-02) |
| `backend/src/auth.js` | `checkUserLock` | Tự động mở khóa khi đã qua thời gian `locked_until` | `locked_until` trong quá khứ -> locked: false | Unit | **CẦN BỔ SUNG** |
| `backend/src/auth.js` | `authenticate` | Đọc JWT từ cookie httpOnly | Token hợp lệ trong cookie -> `req.user` được gán | Acceptance | Đã có (EXT-04) |
| `backend/src/auth.js` | `authenticate` | Đọc JWT từ header `Authorization: Bearer <token>` | Token hợp lệ trong header -> `req.user` được gán | Unit / Int | **CẦN BỔ SUNG** |
| `backend/src/auth.js` | `authenticate` | Từ chối token hết hạn / không hợp lệ | Trả về HTTP 401 | Unit / Int | Đã có (EXT-04) |
| `backend/src/auth.js` | `allow(...roles)` | Kiểm tra vai trò người dùng | Role hợp lệ -> next(); Role không thuộc danh sách -> HTTP 403 | Unit | **CẦN BỔ SUNG** |
| `backend/src/auth.js` | `publicUser` | Loại bỏ trường nhạy cảm `password_hash` | Trả về user object không có `password_hash` | Unit | **CẦN BỔ SUNG** |
| `backend/src/server.js` | `POST /api/auth/register` | Validation đầu vào và tạo user | Thiếu name/email/pass hoặc pass < 8 ký tự -> 400 | API Test | **CẦN BỔ SUNG** |
| `backend/src/server.js` | `POST /api/auth/login` | Đăng nhập đúng và khóa tài khoản khi sai | Nhập sai pass 5 lần -> lần 6 báo lỗi 429 kèm thời gian khóa | API Test | **CẦN BỔ SUNG** |
| `backend/src/server.js` | `POST /api/stations` | Tạo trạm sạc mới | Thiếu name hoặc address -> 400; Đầy đủ -> 201 | API Test | **CẦN BỔ SUNG** |
| `backend/src/server.js` | `GET /api/stations/:id` | Xem trạm kèm danh sách trụ | ID hợp lệ -> 200 kèm `charge_points`; ID sai -> 404 | API Test | **CẦN BỔ SUNG** |
| `backend/src/server.js` | `POST /api/stations/:id/charge-points` | Tạo trụ sạc và sinh 4 cổng sạc | Tạo trụ thành công sinh 4 connectors 1-4; Trùng code -> lỗi | API Test | **CẦN BỔ SUNG** |
| `backend/src/server.js` | `PATCH /api/charge-points/:id` | Cấm đổi mã trụ đã có session sạc | Trụ đã có phiên sạc -> từ chối đổi mã với 409 Conflict | API Test | **CẦN BỔ SUNG** |
| `backend/src/server.js` | `POST /api/sessions/start` | Khởi tạo phiên sạc | Connector đang CHARGING -> 409 Conflict; Thành công -> 201 | API Test | **CẦN BỔ SUNG** |
| `backend/src/server.js` | `POST /api/sessions/:id/meter-values` | Nạp chỉ số đồng hồ | `meter < start_meter` -> 400; Hợp lệ -> cập nhật `energy_kwh` | API Test | **CẦN BỔ SUNG** |
| `backend/src/server.js` | `POST /api/sessions/:id/stop` | Kết thúc phiên sạc & tính tiền | Tính tiền `(end - start) * price_per_kwh`; connector -> AVAILABLE | API Test | **CẦN BỔ SUNG** |
| `backend/src/server.js` | `POST /api/tariffs` | Tạo biểu giá điện | Quyền ADMIN/MANAGER/FINANCE tạo thành công; user thường -> 403 | API Test | **CẦN BỔ SUNG** |
| `backend/src/server.js` | `GET /api/reconciliation` | Báo cáo đối soát doanh thu | Nhóm theo ngày, tính tổng năng lượng kWh và số tiền | API Test | **CẦN BỔ SUNG** |
| `backend/src/server.js` | WebSocket `/ocpp/:code` | OCPP Handshake | Kết nối nhận thông điệp chào mừng `type 3` | WebSocket | **CẦN BỔ SUNG** |
| `backend/src/server.js` | WebSocket `/ocpp/:code` | OCPP BootNotification & Heartbeat | Gửi bản tin chuẩn -> nhận phản hồi `Accepted`, `interval 60` | WebSocket | **CẦN BỔ SUNG** |
| `backend/src/server.js` | WebSocket `/ocpp/:code` | OCPP Format Violation | Gửi chuỗi không phải JSON -> trả về lỗi `FormatViolation` | WebSocket | **CẦN BỔ SUNG** |

---

## 7. Chi tiết Kế hoạch Unit Test cần bổ sung

| Test ID | Module | Function | Scenario | Input | Expected Result | Priority | Existing? |
|:---|:---|:---|:---|:---|:---|:---:|:---:|
| **UT-AUTH-01** | Auth | `verifyPassword` | Password trống hoặc null | `user = { password_hash: '...' }, password = ''` | Trả về `false`, không văng exception | P0 | Chưa |
| **UT-AUTH-02** | Auth | `verifyPassword` | Hỗ trợ mật khẩu cũ băm bằng bcrypt | Hash `$2a$...`, password đúng | Trả về `true` | P1 | Chưa |
| **UT-AUTH-03** | Auth | `checkUserLock` | Khóa đã hết hạn theo thời gian | `locked_until = new Date(Date.now() - 1000)` | Trả về `{ locked: false }` | P0 | Chưa |
| **UT-AUTH-04** | Auth | `allow` | User có vai trò hợp lệ | `req.user.roles = ['ADMIN'], allow('ADMIN')` | Gọi hàm `next()` | P0 | Chưa |
| **UT-AUTH-05** | Auth | `allow` | User không đủ quyền hạn | `req.user.role = 'DRIVER', allow('ADMIN')` | `res.status(403)` với message lỗi | P0 | Chưa |
| **UT-AUTH-06** | Auth | `allow` | Truy cập không đăng nhập | `req.user = null, allow('OPERATOR')` | `res.status(401)` với message lỗi | P0 | Chưa |
| **UT-AUTH-07** | Auth | `authenticate` | Lấy token từ header Authorization | `headers = { authorization: 'Bearer <valid_token>' }` | Gọi `next()`, `req.user` chứa payload | P0 | Chưa |
| **UT-AUTH-08** | Auth | `authenticate` | Header Authorization không đúng chuẩn | `headers = { authorization: 'Basic 12345' }` | Trả về `res.status(401)` | P1 | Chưa |
| **UT-AUTH-09** | Auth | `publicUser` | Bảo mật thông tin nhạy cảm | Object user đầy đủ thông tin kể cả `password_hash` | Object trả về không chứa trường `password_hash` | P0 | Chưa |

---

## 8. Chi tiết Kế hoạch Integration & Automated API / WebSocket Test

| Test ID | Component A | Component B | Scenario | Expected Result | Priority |
|:---|:---|:---|:---|:---|:---:|
| **IT-AUTH-01** | API `/api/auth/register` | Database (`users`) | Đăng ký tài khoản mới hợp lệ | Tạo bản ghi trong DB, trả về HTTP 201 kèm JWT và cookie httpOnly | P0 |
| **IT-AUTH-02** | API `/api/auth/register` | Input Validation | Đăng ký với mật khẩu ngắn (< 8 ký tự) | Trả về HTTP 400 'name, email và password >= 8 ký tự là bắt buộc' | P0 |
| **IT-AUTH-03** | API `/api/auth/login` | Lockout Logic | Đăng nhập sai 5 lần liên tiếp vào tài khoản tồn tại | Lần 5 cập nhật `locked_until`, lần 6 trả về HTTP 429 Too Many Requests | P0 |
| **IT-STN-01** | API `/api/stations` | Database (`stations`) | Tạo trạm sạc thiếu trường `name` hoặc `address` | Trả về HTTP 400 'name và address là bắt buộc' | P1 |
| **IT-STN-02** | API `/api/stations` | Database (`stations`, `charge_points`) | Lấy danh sách trạm | Trả về danh sách trạm kèm thuộc tính `charge_point_count` chính xác | P1 |
| **IT-CP-01** | API `/api/stations/:id/charge-points` | Database (`connectors`) | Thêm trụ sạc mới cho trạm | Tự động sinh ra 4 bản ghi `connectors` có số thứ tự từ 1 đến 4 | P1 |
| **IT-CP-02** | API `/api/charge-points/:id` | Business Rule | Đổi mã trụ sạc khi trụ đã có lịch sử phiên sạc | Trả về HTTP 409 'Không thể đổi mã trụ đã có lịch sử sạc' | P0 |
| **IT-SES-01** | API `/api/sessions/start` | Database (`connectors`, `sessions`) | Khởi động phiên sạc trên connector đang sạc | Trả về HTTP 409 'Connector đang có phiên sạc' | P0 |
| **IT-SES-02** | API `/api/sessions/start` | Database (`connectors`) | Khởi động phiên sạc hợp lệ | Connector chuyển trạng thái sang `CHARGING`, phiên sạc status = `ACTIVE` | P0 |
| **IT-SES-03** | API `/api/sessions/:id/meter-values` | Business Rule | Gửi chỉ số sạc nhỏ hơn chỉ số bắt đầu | Trả về HTTP 400 'Meter không được nhỏ hơn meter bắt đầu' | P0 |
| **IT-SES-04** | API `/api/sessions/:id/meter-values` | Database (`sessions`, `meter_values`) | Gửi chỉ số sạc hợp lệ tăng dần | Ghi nhận bản ghi meter_values, cập nhật `energy_kwh = meter - start_meter` | P0 |
| **IT-SES-05** | API `/api/sessions/:id/stop` | Billing Module (`tariffs`) | Dừng phiên sạc và tính tiền | Tính đúng `amount = energy_kwh * tariff.price_per_kwh`, connector về `AVAILABLE` | P0 |
| **IT-REC-01** | API `/api/reconciliation` | Database (`sessions`) | Đối soát doanh thu theo ngày | Nhóm các phiên COMPLETED/STOPPED theo `DATE(ended_at)`, tính tổng kWh và tiền | P1 |
| **IT-WS-01** | WebSocket Client | WebSocket Server (`/ocpp/:code`) | Kết nối WebSocket tới trạm sạc | Nhận bản tin chào mừng type = 3, chứa tên chargePoint và status: Connected | P0 |
| **IT-WS-02** | WebSocket Client | OCPP Message Handler | Gửi bản tin OCPP `BootNotification` chuẩn | Nhận bản tin phản hồi type 3, status: `Accepted`, interval: 60 | P0 |
| **IT-WS-03** | WebSocket Client | Error Handler | Gửi bản tin chuỗi sai cú pháp JSON | Nhận bản tin lỗi `[4, null, "FormatViolation", {}]` | P1 |

---

## 9. Tiêu chí nghiệm thu (Acceptance Criteria) cho Giai đoạn Kiểm thử

1. **Tuân thủ quy tắc production code**: Tuyệt đối không thay đổi bất kỳ file source code nào (`server.js`, `auth.js`, `db.js`, migrations, frontend).
2. **Thực thi kiểm thử thực tế**: 100% test case mới và cũ đều được chạy thực tế qua test runner, xuất kết quả PASS/FAIL minh bạch.
3. **Phát hiện và báo cáo bug**: Bất kỳ sự sai lệch nào giữa tài liệu/yêu cầu và hành vi thực tế của source code đều phải được ghi nhận vào `BUG_REPORT.md` với đầy đủ bước tái hiện.
4. **Báo cáo độ phủ**: Đo đạc độ phủ mã nguồn sau khi chạy toàn bộ test suite và so sánh với baseline ban đầu.
5. **Tính toàn vẹn của Git**: Chỉ lưu trữ và commit các file test và tài liệu kiểm thử trong `docs/testing/`.
