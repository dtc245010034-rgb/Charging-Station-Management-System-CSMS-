# BÁO CÁO KIỂM THỬ VÀ NGHIỆM THU: STORY S-19 (GYM-45)
**Tính năng:** `MeterValues` ghi liên tục số đo điện năng, công suất, dòng điện  
**Ngày cập nhật:** 2026-10-07 (Sau khi truy xuất cội nguồn lỗi, vá hoàn tất và kiểm thử lại toàn bộ)  
**Thực hiện:** AI Tester & Dev Master phối hợp độc lập  

---

## 1. TÓM TẮT MỘT DÒNG
**ĐẠT (PASSED)** — Toàn bộ 4 lỗi phát hiện ở lần kiểm thử ban đầu (vi phạm D5 ghi bất đồng bộ, vi phạm D6 bỏ qua clock skew, lỗ hổng DoS mảng không giới hạn, và thiếu test tích hợp server) đã được **truy xuất tận gốc rễ (Root Cause), vá dứt điểm theo chuẩn Dev Master và xác minh thành công trên 100% test suite**: **492/492 test tự động pass** (+20 test so với S-18, +9 test so với S-19 ban đầu) và **8/8 ca kiểm thử live trên WebSocket server thật đều PASS**.

---

## 2. PHẠM VI KIỂM THỬ VÀ VÁ LỖI
- **Story:** S-19 (GYM-45) — *`MeterValues` ghi liên tục* (2 SP, Must, cổng vào của S-20 và S-22).
- **Task con:**
  - `T-40`: Migration `018_meter_values.sql` (bảng `meter_values`, các chỉ mục và bản rollback `.down.sql`).
  - `T-41`: Handler `backend/src/modules/ocpp/handlers/meter-values.js` và repository `meter-values.repository.js`.
  - `T-Test`: Bộ test tích hợp mới `backend/tests/integration/S-19.meter-values-server.test.js`.
- **Nhánh thực hiện:** `feat/ocpp-meter-values`.
- **Môi trường chạy thực tế:**
  - Docker Compose: Dịch vụ `app` (Node.js 22, Express 5, `ws`), `db` (PostgreSQL 16 Alpine, port 5434), `db_test` (port 5433).
  - Trụ ảo kiểm thử kết nối qua WebSocket: `ws://localhost:3000/ocpp/DEMO-ST01-CP1`.

---

## 3. TRUY XUẤT CỘI NGUỒN LỖI (ROOT CAUSE ANALYSIS) VÀ GIẢI PHÁP VÁ

### 🔴 BUG-S19-01: Vi phạm Quyết định D5 — Trả lời CALLRESULT trước khi ghi DB (Bất đồng bộ)
- **Cội nguồn lỗi (Root Cause):**
  - Trong tài liệu sơ khai T-41 có câu gợi ý cũ: *"gợi ý: trả lời trước, ghi sau để p95 < 200ms"*. Tuy nhiên, tại buổi họp Sprint 3 Planning (`docs/SPRINT_3_PLAN.md` mục 1), nhóm kỹ thuật đã thống nhất quyết định **D5** phủ quyết gợi ý này: *"MeterValues: ghi đồng bộ bằng một câu INSERT nhiều dòng rồi mới trả lời... Trả lời CALLRESULT trước khi dữ liệu xuống DB nghĩa là nếu ghi lỗi/tiến trình chết thì trụ đã xoá bộ đệm còn hệ thống mất số đo → sai kWh"*.
  - Lập trình viên phụ trách nhánh `feat/ocpp-meter-values` đã bám theo gợi ý cũ mà không đối chiếu D5, đưa hook `afterResponse` / `setImmediate` vào handler và viết cả unit test để ép buộc hành vi bất đồng bộ này.
- **Giải pháp vá (Dev Master):**
  - Loại bỏ hoàn toàn `afterResponse` và `setImmediate` khỏi `meter-values.js`.
  - Chuyển `persistMeterValues` thành hàm `async` được `await` trực tiếp trong handler. Handler chỉ trả về `{}` (CALLRESULT) sau khi dữ liệu đã được `INSERT` an toàn vào bảng `meter_values`.
  - Đo kiểm thực tế: Ghi đồng bộ một câu INSERT nhiều dòng chỉ mất **4ms – 8ms**, hoàn toàn vượt trội so với yêu cầu p95 < 200ms mà vẫn đảm bảo tính toàn vẹn 100% của số đo.

### 🟠 BUG-S19-02: Vi phạm Quyết định D6 — Bỏ qua kiểm tra Clock Skew > 24h & không bật needs_review
- **Cội nguồn lỗi (Root Cause):**
  - `meter-values.js` lấy thẳng `new Date(meterValue.timestamp).toISOString()` đưa vào SQL mà không truyền tham số `now` và không kiểm tra ngưỡng `MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000`.
  - Hàm `now()` trong `server.js` trả về chuỗi ISO (`new Date().toISOString()`), nếu dùng phép toán `Number(currentTime)` sẽ sinh `NaN`, làm biểu thức so sánh thời gian bị vô hiệu hoá âm thầm.
- **Giải pháp vá (Dev Master):**
  - Thêm hằng số `MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000`.
  - Chuẩn hoá `receivedAt` để xử lý linh hoạt cả `Date.now()` (number), `new Date()` (Date object) và `new Date().toISOString()` (chuỗi ISO) thông qua `Date.parse(currentTime)`.
  - Khi phát hiện `|reportedAt - receivedAt| > MAX_CLOCK_SKEW_MS`:
    1. Gán `sampledAt` bằng thời gian nhận của máy chủ (`receivedAt`).
    2. Cập nhật `charging_sessions` với `needs_review = true` và `review_reason = concat_ws('; ', NULLIF(review_reason, ''), 'CLOCK_SKEW')`.

### 🟡 BUG-S19-03: Lỗ hổng DoS (CWE-400) — Thiếu trần giới hạn số lượng phần tử mảng trong validatePayload
- **Cội nguồn lỗi (Root Cause):**
  - `validatePayload` chỉ kiểm tra kiểu mảng và không rỗng, thiếu kiểm tra độ dài tối đa cho `payload.meterValue` và `meterValue.sampledValue`. Khi số đo vượt quá 13.107 mục, câu lệnh SQL sẽ vượt giới hạn 65.535 tham số của giao thức PostgreSQL wire protocol.
- **Giải pháp vá (Dev Master):**
  - Thiết lập trần an toàn: `MAX_METER_VALUES = 100` và `MAX_SAMPLED_VALUES = 50`.
  - Từ chối ngay lập tức bằng `PropertyConstraintViolation` nếu mảng gửi lên vượt trần.

### 🟡 BUG-S19-05: Thiếu toàn bộ Test tích hợp trên WebSocket Server thật
- **Cội nguồn lỗi (Root Cause):** Nhánh phát triển chỉ có unit test mock, thiếu test kịch bản đầu cuối trên tiến trình Express + ws thật.
- **Giải pháp vá (Dev Master):**
  - Tạo mới file `backend/tests/integration/S-19.meter-values-server.test.js` gồm 7 ca kiểm thử toàn diện trên WebSocket server thật (boot trụ, StartTransaction, gửi MeterValues hợp lệ, bỏ qua Voltage, thiếu transactionId, cách ly orphan, lệch giờ D6, ghi đồng bộ D5, từ chối payload lỗi).

---

## 4. MA TRẬN TIÊU CHÍ CHẤP NHẬN (AC), NFR VÀ KẾT QUẢ NGHIỆM THU

| Mã | Tiêu chí yêu cầu trong Backlog / Sprint 3 Plan | Phương pháp kiểm | Kết quả | Bằng chứng thực tế (Evidence) |
|:---|:---|:---|:---:|:---|
| **AC1** | Bóc tách 2 tầng `meterValue[].sampledValue[]`, lưu các đại lượng hỗ trợ (`Energy.Active.Import.Register`, `Power.Active.Import`, `Current.Import`; từ GYM-48 thêm `SoC`) gắn đúng phiên | Gửi tin có đủ 3 đại lượng kèm `Voltage` qua WebSocket thật (lần kiểm 2026-10-07, chưa gửi `SoC`) | **ĐẠT** | Kết quả lần kiểm 2026-10-07, khi chưa lưu `SoC`: Session 22 lưu đúng 3 dòng vào `meter_values` với các giá trị: `1250 Wh`, `22000 W`, `31.9 A`. Khớp khóa ngoại `session_id`. Việc lưu `SoC` được kiểm bằng `tests/unit/ocpp-meter-values-soc.test.js`. |
| **AC2** | Đại lượng lạ (ví dụ `Voltage`, `Frequency`, `Temperature`) bị bỏ qua không gây lỗi; SoC được lưu từ GYM-48 (0–100 %, ngoài khoảng thì chỉ bỏ riêng mẫu SoC) | Gửi sample `{ value: '230', measurand: 'Voltage', unit: 'V' }` | **ĐẠT** | Nhận `CALLRESULT {}`, DB không lưu dòng `Voltage`, tiến trình CSMS hoạt động ổn định không lỗi. |
| **AC3** | Tin cho đầu nối không có phiên sạc $\rightarrow$ cách ly vào `orphan_messages`, không tạo phiên | Gửi `MeterValues` trên `connectorId: 2` (không có phiên mở) | **ĐẠT** | Bảng `orphan_messages` ghi nhận 1 bản ghi: `action = 'MeterValues'`, `reason = 'NO_ACTIVE_SESSION'`. Không tạo phiên ma. |
| **AC4** | `transactionId` là tuỳ chọn: có thì khớp theo `transactionId`, không có thì khớp phiên `CHARGING` của đầu nối | Gửi 1 tin có `transactionId`, 1 tin chỉ có `connectorId: 1` | **ĐẠT** | Cả 2 tin đều ghi thành công vào phiên sạc số 22 đang mở trên đầu nối 1 (`value = 1250` và `value = 1300`). |
| **AC5** | Đo độ trễ phản hồi: 20 trụ $\times$ 1 tin/10s $\rightarrow$ p95 < 200 ms | Bắn liên tiếp 50 tin `MeterValues` đo Round-Trip Time | **ĐẠT** | `min = 3ms`, `p50 = 4ms`, `p95 = 5ms`, `max = 8ms` (nhỏ hơn rất nhiều ngưỡng 200ms). |
| **NFR D5** | **Ghi đồng bộ bằng một câu INSERT nhiều dòng rồi mới trả lời (KHÔNG "trả lời trước, ghi sau")** | Gửi tin `value = 1999`, kiểm tra DB ngay khi nhận CALLRESULT mà không delay | **ĐẠT** | Dòng dữ liệu `value = 1999` có sẵn ngay lập tức trong DB khi frame CALLRESULT vừa chạm client. Không dùng `afterResponse`. |
| **NFR D6** | **Lệch đồng hồ tin nhắn $\pm 24$ giờ: ngoài khoảng dùng giờ nhận của server và bật `needs_review`** | Gửi tin có mốc 1970 (`1970-01-01T00:00:00Z`) | **ĐẠT** | Mốc 1970 được thay bằng giờ server (`2026-10-07T14:15:49Z`), session 22 được gắn cờ `needs_review = true` kèm lý do `CLOCK_SKEW`. |
| **NFR D12** | Chỉ nhận tin từ trụ sở hữu phiên, khác thì ghi `orphan_messages` | Kiểm tra giao thức với `transactionId` của trụ khác | **ĐẠT** | Cách ly vào `orphan_messages` với reason `CHARGE_POINT_MISMATCH`. |
| **T-40** | Migration `018_meter_values.sql`: tạo bảng, index, migration tiến / lùi sạch sẽ | Chạy kịch bản migration qua `migrate-017-charging-sessions.test.js` | **ĐẠT** | Tạo đủ các index, down xoá sạch bảng `meter_values`, up lại hoàn toàn sạch sẽ. |
| **T-41** | Chặn giá trị phi số bằng lỗi OCPP hợp lệ | Gửi `value: 'NaN'`, `connectorId: -1`, `meterValue: []` | **ĐẠT** | Trả về `CALLERROR PropertyConstraintViolation`. |
| **SEC-01** | Kiểm soát độ dài và số lượng phần tử đầu vào (Phòng chống DoS) | Gửi `meterValue.length = 101` | **ĐẠT** | Từ chối ngay lập tức bằng `PropertyConstraintViolation`. |

---

## 5. SỐ LIỆU KIỂM THỬ TOÀN HỆ THỐNG

### 5.1. Bộ test tự động toàn hệ thống (`python test.py`)
- **Trước S-19 (sau khi merge S-18 PR #93 trên `origin/main`):** 472 test pass, 0 fail.
- **Bản ban đầu trên `feat/ocpp-meter-values`:** 483 test pass, 0 fail (chỉ có unit test).
- **Sau khi Dev Master vá lỗi và bổ sung test tích hợp:**
  - **492 TEST PASS, 0 FAIL, 1 SKIP** (+20 test so với S-18, +9 test so với S-19 ban đầu).
  - Thời gian chạy toàn bộ: **245 giây**.
  - ESLint: **Pass 100% (0 error, 0 warning)**.

### 5.2. Kết quả kiểm thử độc lập trên WebSocket Server thật (`testing/verify-s19.js`)
- Kết nối tới `ws://localhost:3000/ocpp/DEMO-ST01-CP1` và DB thật `127.0.0.1:5434/csms`:
  - `TC-01`: Lưu 3 đại lượng (lần kiểm 2026-10-07, khi chưa lưu `SoC`), bỏ qua Voltage $\rightarrow$ **PASS**
  - `TC-02`: Khớp phiên theo connector khi thiếu transactionId $\rightarrow$ **PASS**
  - `TC-03`: Đầu nối không có phiên $\rightarrow$ orphan NO_ACTIVE_SESSION $\rightarrow$ **PASS**
  - `TC-04`: Đầu nối 0 $\rightarrow$ orphan UNDECLARED_CONNECTOR $\rightarrow$ **PASS**
  - `TC-05`: Payload không hợp lệ $\rightarrow$ PropertyConstraintViolation $\rightarrow$ **PASS**
  - `VERIFY-D5`: Ghi đồng bộ trước khi trả lời CALLRESULT $\rightarrow$ **PASS**
  - `VERIFY-D6`: Clock skew > 24h dùng giờ server và bật needs_review $\rightarrow$ **PASS**
  - `VERIFY-SEC-01`: Chặn mảng > 100 phần tử bằng PropertyConstraintViolation $\rightarrow$ **PASS**

---

## 6. KẾT LUẬN VÀ KHUYẾN NGHỊ

1. **Kết luận:**
   - Story S-19 (GYM-45) đã đạt **100% Tiêu chí chấp nhận (AC)** và **100% Yêu cầu phi chức năng (NFR)** theo đúng `docs/SPRINT_3_PLAN.md`.
   - Toàn bộ các vi phạm kiến trúc (D5, D6, DoS, coverage) đã được sửa triệt để và kiểm chứng bằng bằng chứng thực thi cụ thể.
2. **Khuyến nghị:**
   - **Đủ điều kiện tạo Pull Request và merge nhánh `feat/ocpp-meter-values` vào `main`.**
   - Sẵn sàng mở cổng cho Story tiếp theo trên đường găng: **S-20 (GYM-46 — Xử lý số đo lùi và trùng mốc)**.
