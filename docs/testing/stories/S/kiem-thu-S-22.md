# Hồ sơ kiểm thử S-22 (GYM-48)

**Tính năng:** Tài xế xem phiên đang sạc theo thời gian thực (Mobile & SSE)
**Phạm vi:** 
- T-47: API `GET /api/me/sessions/current` (204 nếu không có phiên) + `GET /api/sessions/:id` (bảo vệ quyền sở hữu, chống IDOR, ghi audit_logs).
- T-48: Luồng SSE thời gian thực `GET /api/me/sessions/events` (lọc theo từng tài xế, tự đóng khi JWT hết hạn), giao diện di động `frontend/pages/driver/session.js` (≥ 360px), số kWh cập nhật ≤ 2 giây.
**Trạng thái:** Bản giao đầu đạt 100% các ca ở mục 1 (chạy 2026-10-10T00:55:00+07:00). Các sửa lỗi sau báo cáo review lần 27 nằm trên nhánh `phuc/GYM-48-sua-loi-review-s22`: test tự động mới ở mục 1A, kiểm tay ở mục 1B **chưa chạy**. Chưa mở PR, chưa được duyệt; chưa phải "Xong".
**Thời điểm kiểm thử thực tế:** 2026-10-10T00:55:00+07:00 (bản giao đầu). Cập nhật tài liệu 2026-10-10 cho đợt sửa lỗi review.

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

Các ca ở mục 1 là kết quả của bản giao đầu. Các ca bên dưới là test thêm trong đợt sửa lỗi review.

### 1A. Test tự động thêm trong đợt sửa lỗi review

Cột trạng thái chỉ ghi kết quả đã chạy thật: file unit chạy ngày 2026-10-10 trong container Node 22 (7 file unit của đợt sửa: 79/79 đạt). File integration của đợt sửa có test nhưng tài liệu này chưa ghi kết quả chạy, nên để "Chưa ghi kết quả".

| Mã ca | Kịch bản kiểm thử | Kết quả mong đợi | Bằng chứng kiểm thử | Trạng thái |
|---|---|---|---|:---:|
| **FIX-01** | Đổi số đo theo đơn vị trụ gửi: Wh nguyên và thập phân (15500.5 Wh -> 5.5005 kWh), kWh (16 kWh -> 6), đơn vị viết hoa/có khoảng trắng, thiếu đơn vị (mặc định Wh), số mũ (1.55e4), số rất lớn | `liveEnergyKwh` trả đúng kWh, không làm tròn sai | `tests/unit/session-readings.test.js` (`liveEnergyKwh`) | **PASS** (unit) |
| **FIX-02** | Số đo không dùng được: nhỏ hơn mốc bắt đầu, đơn vị lạ, giá trị hỏng, thiếu mốc bắt đầu | `liveEnergyKwh` trả `null` (bằng mốc bắt đầu thì trả `0`); không ghi số âm, không đoán | `tests/unit/session-readings.test.js` | **PASS** (unit) |
| **FIX-03** | Công suất theo đơn vị: W giữ nguyên (kể cả 3680.5 W), 7.2 kW -> 7200 W, thiếu đơn vị (mặc định W), đơn vị lạ hoặc giá trị hỏng | `powerToWatts` trả W hoặc `null` | `tests/unit/session-readings.test.js` (`powerToWatts`, `toNumberOrNull`) | **PASS** (unit) |
| **FIX-04** | `formatSession` với Wh thập phân, kWh, kW và đơn vị năng lượng lạ; dòng dữ liệu thiếu cột số đo | `current_kwh` 5.5005 / 6, `latest_power_w` 7200, đơn vị lạ -> `null`, không ném lỗi | `tests/unit/S-22.sessions.test.js` | **PASS** (unit) |
| **FIX-05** | Trụ gửi Wh thập phân, kWh nguyên, kWh thập phân trên API và SSE; công suất 7.2 kW và W thập phân | `/me/sessions/current` và `/sessions/:id` trả 200 với `current_kwh` đúng; SSE có sự kiện; `latest_power_w` 7200 / giữ phần lẻ | `tests/integration/S-22.so-do-thap-phan.test.js` | Chưa ghi kết quả |
| **FIX-06** | Đường OCPP -> SSE/API bằng handler thật: phiên cũ bị đóng `ABNORMAL` khi có `StartTransaction` mới; `MeterValues` Wh thập phân + kW + SoC; `StopTransaction` | Tài xế cũ nhận `ABNORMAL`, tài xế mới nhận `CHARGING`, không lẫn; API và SSE cùng cho 5.5005 kWh, 3680 W, SoC 55; `StopTransaction` phát sự kiện `COMPLETED` (`type = 'session_stopped'`) với kWh cuối 20 | `tests/integration/S-22.sse-pipeline.test.js` | Chưa ghi kết quả |
| **FIX-07** | SSE lọc theo tài xế trước khi truy vấn; đăng ký không có `driverId`; listener ném lỗi; tài xế rời đi giữa lúc truy vấn | Không có người nghe đúng tài xế thì 0 truy vấn, 0 sự kiện; `subscribe` thiếu `driverId` ném `TypeError`; listener hỏng bị gỡ; sự kiện chỉ tới đúng tài xế | `tests/unit/sessions-events.test.js` | **PASS** (unit) |
| **FIX-08** | Nhiều lần phát cùng một phiên liên tiếp | Sự kiện phát tuần tự theo từng phiên, không đảo thứ tự | `tests/unit/sessions-events.test.js` | **PASS** (unit) |
| **FIX-09** | Lỗi khi phát sự kiện SSE | Ghi log `[SSE] Không phát được sự kiện phiên sạc`, không reject, không kẹt hàng đợi | `tests/unit/sessions-events.test.js` | **PASS** (unit) |
| **FIX-10** | Chạy `sessions.events.js` trong môi trường như CI (tiến trình con chỉ có `PATH`) | Không nạp `db/pool` và `config/env`; không `process.exit` | `tests/unit/sessions-events-ci-env.test.js` | **PASS** (unit) |
| **FIX-11** | `SoC` trong `MeterValues`: 0, 55, 100 hợp lệ; 101, 150, số âm, không phải số bị loại | `isPlausibleMeterValue` đúng giới hạn 0–100; giới hạn của Energy và Power không đổi | `tests/unit/meter-rules-soc.test.js` | **PASS** (unit) |
| **FIX-12** | Handler `MeterValues` nhận `SoC` | `SoC` hợp lệ được lưu (đơn vị mặc định `Percent`); `SoC` ngoài khoảng chỉ bị bỏ riêng, `Energy` cùng bản tin vẫn lưu; `Voltage` vẫn bị bỏ qua; `Energy` hỏng vẫn bị từ chối | `tests/unit/ocpp-meter-values-soc.test.js` | **PASS** (unit) |
| **FIX-13** | Logic thuần của trang phiên: `formatPower` (3680 -> "3,68 kW", 400 -> "400 W", 7200 -> "7,2 kW", 22000 -> "22 kW", 999.6 -> "1 kW", thiếu/âm -> "—"), `formatDuration`, `elapsedSeconds`, `endStateOf`, `decideAction` | `COMPLETED` -> "ĐÃ KẾT THÚC", `ABNORMAL` -> "BỊ GIÁN ĐOẠN"; `decideAction` chọn đúng bỏ qua / hiện màn hình trực tiếp / cập nhật / hiện màn hình kết thúc | `tests/unit/session-model.test.js` | **PASS** (unit) |

### 1B. Kiểm tay trên trình duyệt (chưa chạy)

Giao diện DOM của `frontend/pages/driver/session.js` không có test tự động (dự án không có jsdom); logic quyết định đã được test ở `session-model.test.js` (FIX-13). Phần dưới **chưa được chạy**: chưa có kết quả, chưa có ngày chạy. Khi chạy, ghi kết quả và ngày vào đây.

Cách chạy: dựng backend và một trụ ảo (xem `docs/DEMO_SPRINT2.md` và `tools/demo-charge-point.js`), đăng nhập tài xế sở hữu thẻ của trụ, mở `#/driver/session`, rồi làm lần lượt:

| # | Thao tác trên trụ ảo | Kết quả đúng | Kết quả thật |
|---|---|---|---|
| 1 | StartTransaction | Hiện màn hình trực tiếp, "ĐANG SẠC", kWh = 0 | Chưa chạy |
| 2 | MeterValues Power = 3680 W | Công suất hiện "3,68 kW" | Chưa chạy |
| 3 | MeterValues Power = 400 W | Hiện "400 W" | Chưa chạy |
| 4 | MeterValues Power = 7.2 kW | Hiện "7,2 kW" | Chưa chạy |
| 5 | MeterValues SoC = 55 | Thẻ Pin xe hiện "55 %" | Chưa chạy |
| 6 | MeterValues Energy = 15500.5 Wh (bắt đầu 10000) | Không lỗi 500; API và SSE trả 5.5005 kWh, giao diện hiện "5,501" (giao diện làm tròn tối đa 3 chữ số thập phân) | Chưa chạy |
| 7 | StopTransaction (meterStop 25000, bắt đầu 5000) | Hiện màn hình "Phiên sạc đã kết thúc", kWh "20", có giờ bắt đầu/kết thúc và thời gian sạc; đồng hồ dừng; **không** trống | Chưa chạy |
| 8 | Bấm "Xong" | Về trạng thái trống có nút Tìm trạm | Chưa chạy |
| 9 | Hai StartTransaction liên tiếp trên cùng đầu nối khi tab còn mở phiên đầu | Tab chuyển sang phiên mới (có thể thoáng thấy "Phiên sạc bị gián đoạn", kWh "—") | Chưa chạy |
| 10 | Giữa phiên: ngắt backend vài giây rồi bật lại, trong lúc đó gửi StopTransaction | Khi SSE nối lại, tab tự hiện màn hình kết thúc | Chưa chạy |
| 11 | Mở tab khi chưa có phiên, rồi StartTransaction | Tab tự chuyển từ trống sang màn hình trực tiếp | Chưa chạy |
| 12 | Giữa phiên: tắt hẳn backend rồi bật lại **sau khi** trình duyệt đã bỏ cuộc nối lại (thấy lỗi mạng trong tab Network), hoặc để JWT hết hạn | JWT hết hạn: tự chuyển về trang đăng nhập. Lỗi khác: hiện thanh "Mất kết nối cập nhật trực tiếp" kèm nút "Kết nối lại"; bấm thì thanh biến mất và số liệu cập nhật lại | Chưa chạy |

Ảnh chụp các bước 2, 3, 5, 7 sẽ đính kèm PR khi chạy. Nếu không chạy được trình duyệt thì ghi rõ trong PR là phần này chưa được kiểm tay.

---

## 2. Bằng chứng chạy lệnh thực tế (Evidence-First)

Các lệnh 1 đến 7 dưới đây là bằng chứng của **bản giao đầu** (2026-10-10T00:55, trước các sửa lỗi review). Chưa chạy lại sau khi sửa; con số 557 test không còn là tổng hiện tại. Tổng toàn bộ bộ test sau các sửa lỗi sẽ ghi sau lần chạy toàn bộ trong môi trường CI.

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
- **Phân tách dữ liệu cá nhân (NĐ 13):** Mỗi luồng SSE đăng ký với `driverId` của tài khoản (`subscribe` bắt buộc có `driverId`), và `publish` chỉ gọi listener của đúng tài xế; tài xế A không thể lắng nghe hoặc nhận trộm dữ liệu phiên của tài xế B. Việc lọc nằm ở `sessions.events.js` (test: `sessions-events.test.js`, `S-22.driver-session-sse.test.js`).
- **Phần chưa kiểm:** Bố cục 360px, cập nhật ≤ 2 giây, màn hình kết thúc phiên và thanh mất kết nối ở trên chưa có kiểm tay sau khi viết lại `session.js` (xem mục 1B).

---

## 4. Kết luận
Cập nhật 2026-10-10. Bản giao đầu của **S-22 (GYM-48)** đạt 4/4 AC và các NFR ở mục 1. Các lỗi review lần 27 đã được sửa trên nhánh `phuc/GYM-48-sua-loi-review-s22`; test unit mới đạt (mục 1A), test integration mới có nhưng chưa ghi kết quả chạy.

Chưa kết luận hoàn tất. Còn lại: kiểm tay trên trình duyệt (mục 1B), chạy toàn bộ bộ test trong môi trường CI và ghi tổng số, mở PR và được duyệt. Các phát hiện ngoài phạm vi (số kết nối SSE mỗi tài khoản, SSE không đóng khi thu hồi token, v.v.) ghi ở `docs/dev/S-22_2026-10-10.md` mục 4.
