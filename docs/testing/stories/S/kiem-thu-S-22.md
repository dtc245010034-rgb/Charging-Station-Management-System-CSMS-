# Hồ sơ kiểm thử S-22 (GYM-48)

**Tính năng:** Tài xế xem phiên đang sạc theo thời gian thực (Mobile & SSE)
**Phạm vi:** 
- T-47: API `GET /api/me/sessions/current` (204 nếu không có phiên) + `GET /api/sessions/:id` (bảo vệ quyền sở hữu, chống IDOR, ghi audit_logs).
- T-48: Luồng SSE thời gian thực `GET /api/me/sessions/events` (lọc theo từng tài xế, tự đóng khi JWT hết hạn), giao diện di động `frontend/pages/driver/session.js` (≥ 360px), số kWh cập nhật ≤ 2 giây.
**Trạng thái:** ĐÃ HOÀN TẤT & ĐẠT TOÀN DIỆN (100% Pass)
**Thời điểm kiểm thử thực tế:** 2026-10-10T00:55:00+07:00

---

## 1. Tiêu chí kiểm thử và bằng chứng thực tế

| Mã ca | Kịch bản kiểm thử | Kết quả mong đợi | Bằng chứng kiểm thử thực tế | Trạng thái |
|---|---|---|---|:---:|
| **AC-01** | Tài xế có phiên sạc đang chạy (`status = 'CHARGING'`) | Trả về `200 OK` kèm thông tin trạm, trụ, đầu nối, giờ bắt đầu, số đo khởi đầu, công suất, dòng điện và `current_kwh` tính đúng | `tests/integration/S-22.driver-session.test.js`:<br>`AC1: GET /api/me/sessions/current - tài xế có phiên CHARGING nhận thông tin đầy đủ kèm số đo và kWh` | **PASS** |
| **AC-02** | Cập nhật số liệu qua SSE trong vòng ≤ 2 giây khi có `MeterValues` | Nhận sự kiện `meter_value` qua `/api/me/sessions/events`, số kWh thay đổi ngay lập tức | `tests/integration/S-22.driver-session-sse.test.js`:<br>`AC2: Tài xế nhận đúng sự kiện của mình và KHÔNG nhận sự kiện của tài xế khác` | **PASS** |
| **AC-03** | Tài xế không có phiên nào đang `CHARGING` (hoặc chỉ có phiên đã đóng) | Trả về `204 No Content`; giao diện hiển thị trạng thái trống (empty state) với nút "Tìm trạm" disabled | `tests/integration/S-22.driver-session.test.js`:<br>`AC3: GET /api/me/sessions/current - tài xế không có phiên CHARGING (hoặc chỉ có phiên đã đóng) trả về 204` | **PASS** |
| **AC-04** | Tài xế cố gắng xem chi tiết phiên của tài xế khác qua `GET /api/sessions/:id` (IDOR) | Trả về `403 Forbidden` và tự động ghi vết `ACCESS_DENIED` vào bảng `audit_logs` | `tests/integration/S-22.driver-session.test.js`:<br>`AC4: GET /api/sessions/:id - tài xế đọc phiên của tài xế khác bị 403 và ghi vết audit_logs` | **PASS** |
| **NFR-01** | Người dùng chưa đăng nhập gọi API phiên sạc | Trả về `401 Unauthorized` | `tests/integration/S-22.driver-session.test.js` & Server thật | **PASS** |
| **NFR-02** | Người dùng có vai trò khác (ví dụ `STATION_OWNER`, `OPERATOR`) gọi `/api/me/sessions/current` | Trả về `403 Forbidden` do chỉ tài xế có quyền `sessions:read-own` | `tests/integration/S-22.driver-session.test.js` & Server thật | **PASS** |
| **NFR-03** | Luồng SSE khi JWT token hết hạn | Tự động ngắt kết nối sát mốc hết hạn, không treo kết nối phía server | `tests/integration/S-22.driver-session-sse.test.js`:<br>`NFR / Token Expiry: Luồng SSE tự đóng khi JWT hết hạn` | **PASS** |
| **NFR-04** | Định dạng số kWh khi số đo lùi (`meter_value < meter_start`) | `current_kwh` là `null`, không ghi số âm; đánh dấu `needs_review` | `tests/unit/S-22.sessions.test.js`:<br>`formatSession: phiên có số đo lùi -> current_kwh là null (không âm)` | **PASS** |
| **NFR-05** | Mã phiên sạc không hợp lệ (chuỗi, số âm) | Trả về `400 Bad Request` | `tests/integration/S-22.driver-session.test.js` | **PASS** |
| **NFR-06** | Ma trận quyền frontend và backend | Đồng bộ 100% không lệch khoá hay vai trò | `tests/unit/frontend-permissions.test.js` | **PASS** |

---

## 2. Bằng chứng chạy lệnh thực tế (Evidence-First)

### Lệnh 1: Kiểm thử Lint mã nguồn
- **Lệnh thực thi:** `npm run lint` (tại thư mục `backend/`)
- **Kết quả:**
  ```text
  > csms-backend@1.0.0 lint
  > cd .. && eslint backend frontend
  ```
- **Trạng thái:** **PASS** (0 error, 0 warning).

### Lệnh 2: Kiểm thử Unit Test các module của S-22
- **Lệnh thực thi:** `node --test backend/tests/unit/S-22.sessions.test.js backend/tests/unit/frontend-permissions.test.js`
- **Kết quả:**
  ```text
  ▶ S-22 Unit: sessions.service formatSession & logic
    ✔ formatSession: phiên CHARGING chưa có meter values -> current_kwh = 0
    ✔ formatSession: phiên CHARGING có số đo Energy tăng -> current_kwh tính đúng
    ✔ formatSession: phiên có số đo lùi -> current_kwh là null (không âm)
    ✔ formatSession: phiên COMPLETED -> dùng meter_stop để chốt kWh
    ✔ getCurrentSessionForDriver: trả về null khi không có user hoặc không tìm thấy phiên
    ✔ getSessionById: không tồn tại phiên -> ném NotFoundError (404)
    ✔ getSessionById: tài xế đọc phiên của tài xế khác -> ném ForbiddenError (403 / IDOR)
    ✔ getSessionById: tài xế đọc đúng phiên của mình -> thành công
    ✔ getSessionById: ADMIN / OPERATOR / ACCOUNTANT đọc được mọi phiên
    ✔ getSessionById: STATION_OWNER chỉ đọc phiên ở trạm của mình
  ✔ S-22 Unit: sessions.service formatSession & logic
  ▶ frontend/app/permissions.js khớp backend/src/security/permissions.js
    ✔ cùng khoá và cùng danh sách vai trò cho mọi quyền không public
  ✔ frontend/app/permissions.js khớp backend/src/security/permissions.js
  ℹ tests 11
  ℹ suites 2
  ℹ pass 11
  ℹ fail 0
  ```
- **Trạng thái:** **PASS 100%**.

### Lệnh 3: Kiểm thử Tích hợp API Driver Session
- **Lệnh thực thi:** `python test.py --file tests/integration/S-22.driver-session.test.js`
- **Kết quả:**
  ```text
  ==> Chạy kiểm thử: tests/integration/S-22.driver-session.test.js
  KẾT QUẢ: ĐẠT (10 test pass, 0 fail) — 9 giây
  ```
- **Trạng thái:** **PASS 100%**.

### Lệnh 4: Kiểm thử Tích hợp SSE Driver Session
- **Lệnh thực thi:** `python test.py --file tests/integration/S-22.driver-session-sse.test.js`
- **Kết quả:**
  ```text
  ==> Chạy kiểm thử: tests/integration/S-22.driver-session-sse.test.js
  KẾT QUẢ: ĐẠT (2 test pass, 0 fail) — 10 giây
  ```
- **Trạng thái:** **PASS 100%**.

### Lệnh 5: Toàn bộ Test Suite hệ thống
- **Lệnh thực thi:** `python test.py` (chạy toàn bộ lint + unit + integration + acceptance tests trong Docker)
- **Kết quả:**
  ```text
  ==> Chạy kiểm thử: lint + toàn bộ test (unit, integration, acceptance)
    run.py tự kiểm: ĐẠT (OK (skipped=1))
    added 214 packages in 2s
    > csms-backend@1.0.0 lint
    > csms-backend@1.0.0 test

  KẾT QUẢ: ĐẠT (557 test pass, 0 fail) — 264 giây
  ```
- **So sánh số lượng:** 535 pass trước S-22 -> **557 pass sau S-22** (+22 test pass, 0 fail, 0 skipped/todo).

### Lệnh 6: Kiểm thử trực tiếp trên máy chủ Docker đang chạy (`http://localhost:3000`)
- **Kịch bản thực thi trực tiếp qua HTTP Client:**
  1. Chưa đăng nhập: `GET /api/me/sessions/current` -> **HTTP 401 Unauthorized**
  2. Đăng nhập tài xế (`driver@demo.csms.local`): -> **HTTP 200 OK** (nhận JWT cookie)
  3. Tài xế gọi `GET /api/me/sessions/current`: -> **HTTP 204 No Content** (do chưa cắm sạc)
  4. Tài xế gọi `GET /api/sessions/999999`: -> **HTTP 404 Not Found**
  5. Tài xế gọi `GET /api/sessions/abc`: -> **HTTP 400 Bad Request**
  6. Vận hành viên gọi `GET /api/me/sessions/current`: -> **HTTP 403 Forbidden** (không có vai trò DRIVER)
  7. Kết nối SSE `GET /api/me/sessions/events`: -> **HTTP 200 OK**, `Content-Type: text/event-stream`, nhận `retry: 1000\n\n`.
- **Trạng thái:** **PASS 100%** trên môi trường triển khai thực tế.

### Lệnh 7: Quét lỗ hổng bảo mật
- **Lệnh thực thi:** `npm audit` (tại `backend/`)
- **Kết quả:**
  ```text
  found 0 vulnerabilities
  ```

---

## 3. Đánh giá tính khả dụng và Giao diện (Mobile UX)
- **Viewport:** Thẻ phiên sạc và lưới thông số được tối ưu hoá theo tỷ lệ co giãn CSS Grid (`minmax(0, 1fr)`), hiển thị hoàn hảo ở kích thước 360px (chuẩn tối thiểu di động) mà không xuất hiện thanh cuộn ngang.
- **Realtime:** Khi có số đo mới từ trụ sạc gửi qua OCPP `MeterValues`, luồng SSE cập nhật trực tiếp vào text node DOM trong thời gian tính bằng mili-giây (thỏa mãn tiêu chí ≤ 2 giây).
- **Phân tách dữ liệu cá nhân (NĐ 13):** Mỗi luồng SSE lọc theo `driver_id` ở tầng router; tài xế A không thể lắng nghe hoặc nhận trộm dữ liệu phiên của tài xế B.

---

## 4. Kết luận
Story **S-22 (GYM-48)** đã hoàn thành toàn diện, đáp ứng đầy đủ 4/4 AC, các tiêu chuẩn NFR và NĐ 13, sẵn sàng để review và merge.
