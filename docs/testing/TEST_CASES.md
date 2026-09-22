# DANH SÁCH TEST CASES CHI TIẾT (TEST CASES) — CSMS

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Người thực hiện**: Nguyễn Hà Nam (Developer / QA — Team-Codegym)  
> **Giai đoạn**: Giai đoạn 5 — Tổng kết & Báo cáo kết quả kiểm thử  
> **Ngày cập nhật**: 2026-09-22  

---

## Danh mục chi tiết 45 Test Cases đã thực thi thực tế

| ID | Module | Function / Component | Kịch bản kiểm thử (Scenario) | Input | Expected Result | Actual Result | Trạng thái |
|:---|:---|:---|:---|:---|:---|:---|:---:|
| **EXT-01** | Auth | `hashPassword`, `verifyPassword` | Kiểm tra thuật toán Argon2id và xác thực mật khẩu đúng / sai | `'UserSecurePassword123!'` | Hash tiền tố `$argon2id$`, verify đúng -> true, sai -> false | Đúng như mong đợi | **PASS** |
| **EXT-02** | Auth | `checkUserLock` | Kiểm tra logic khóa 5 lần sai -> khóa 15 phút, lần 6 bị chặn | 5 lần sai liên tiếp, lần thứ 6 nhập mật khẩu | Bị khóa 15 phút, trả về locked: true, reset khi đúng | Đúng như mong đợi | **PASS** |
| **EXT-03** | Auth | RBAC Roles | Xác thực cấu hình 5 vai trò hệ thống chuẩn | Mảng vai trò hệ thống | 5 vai trò: DRIVER, STATION_OWNER, OPERATOR, ACCOUNTANT, ADMIN | 5 vai trò khớp chuẩn | **PASS** |
| **EXT-04** | Auth | `authenticate` | Trích xuất token từ httpOnly cookie và xử lý token hết hạn | Cookie chứa valid token / expired token | Token hợp lệ gán `req.user`, token hết hạn trả về HTTP 401 | Đúng như mong đợi | **PASS** |
| **UT-AUTH-01a** | Auth | `verifyPassword` | Kiểm tra khi user là null hoặc undefined | `user = null` hoặc `undefined` | Trả về `false`, không văng exception | Trả về `false` | **PASS** |
| **UT-AUTH-01b** | Auth | `verifyPassword` | Kiểm tra khi user không có password_hash | `user = {}` hoặc `{ id: 1 }` | Trả về `false` | Trả về `false` | **PASS** |
| **UT-AUTH-01c** | Auth | `verifyPassword` | Kiểm tra khi password rỗng, null hoặc undefined | `password = ''`, `null` | Trả về `false` | Trả về `false` | **PASS** |
| **UT-AUTH-02** | Auth | `verifyPassword` | Xác thực mật khẩu cũ băm bằng bcrypt ($2a$/$2b$) và auto-upgrade | Hash bcrypt `$2a$...`, pass đúng/sai | Khớp mật khẩu đúng, kích hoạt nâng cấp sang Argon2id | Khớp đúng và kích hoạt cập nhật DB | **PASS** |
| **UT-AUTH-03a** | Auth | `checkUserLock` | Kiểm tra khi user không có trường `locked_until` | `user.locked_until = null` | Trả về `{ locked: false }` | Trả về `{ locked: false }` | **PASS** |
| **UT-AUTH-03b** | Auth | `checkUserLock` | Tự động mở khóa khi thời gian khóa đã trôi qua | `locked_until` là thời điểm quá khứ | Trả về `{ locked: false }` | Trả về `{ locked: false }` | **PASS** |
| **UT-AUTH-03c** | Auth | `checkUserLock` | Giữ trạng thái khóa và tính số phút còn lại khi khóa đang hiệu lực | `locked_until` còn 10 phút | `locked: true`, `remainingMinutes ~ 10` | `locked: true`, số phút chính xác | **PASS** |
| **UT-AUTH-04a** | Auth | `allow` | Cho phép truy cập khi role chính của user hợp lệ | `user.role = 'ADMIN'`, `allow('ADMIN')` | Gọi hàm `next()` | Gọi hàm `next()` | **PASS** |
| **UT-AUTH-04b** | Auth | `allow` | Cho phép truy cập khi role nằm trong mảng `user.roles` | `user.roles = ['OPERATOR', 'ACCOUNTANT']` | Gọi hàm `next()` | Gọi hàm `next()` | **PASS** |
| **UT-AUTH-05** | Auth | `allow` | Từ chối 403 Forbidden khi role không thuộc danh sách cho phép | `user.role = 'DRIVER'`, `allow('ADMIN')` | Trả về HTTP 403 'Không đủ quyền truy cập' | Trả về HTTP 403 | **PASS** |
| **UT-AUTH-06** | Auth | `allow` | Từ chối 401 khi `req.user` không tồn tại (chưa xác thực) | `req.user = undefined` | Trả về HTTP 401 'Yêu cầu đăng nhập' | Trả về HTTP 401 | **PASS** |
| **UT-AUTH-07** | Auth | `authenticate` | Xác thực người dùng qua header `Authorization: Bearer <token>` | Header `Bearer <valid_jwt>` | Gọi `next()`, gán `req.user` chính xác | Gọi `next()`, gán `req.user` | **PASS** |
| **UT-AUTH-08a** | Auth | `authenticate` | Từ chối 401 khi header không dùng lược đồ Bearer | Header `Basic dXNlcjpwYXNz` | Trả về HTTP 401 'Yêu cầu đăng nhập' | Trả về HTTP 401 | **PASS** |
| **UT-AUTH-08b** | Auth | `authenticate` | Từ chối 401 khi token sai chữ ký hoặc format hỏng | `Bearer invalid.token.payload` | Trả về HTTP 401 'Phiên đăng nhập đã hết hạn...' | Trả về HTTP 401 | **PASS** |
| **UT-AUTH-09a** | Auth | `publicUser` | Khử trường nhạy cảm `password_hash` trong object user | Object user đầy đủ thông tin | Không chứa thuộc tính `password_hash` | Đã loại bỏ `password_hash` | **PASS** |
| **UT-AUTH-09b** | Auth | `publicUser` | Gán vai trò mặc định là `OPERATOR` nếu user thiếu role | User không có thuộc tính `role` | `sanitized.role === 'OPERATOR'` | Gán đúng `OPERATOR` | **PASS** |
| **UT-LOCK-01a** | Auth | `recordUserFailedLogin` | Tăng số lần thử sai khi số lần < 5 | `failed_attempts = 2` | Tăng lên 3, `locked_until = null` | SQL update đúng count = 3 | **PASS** |
| **UT-LOCK-01b** | Auth | `recordUserFailedLogin` | Khóa tài khoản 15 phút tại lần thứ 5 | `failed_attempts = 4` | Tăng lên 5, `locked_until = now + 15 min` | SQL update count = 5 và set Date | **PASS** |
| **UT-LOCK-01c** | Auth | `resetUserFailedAttempts` | Đặt lại số lần thử sai về 0 khi đăng nhập thành công | `userId = 10` | `failed_attempts = 0, locked_until = NULL` | SQL update reset thành công | **PASS** |
| **UT-SES-01a** | Sessions | `calculateSessionEnergy` | Tính điện năng tiêu thụ: `meter - start_meter` | `start = 100.0, meter = 125.4` | `energy = 25.4 kWh` | 25.4 kWh | **PASS** |
| **UT-SES-01b** | Sessions | `calculateSessionEnergy` | Giá trị biên khi chỉ số meter không thay đổi | `start = 50, meter = 50` | `energy = 0 kWh` | 0 kWh | **PASS** |
| **UT-SES-02** | Sessions | `calculateSessionEnergy` | Bắt lỗi ngoại lệ khi chỉ số meter nhỏ hơn chỉ số ban đầu | `start = 100.0, meter = 99.9` | Ném Exception 'Meter không được nhỏ hơn...' | Ném Exception chính xác | **PASS** |
| **UT-SES-03** | Sessions | `calculateStopSessionValues` | Fallback `end_meter` khi client không truyền `end_meter` | `bodyEndMeter = undefined, start = 100, energy = 18.5` | `endMeter = 118.5 kWh` | 118.5 kWh | **PASS** |
| **UT-BIL-01** | Billing | `calculateStopSessionValues` | Tính tiền sạc tiêu chuẩn: `kWh * price_per_kwh` | `30 kWh, price = 3500 VND/kWh` | `amount = 105,000 VND` | 105,000 VND | **PASS** |
| **UT-BIL-02** | Billing | `calculateStopSessionValues` | Giá trị biên tiêu thụ 0 kWh | `0 kWh, price = 3850 VND` | `amount = 0 VND` | 0 VND | **PASS** |
| **UT-BIL-03a** | Billing | `calculateStopSessionValues` | Giá trị biên khi không có biểu giá (tariff = null) | `50 kWh, tariff = null` | `amount = 0 VND` | 0 VND | **PASS** |
| **UT-BIL-03b** | Billing | `calculateStopSessionValues` | Giá trị biên khi biểu giá miễn phí (price = 0) | `50 kWh, price = 0` | `amount = 0 VND` | 0 VND | **PASS** |
| **UT-BIL-04** | Billing | `calculateStopSessionValues` | Tính toán chính xác với số thập phân | `15.25 kWh, price = 3850.5` | `amount = 58,720.125` | 58,720.125 | **PASS** |
| **UT-UTIL-01a** | DB Helper | `convertPlaceholders` | Chuyển đổi dấu `?` đơn thành `$1` | `WHERE id = ?` | `WHERE id = $1` | `WHERE id = $1` | **PASS** |
| **UT-UTIL-01b** | DB Helper | `convertPlaceholders` | Chuyển đổi nhiều dấu `?` thành `$1, $2, $3` | `VALUES (?, ?, ?)` | `VALUES ($1, $2, $3)` | `VALUES ($1, $2, $3)` | **PASS** |
| **UT-UTIL-02a** | Utility | `numeric` | Parse số nguyên và chuỗi số hợp lệ | `42`, `'123.45'` | `42`, `123.45` | `42`, `123.45` | **PASS** |
| **UT-UTIL-02b** | Utility | `numeric` | Fallback giá trị khi chuỗi không hợp lệ, NaN, undefined | `'invalid', fallback = 10` | `10` | `10` | **PASS** |
| **UT-UTIL-02c** | Utility | `numeric` | Kiểm tra hành vi JavaScript với `null` (coercion sang 0) | `null, fallback = 5` | `0` | `0` | **PASS** |
| **UT-OCPP-01** | OCPP | `processOcppMessage` | Xử lý bản tin `BootNotification` chuẩn | `[2, 'id1', 'BootNotification', {...}]` | Trả về `[3, 'id1', { status: 'Accepted', interval: 60 }]` | Type 3, status Accepted, interval 60 | **PASS** |
| **UT-OCPP-02a** | OCPP | `processOcppMessage` | Xử lý bản tin `Authorize` khi có `idTag` hợp lệ | `[2, 'id2', 'Authorize', { idTag: 'RFID' }]` | Trả về `{ idTagInfo: { status: 'Accepted' } }` | Status Accepted | **PASS** |
| **UT-OCPP-02b** | OCPP | `processOcppMessage` | Xử lý bản tin `Authorize` khi thiếu hoặc rỗng `idTag` | `[2, 'id3', 'Authorize', {}]` | Trả về `{ idTagInfo: { status: 'Invalid' } }` | Status Invalid | **PASS** |
| **UT-OCPP-03** | OCPP | `processOcppMessage` | Xử lý bản tin `Heartbeat` | `[2, 'id4', 'Heartbeat', {}]` | Trả về `{ currentTime: '<iso_timestamp>' }` | Type 3 kèm currentTime | **PASS** |
| **UT-OCPP-04** | OCPP | `processOcppMessage` | Xử lý bản tin `StatusNotification` | `[2, 'id5', 'StatusNotification', {...}]` | Trả về `{ status: 'Accepted' }` | Type 3 status Accepted | **PASS** |
| **UT-OCPP-05a** | OCPP | `processOcppMessage` | Xử lý khi action không được hỗ trợ | `[2, 'id6', 'UnknownAction', {}]` | Trả về `[4, 'id6', 'NotSupported', {}]` | Type 4 NotSupported | **PASS** |
| **UT-OCPP-05b** | OCPP | `processOcppMessage` | Xử lý khi message type khác 2 (CALL) | `[3, 'id7', 'BootNotification', {}]` | Trả về `[4, 'id7', 'NotSupported', {}]` | Type 4 NotSupported | **PASS** |
| **UT-OCPP-06a** | OCPP | `processOcppMessage` | Bắt lỗi khi bản tin JSON sai cú pháp | `'{ malformed json ['` | Trả về `[4, null, 'FormatViolation', {}]` | Type 4 FormatViolation | **PASS** |
| **UT-OCPP-06b** | OCPP | `processOcppMessage` | Bắt lỗi khi bản tin JSON không phải định dạng mảng | `'{"type": 2}'` | Trả về `[4, null, 'FormatViolation', {}]` | Type 4 FormatViolation | **PASS** |
| **UT-OCPP-07** | OCPP | `matchOcppUrl` | Trích xuất và giải mã mã trụ sạc từ URL WebSocket | `'/ocpp/CP-HANOI-01'`, `'/ocpp/CP%2001'` | Trả về `'CP-HANOI-01'`, `'CP 01'`; URL khác -> null | Trích xuất chính xác | **PASS** |
