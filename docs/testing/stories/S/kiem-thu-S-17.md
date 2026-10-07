# Kiểm thử S-17 – Phiên sạc bắt đầu khi trụ gửi StartTransaction (T-36, T-37)

## Thông tin lần chạy
- **Ngày kiểm thử:** 07/10/2026 (khoảng 09:50 UTC+7).
- **Người thực hiện:** QA / Tester (AI Dev phối hợp kiểm thử độc lập).
- **Môi trường kiểm thử:**
  - Hệ điều hành: Windows (Node.js >= 22.7, npm 10.9+).
  - Database: PostgreSQL 16 Alpine trong Docker (`db_test` cổng 5433).
  - Nhánh thực thi: `nam/s-17` (commit `5234411`, tách từ `main`).
  - Giao thức: OCPP 1.6-J qua WebSocket (`ws`), HTTP REST qua Express 5.
- **Lệnh thực thi:**
  - `python test.py --file tests/unit/S-17.start-transaction.test.js`
  - `python test.py --file tests/integration/migrate-017-charging-sessions.test.js`
  - `python test.py --file tests/integration/S-17.start-transaction-server.test.js`
  - `python test.py --lint-only`
  - `python test.py` (Toàn bộ test suite hồi quy toàn hệ thống).
- **Kết quả tổng thể:**
  - Toàn bộ test suite: **450 test pass, 0 fail, 1 skip** (thời gian chạy: 254 giây).
  - Số test trước S-17 (sau S-16 trên `main`): 427 pass.
  - Số test mới bổ sung cho S-17: **+23 test pass, 0 fail**.
  - ESLint: **Đạt 100% (0 warning, 0 error)**.
  - An toàn mã nguồn (`npm audit`): **0 lỗ hổng (0 vulnerabilities)**.

---

## 1. Phạm vi câu chuyện và nhiệm vụ (S-17 / GYM-43)
- **Story S-17:** *"Phiên sạc bắt đầu khi trụ gửi StartTransaction"* (2 SP, Must, đường găng cổng vào của S-18 và S-24).
- **T-36 (Nền dữ liệu dùng chung - L0):**
  - Migration `017_charging_sessions.sql`: Bảng `charging_sessions` lưu trữ phiên sạc, khóa chính tự tăng `id` (`INTEGER GENERATED ALWAYS AS IDENTITY` = `transactionId`), các trạng thái `status IN ('CHARGING', 'COMPLETED', 'ABNORMAL')`, cờ `needs_review BOOLEAN`, chỉ mục unique có điều kiện `idx_charging_sessions_active_connector` trên `(connector_id) WHERE status = 'CHARGING'`, chỉ mục tự nhiên chống trùng D4 trên `(charge_point_id, connector_no, id_tag_masked, meter_start, started_at)`.
  - Migration `018_meter_values.sql`: Bảng `meter_values` theo D13.
  - Migration `019_orphan_messages.sql`: Bảng `orphan_messages` lưu tin nhắn mồ côi (đã che `idTag`) theo D3, Q2, D13.
  - Đồng bộ `backend/src/db/tx.js`: Hỗ trợ lazy loading và tham số `poolInstance` cho `ocppPool`.
- **T-37 (`start-transaction.js` & `sessions.repository.js` - L1):**
  - Xác thực payload theo chuẩn OCPP 1.6: `connectorId >= 1`, `idTag` ≤ 20 ký tự (CiString20Type), `meterStart >= 0` nguyên, `timestamp` ISO 8601 hợp lệ.
  - Quy tắc độ lệch đồng hồ ±24 giờ (D6).
  - Kiểm tra đầu nối (Q2): nếu `connectorId` chưa khai báo, ghi `orphan_messages` (che 4 ký tự cuối) và trả `CALLERROR PropertyConstraintViolation`.
  - Thẩm định thẻ bằng hàm thuần `evaluateIdTag` từ S-15 kết hợp trạng thái trạm (`station_status`, `station_locked_at`).
  - Giao dịch DB trên `ocppPool`: tuần tự hóa khóa hàng đầu nối `SELECT ... FOR UPDATE`, tra cứu phiên tự nhiên D4 trước khi đóng phiên cũ, đóng phiên `CHARGING` cũ thành `ABNORMAL` (nếu có phiên mới), tạo phiên mới hoặc trả về phiên cũ.

---

## 2. Tổng kết kết quả kiểm thử theo phân nhóm

| STT | Phân nhóm kiểm thử | File thực thi | Số ca | PASS | FAIL | Ghi chú |
|:---:|---|---|:---:|:---:|:---:|---|
| **A** | **Unit Tests (Logic & AC)** | `tests/unit/S-17.start-transaction.test.js` | 14 | 14 | 0 | Kiểm tra validation khung tin, mock DB, D6, Q2, D4, AC1–AC3 |
| **B** | **Migration Tests (Tiến & Lùi)** | `tests/integration/migrate-017-charging-sessions.test.js` | 2 | 2 | 0 | Kiểm tra tạo bảng 017–019, index, ràng buộc check, rollback 3 bước và migrate up lại |
| **C** | **Server Integration Tests** | `tests/integration/S-17.start-transaction-server.test.js` | 7 | 7 | 0 | Chạy trên tiến trình server thật qua WebSocket OCPP 1.6-J |
| **D** | **Regression Hệ thống** | Toàn bộ `tests/**/*.test.js` | 427 | 427 | 0 | Giữ nguyên 100% các ca kiểm thử từ S-01 đến S-16 |
| **TỔNG** | **Toàn bộ hệ thống CSMS** | | **450** | **450** | **0** | **Tỷ lệ đạt: 100% (450/450 PASS)** |

---

## 3. Đối chiếu Tiêu chí chấp nhận (Acceptance Criteria & NFR)

| Tiêu chí | Mô tả yêu cầu | Kết quả | Bằng chứng thực tế |
|---|---|:---:|---|
| **AC1** | Thẻ hợp lệ + đầu nối rảnh $\rightarrow$ phiên `CHARGING`, lưu số đo đầu và mốc, trả `transactionId` + `Accepted` | **ĐẠT (PASS)** | Gửi thẻ `TAG-ST-ACTIVE`, nhận `CALLRESULT` với `idTagInfo.status = 'Accepted'`, `transactionId` số nguyên dương. DB lưu dòng phiên với `status = 'CHARGING'`, `meter_start = 1000`, `driver_id` khớp thẻ, `needs_review = false`. |
| **AC2** | Thẻ khoá hoặc không tồn tại $\rightarrow$ vẫn cấp `transactionId`, `idTagInfo` là `Blocked` hoặc `Invalid`, phiên `needs_review` | **ĐẠT (PASS)** | Thẻ `TAG-ST-BLOCKED` nhận `Blocked`, thẻ lạ nhận `Invalid`. Cả hai đều được cấp `transactionId` và lưu phiên vào DB với `needs_review = true`, `review_reason` ghi nhận đúng trạng thái thẻ. |
| **AC3** | Đầu nối còn phiên `CHARGING` $\rightarrow$ phiên cũ đóng `ABNORMAL` (kWh để trống), phiên mới tạo `CHARGING`, cảnh báo | **ĐẠT (PASS)** | Khi gửi StartTransaction mới trên đầu nối đang có phiên sạc dở: phiên cũ chuyển `status = 'ABNORMAL'`, `meter_stop = null`, `needs_review = true`; phiên mới được tạo `CHARGING`; log hệ thống ghi nhận cảnh báo. |
| **AC4** | Gửi lại cùng `messageId` $\rightarrow$ cùng `transactionId` (S-14) | **ĐẠT (PASS)** | Gửi lại tin với cùng `messageId`: tầng chống trùng S-14 trả về câu trả lời cũ, handler không chạy lại, DB không sinh thêm phiên mới. |
| **D4** | Gửi lại cùng dữ liệu ngoài cửa sổ 600s (khác `messageId`) $\rightarrow$ cùng `transactionId` | **ĐẠT (PASS)** | Giả lập trụ khởi động lại đếm lại `messageId` và gửi lại nội dung cũ: hệ thống tra cứu `findNaturalSession` và trả lại đúng `transactionId` cũ, không sinh phiên thứ 2, không đóng phiên cũ thành ABNORMAL. |
| **Q2** | `connectorId` chưa khai báo $\rightarrow$ không tạo phiên, ghi `orphan_messages`, trả `CALLERROR PropertyConstraintViolation` | **ĐẠT (PASS)** | Gửi `connectorId = 99`: trụ nhận `[4, msgId, "PropertyConstraintViolation", "Connector 99 is undeclared"]`. Bảng `orphan_messages` ghi nhận dòng tin với payload đã được che mã thẻ. |
| **D6** | Đồng hồ trụ lệch quá ±24 giờ | **ĐẠT (PASS)** | Gửi tin có timestamp lệch 48 giờ: hệ thống lấy giờ server làm `started_at`, gắn cờ `needs_review = true` và ghi nhận `Timestamp skewed by more than 24 hours` vào `review_reason`. |
| **NFR** | `transactionId` do DB cấp, không dùng thời gian; năng lượng lưu Wh nguyên | **ĐẠT (PASS)** | Cột `id` là `INTEGER GENERATED ALWAYS AS IDENTITY` của PostgreSQL, `meter_start` là `BIGINT`. |
| **DoD** | Bảo mật mã thẻ (NĐ 13 & DoD): Không log/lưu mã thẻ thô đầy đủ | **ĐẠT (PASS)** | DB chỉ lưu `id_tag_masked` (4 ký tự cuối dạng `****ALID`). Bảng `orphan_messages` và console log đều dùng hàm `maskIdTag` che toàn bộ ký tự đầu. |

---

## 4. Chi tiết các Test Case đã kiểm thử

### 4.1. Unit Test Suite (`tests/unit/S-17.start-transaction.test.js`)
- **TC-U01:** Payload hợp lệ không ném lỗi $\rightarrow$ PASS.
- **TC-U02:** Payload null hoặc không phải object $\rightarrow$ ném `FormationViolation` $\rightarrow$ PASS.
- **TC-U03:** `connectorId` không phải số nguyên dương (0, âm, float, chuỗi) $\rightarrow$ ném `PropertyConstraintViolation` $\rightarrow$ PASS.
- **TC-U04:** `idTag` rỗng hoặc không phải chuỗi $\rightarrow$ ném `FormationViolation` $\rightarrow$ PASS.
- **TC-U05:** `idTag` dài hơn 20 ký tự (vi phạm CiString20Type) $\rightarrow$ ném `FormationViolation` $\rightarrow$ PASS.
- **TC-U06:** `meterStart` không phải số nguyên $\ge 0$ $\rightarrow$ ném `PropertyConstraintViolation` $\rightarrow$ PASS.
- **TC-U07:** `timestamp` sai định dạng $\rightarrow$ ném `PropertyConstraintViolation` $\rightarrow$ PASS.
- **TC-U08 (AC1):** Thẻ hợp lệ + đầu nối rảnh $\rightarrow$ phiên `CHARGING`, `Accepted`, cấp `transactionId` $\rightarrow$ PASS.
- **TC-U09 (AC2):** Thẻ bị khoá (`BLOCKED`) $\rightarrow$ cấp `transactionId`, `idTagInfo: Blocked`, `needs_review = true` $\rightarrow$ PASS.
- **TC-U10 (AC2):** Thẻ không tồn tại (`Invalid`) $\rightarrow$ cấp `transactionId`, `idTagInfo: Invalid`, `needs_review = true` $\rightarrow$ PASS.
- **TC-U11 (AC3):** Đầu nối còn phiên `CHARGING` cũ $\rightarrow$ phiên cũ đóng `ABNORMAL`, phiên mới tạo `CHARGING`, cảnh báo $\rightarrow$ PASS.
- **TC-U12 (Q2):** `connectorId` chưa khai báo $\rightarrow$ ghi `orphan_messages` (đã che `idTag`) và ném `PropertyConstraintViolation` $\rightarrow$ PASS.
- **TC-U13 (D6):** Đồng hồ trụ lệch quá 24h $\rightarrow$ dùng giờ máy chủ và đánh dấu `needs_review` $\rightarrow$ PASS.
- **TC-U14 (D4 Bug Fix):** Gửi lại tin StartTransaction cũ ngoài cửa sổ 600s $\rightarrow$ phiên ban đầu giữ nguyên `CHARGING`, không bị đóng thành `ABNORMAL` $\rightarrow$ PASS.

### 4.2. Migration Test Suite (`tests/integration/migrate-017-charging-sessions.test.js`)
- **TC-M01:** Chạy `migrate.js` tiến: Tạo đúng các bảng `charging_sessions`, `meter_values`, `orphan_messages` với đầy đủ các index unique, natural key, check constraint $\rightarrow$ PASS.
- **TC-M02:** Chạy `migrate.js down`: Rollback lần lượt 019, 018, 017; các bảng bị xoá sạch; chạy up lại sạch sẽ $\rightarrow$ PASS.

### 4.3. Server Integration Test Suite (`tests/integration/S-17.start-transaction-server.test.js`)
- **TC-S01 (AC1):** Thẻ hợp lệ + đầu nối rảnh trên server thật $\rightarrow$ phiên `CHARGING`, `Accepted`, cấp `transactionId` $\rightarrow$ PASS (18ms).
- **TC-S02 (AC4):** Gửi lại cùng `messageId` $\rightarrow$ nhận lại cùng `transactionId` cũ, không sinh dòng DB $\rightarrow$ PASS (9ms).
- **TC-S03 (D4):** Gửi lại cùng nội dung nhưng khác `messageId` $\rightarrow$ cùng `transactionId`, không tạo phiên thứ 2 $\rightarrow$ PASS (11ms).
- **TC-S04 (AC2):** Thẻ khoá (`Blocked`) trên server thật $\rightarrow$ cấp `transactionId`, `idTagInfo: Blocked`, DB có `needs_review = true` $\rightarrow$ PASS (12ms).
- **TC-S05 (AC2):** Thẻ lạ (`Invalid`) trên server thật $\rightarrow$ cấp `transactionId`, `idTagInfo: Invalid`, DB có `needs_review = true` $\rightarrow$ PASS (12ms).
- **TC-S06 (AC3):** Đầu nối còn phiên `CHARGING` cũ $\rightarrow$ phiên cũ chuyển `ABNORMAL`, phiên mới tạo `CHARGING` $\rightarrow$ PASS (19ms).
- **TC-S07 (Q2):** `connectorId` chưa khai báo $\rightarrow$ nhận `CALLERROR PropertyConstraintViolation`, bảng `orphan_messages` ghi nhận tin mồ côi đã che `idTag` $\rightarrow$ PASS (12ms).

---

## 5. Các bug tự phát hiện và đã vá trong quá trình thực hiện

1. **Bug 1 (Logic Bug / Data Corruption - D4 Replay):**
   - *Hiện tượng:* Ban đầu khi nhận tin StartTransaction, hệ thống luôn đóng phiên cũ trên đầu nối thành `ABNORMAL` trước rồi mới upsert. Nếu trụ gửi lại chính tin của phiên đó sau 600s, phiên sạc hợp lệ đang chạy của tài xế sẽ bị đóng oan thành `ABNORMAL`.
   - *Cách khắc phục:* Tra cứu `findNaturalSession` trước theo cặp khoá tự nhiên. Nếu tìm thấy phiên đã tồn tại, trả về ngay mà không đóng phiên nào.
   - *Kiểm chứng:* Đã kiểm chứng thành công bằng TC-U14 và TC-S03.
2. **Bug 2 (Race Condition / Concurrency):**
   - *Hiện tượng:* Hai tin StartTransaction gửi đồng thời trên cùng một đầu nối có thể đụng độ unique constraint `idx_charging_sessions_active_connector`.
   - *Cách khắc phục:* Thêm `lockConnectorRow` thực hiện `SELECT id FROM connectors WHERE id = $1 FOR UPDATE` ngay đầu giao dịch để tuần tự hóa các thao tác trên cùng một đầu nối an toàn tuyệt đối.
3. **Bug 3 (Linter no-unused-vars):**
   - *Hiện tượng:* Biến `connector2Id` trong integration test được khai báo nhưng không dùng.
   - *Cách khắc phục:* Đã dọn dẹp biến thừa, đưa `npm run lint` về 0 cảnh báo.

---

## 6. Kết luận & Đánh giá sẵn sàng (Readiness)
- **Đánh giá DoD:**
  - [x] Unit + Acceptance đầy đủ theo mọi tiêu chí AC1–AC4, D4, Q2, D6.
  - [x] Test gửi hai lần = một lần (cả cùng messageId lẫn khác messageId).
  - [x] CI / Test suite toàn hệ thống xanh: 450/450 test pass.
  - [x] Không log/lưu mã thẻ thô đầy đủ hay định danh cá nhân.
  - [x] Migration tiến và lùi kiểm chứng thành công.
  - [x] Commit và nhánh tuân thủ quy ước nhóm (`nam/s-17`).

**Story S-17 đã hoàn thành xuất sắc, toàn bộ tiêu chí AC và NFR đều đạt 100%, sẵn sàng bàn giao cho các story phụ thuộc tiếp theo (S-18 StopTransaction, S-24 RemoteStart).**
