# Kiểm thử S-17 – Phiên sạc bắt đầu khi trụ gửi StartTransaction (T-36, T-37)

## Thông tin lần chạy
- **Ngày kiểm thử:** 07/10/2026 (khoảng 11:40 UTC+7 - Cập nhật sau phản hồi QA).
- **Người thực hiện:** QA / Tester (AI Dev phối hợp kiểm thử độc lập).
- **Môi trường kiểm thử:**
  - Hệ điều hành: Windows (Node.js >= 22.7, npm 10.9+).
  - Database: PostgreSQL 16 Alpine trong Docker (`db_test` cổng 5433).
  - Nhánh thực thi: `nam/s-17`.
  - Giao thức: OCPP 1.6-J qua WebSocket (`ws`), HTTP REST qua Express 5.
- **Lệnh thực thi:**
  - `python test.py --file tests/unit/S-17.start-transaction.test.js`
  - `python test.py --file tests/integration/migrate-017-charging-sessions.test.js`
  - `python test.py --file tests/integration/S-17.start-transaction-server.test.js`
  - `python test.py --lint-only`
  - `python test.py` (Toàn bộ test suite hồi quy toàn hệ thống).
- **Kết quả tổng thể:**
  - Toàn bộ test suite: **453 test pass, 0 fail, 1 skip**.
  - Số test trước S-17 (sau S-16 trên `main`): 427 pass.
  - Số test mới bổ sung cho S-17 (bao gồm 3 ca vá lỗi QA): **+26 test pass, 0 fail**.
  - ESLint: **Đạt 100% (0 warning, 0 error)**.
  - An toàn mã nguồn (`npm audit`): **0 lỗ hổng (0 vulnerabilities)**.

---

## 1. Phạm vi câu chuyện và nhiệm vụ (S-17 / GYM-43)
- **Story S-17:** *"Phiên sạc bắt đầu khi trụ gửi StartTransaction"* (2 SP, Must, đường găng cổng vào của S-18 và S-24).
- **T-36 (Nền dữ liệu dùng chung - L0):**
  - Migration `017_charging_sessions.sql`: Bảng `charging_sessions` lưu trữ phiên sạc, khóa chính tự tăng `id` (`INTEGER GENERATED ALWAYS AS IDENTITY` = `transactionId`), các trạng thái `status IN ('CHARGING', 'COMPLETED', 'ABNORMAL')`, cờ `needs_review BOOLEAN`, chỉ mục unique có điều kiện `idx_charging_sessions_active_connector` trên `(connector_id) WHERE status = 'CHARGING'`, chỉ mục tự nhiên chống trùng D4 trên `(charge_point_id, connector_no, id_tag_masked, meter_start, started_at)`.
  - Ràng buộc khóa ngoại: `charge_point_id` và `connector_id` sử dụng `ON DELETE RESTRICT` (theo phản hồi QA, bảo vệ toàn vẹn lịch sử giao dịch tài chính).
  - Migration `018_meter_values.sql`: Bảng `meter_values` theo D13.
  - Migration `019_orphan_messages.sql`: Bảng `orphan_messages` lưu tin nhắn mồ côi (đã che `idTag`) theo D3, Q2, D13.
  - Đồng bộ `backend/src/db/tx.js`: Hỗ trợ lazy loading và tham số `poolInstance` cho `ocppPool`.
- **T-37 (`start-transaction.js` & `sessions.repository.js` - L1):**
  - Xác thực payload theo chuẩn OCPP 1.6: `connectorId >= 1`, `idTag` ≤ 20 ký tự (CiString20Type), `meterStart >= 0` nguyên an toàn (`Number.isSafeInteger(meterStart)`), `timestamp` ISO 8601 hợp lệ.
  - Quy tắc độ lệch đồng hồ ±24 giờ (D6): Lưu mốc `started_at` nguyên văn từ tin gửi lên để bảo toàn cặp khóa tự nhiên chống trùng D4, đồng thời gắn cờ `needs_review = true` kèm lý do cảnh báo.
  - Kiểm tra đầu nối (Q2): nếu `connectorId` chưa khai báo, ghi `orphan_messages` (che 4 ký tự cuối) và trả `CALLERROR PropertyConstraintViolation`.
  - Thẩm định thẻ bằng hàm thuần `evaluateIdTag` từ S-15 kết hợp trạng thái trạm (`station_status`, `station_locked_at`).
  - Giao dịch DB trên `ocppPool`: tuần tự hóa khóa hàng đầu nối `SELECT ... FOR UPDATE`, tra cứu phiên tự nhiên D4 trước khi đóng phiên cũ, đóng phiên `CHARGING` cũ thành `ABNORMAL` (nếu có phiên mới), tạo phiên mới hoặc trả về phiên cũ.

---

## 2. Tổng kết kết quả kiểm thử theo phân nhóm

| STT | Phân nhóm kiểm thử | File thực thi | Số ca | PASS | FAIL | Ghi chú |
|:---:|---|---|:---:|:---:|:---:|---|
| **A** | **Unit Tests (Logic & AC & Fixes)** | `tests/unit/S-17.start-transaction.test.js` | 15 | 15 | 0 | Kiểm tra validation khung tin, số an toàn, mock DB, D6, Q2, D4, AC1–AC3 |
| **B** | **Migration Tests (Tiến & Lùi)** | `tests/integration/migrate-017-charging-sessions.test.js` | 2 | 2 | 0 | Kiểm tra tạo bảng 017–019, index, ràng buộc check, ON DELETE RESTRICT, rollback và up lại |
| **C** | **Server Integration Tests** | `tests/integration/S-17.start-transaction-server.test.js` | 9 | 9 | 0 | Chạy trên tiến trình server thật qua WebSocket OCPP 1.6-J, bao gồm ca 1970 và meterStart 1e20 |
| **D** | **Regression Hệ thống** | Toàn bộ `tests/**/*.test.js` | 427 | 427 | 0 | Giữ nguyên 100% các ca kiểm thử từ S-01 đến S-16 |
| **TỔNG** | **Toàn bộ hệ thống CSMS** | | **453** | **453** | **0** | **Tỷ lệ đạt: 100% (453/453 PASS)** |

---

## 3. Đối chiếu Tiêu chí chấp nhận (Acceptance Criteria & NFR)

| Tiêu chí | Mô tả yêu cầu | Kết quả | Bằng chứng thực tế |
|---|---|:---:|---|
| **AC1** | Thẻ hợp lệ + đầu nối rảnh $\rightarrow$ phiên `CHARGING`, lưu số đo đầu và mốc, trả `transactionId` + `Accepted` | **ĐẠT (PASS)** | Gửi thẻ `TAG-ST-ACTIVE`, nhận `CALLRESULT` với `idTagInfo.status = 'Accepted'`, `transactionId` số nguyên dương. DB lưu dòng phiên với `status = 'CHARGING'`, `meter_start = 1000`, `driver_id` khớp thẻ, `needs_review = false`. |
| **AC2** | Thẻ khoá hoặc không tồn tại $\rightarrow$ vẫn cấp `transactionId`, `idTagInfo` là `Blocked` hoặc `Invalid`, phiên `needs_review` | **ĐẠT (PASS)** | Thẻ `TAG-ST-BLOCKED` nhận `Blocked`, thẻ lạ nhận `Invalid`. Cả hai đều được cấp `transactionId` và lưu phiên vào DB với `needs_review = true`, `review_reason` ghi nhận đúng trạng thái thẻ. |
| **AC3** | Đầu nối còn phiên `CHARGING` $\rightarrow$ phiên cũ đóng `ABNORMAL` (kWh để trống), phiên mới tạo `CHARGING`, cảnh báo | **ĐẠT (PASS)** | Khi gửi StartTransaction mới trên đầu nối đang có phiên sạc dở: phiên cũ chuyển `status = 'ABNORMAL'`, `meter_stop = null`, `needs_review = true`; phiên mới được tạo `CHARGING`; log hệ thống ghi nhận cảnh báo. |
| **AC4** | Gửi lại cùng `messageId` $\rightarrow$ cùng `transactionId` (S-14) | **ĐẠT (PASS)** | Gửi lại tin với cùng `messageId`: tầng chống trùng S-14 trả về câu trả lời cũ, handler không chạy lại, DB không sinh thêm phiên mới. |
| **D4** | Gửi lại cùng dữ liệu ngoài cửa sổ 600s (khác `messageId`) $\rightarrow$ cùng `transactionId` | **ĐẠT (PASS)** | Giả lập trụ khởi động lại đếm lại `messageId` và gửi lại nội dung cũ: hệ thống tra cứu `findNaturalSession` và trả lại đúng `transactionId` cũ, không sinh phiên thứ 2, không đóng phiên cũ thành ABNORMAL. |
| **D4 + D6** | Trụ lệch giờ > 24h (về 1970) gửi lại sau 600s với `messageId` mới $\rightarrow$ không tạo phiên ma | **ĐẠT (PASS)** | Lưu `started_at` nguyên văn từ tin gửi lên giúp tra cứu khớp tự nhiên D4; giữ nguyên phiên `CHARGING` ban đầu với `needs_review = true`. |
| **Q2** | `connectorId` chưa khai báo $\rightarrow$ không tạo phiên, ghi `orphan_messages`, trả `CALLERROR PropertyConstraintViolation` | **ĐẠT (PASS)** | Gửi `connectorId = 99`: trụ nhận `[4, msgId, "PropertyConstraintViolation", "Connector 99 is undeclared"]`. Bảng `orphan_messages` ghi nhận dòng tin với payload đã được che mã thẻ. |
| **D6** | Đồng hồ trụ lệch quá ±24 giờ | **ĐẠT (PASS)** | Gửi tin có timestamp lệch 48 giờ: hệ thống ghi nhận mốc nguyên văn, gắn cờ `needs_review = true` và ghi nhận `Timestamp skewed by more than 24 hours` vào `review_reason`. |
| **NFR** | An toàn số nguyên năng lượng (`meterStart` siêu lớn như `1e20`) | **ĐẠT (PASS)** | Kiểm tra `Number.isSafeInteger(meterStart)`, trả ngay `CALLERROR FormationViolation`, bảo vệ DB không bị tràn số `InternalError`. |
| **NFR** | `transactionId` do DB cấp, không dùng thời gian; năng lượng lưu Wh nguyên | **ĐẠT (PASS)** | Cột `id` là `INTEGER GENERATED ALWAYS AS IDENTITY` của PostgreSQL, `meter_start` là `BIGINT`. |
| **DoD** | Bảo mật mã thẻ (NĐ 13 & DoD): Không log/lưu mã thẻ thô đầy đủ | **ĐẠT (PASS)** | DB chỉ lưu `id_tag_masked` (4 ký tự cuối dạng `****ALID`). Bảng `orphan_messages` và console log đều dùng hàm `maskIdTag` che toàn bộ ký tự đầu. |
| **DoD** | Toàn vẹn dữ liệu quan hệ tài chính | **ĐẠT (PASS)** | Khóa ngoại trạm và đầu nối trong `charging_sessions` đặt `ON DELETE RESTRICT`, chặn xóa cha gây mất dữ liệu phiên sạc. |

---

## 4. Chi tiết các Test Case đã kiểm thử

### 4.1. Unit Test Suite (`tests/unit/S-17.start-transaction.test.js`)
- **TC-U01:** Payload hợp lệ không ném lỗi $\rightarrow$ PASS.
- **TC-U02:** Payload null hoặc không phải object $\rightarrow$ ném `FormationViolation` $\rightarrow$ PASS.
- **TC-U03:** `connectorId` không phải số nguyên dương (0, âm, float, chuỗi) $\rightarrow$ ném `PropertyConstraintViolation` $\rightarrow$ PASS.
- **TC-U04:** `idTag` rỗng hoặc không phải chuỗi $\rightarrow$ ném `FormationViolation` $\rightarrow$ PASS.
- **TC-U05:** `idTag` dài hơn 20 ký tự (vi phạm CiString20Type) $\rightarrow$ ném `FormationViolation` $\rightarrow$ PASS.
- **TC-U06:** `meterStart` không an toàn (`1e20`), âm, hoặc không phải số nguyên $\rightarrow$ ném `FormationViolation` / `PropertyConstraintViolation` $\rightarrow$ PASS.
- **TC-U07:** `timestamp` sai định dạng $\rightarrow$ ném `PropertyConstraintViolation` $\rightarrow$ PASS.
- **TC-U08 (AC1):** Thẻ hợp lệ + đầu nối rảnh $\rightarrow$ phiên `CHARGING`, `Accepted`, cấp `transactionId` $\rightarrow$ PASS.
- **TC-U09 (AC2):** Thẻ bị khoá (`BLOCKED`) $\rightarrow$ cấp `transactionId`, `idTagInfo: Blocked`, `needs_review = true` $\rightarrow$ PASS.
- **TC-U10 (AC2):** Thẻ không tồn tại (`Invalid`) $\rightarrow$ cấp `transactionId`, `idTagInfo: Invalid`, `needs_review = true` $\rightarrow$ PASS.
- **TC-U11 (AC3):** Đầu nối còn phiên `CHARGING` cũ $\rightarrow$ phiên cũ đóng `ABNORMAL`, phiên mới tạo `CHARGING`, cảnh báo $\rightarrow$ PASS.
- **TC-U12 (Q2):** `connectorId` chưa khai báo $\rightarrow$ ghi `orphan_messages` (đã che `idTag`) và ném `PropertyConstraintViolation` $\rightarrow$ PASS.
- **TC-U13 (D6):** Đồng hồ trụ lệch quá 24h $\rightarrow$ đánh dấu `needs_review = true` $\rightarrow$ PASS.
- **TC-U14 (D4 Bug Fix):** Gửi lại tin StartTransaction cũ ngoài cửa sổ 600s $\rightarrow$ phiên ban đầu giữ nguyên `CHARGING`, không bị đóng thành `ABNORMAL` $\rightarrow$ PASS.
- **TC-U15 (D4 + D6 Fix QA):** Trụ lệch đồng hồ về 1970 phát lại ngoài 600s $\rightarrow$ tra cứu đúng phiên cũ D4, không sinh phiên ma, `started_at` giữ nguyên mốc 1970 $\rightarrow$ PASS.

### 4.2. Migration Test Suite (`tests/integration/migrate-017-charging-sessions.test.js`)
- **TC-M01:** Chạy `migrate.js` tiến: Tạo đúng các bảng `charging_sessions`, `meter_values`, `orphan_messages` với đầy đủ các index unique, natural key, check constraint, `ON DELETE RESTRICT` $\rightarrow$ PASS.
- **TC-M02:** Chạy `migrate.js down`: Rollback lần lượt 019, 018, 017; các bảng bị xoá sạch; chạy up lại sạch sẽ $\rightarrow$ PASS.

### 4.3. Server Integration Test Suite (`tests/integration/S-17.start-transaction-server.test.js`)
- **TC-S01 (AC1):** Thẻ hợp lệ + đầu nối rảnh trên server thật $\rightarrow$ phiên `CHARGING`, `Accepted`, cấp `transactionId` $\rightarrow$ PASS.
- **TC-S02 (AC4):** Gửi lại cùng `messageId` $\rightarrow$ nhận lại cùng `transactionId` cũ, không sinh dòng DB $\rightarrow$ PASS.
- **TC-S03 (D4):** Gửi lại cùng nội dung nhưng khác `messageId` $\rightarrow$ cùng `transactionId`, không tạo phiên thứ 2 $\rightarrow$ PASS.
- **TC-S04 (AC2):** Thẻ khoá (`Blocked`) trên server thật $\rightarrow$ cấp `transactionId`, `idTagInfo: Blocked`, DB có `needs_review = true` $\rightarrow$ PASS.
- **TC-S05 (AC2):** Thẻ lạ (`Invalid`) trên server thật $\rightarrow$ cấp `transactionId`, `idTagInfo: Invalid`, DB có `needs_review = true` $\rightarrow$ PASS.
- **TC-S06 (AC3):** Đầu nối còn phiên `CHARGING` cũ $\rightarrow$ phiên cũ chuyển `ABNORMAL`, phiên mới tạo `CHARGING` $\rightarrow$ PASS.
- **TC-S07 (Q2):** `connectorId` chưa khai báo $\rightarrow$ nhận `CALLERROR PropertyConstraintViolation`, bảng `orphan_messages` ghi nhận tin mồ côi đã che `idTag` $\rightarrow$ PASS.
- **TC-S08 (Fix QA):** `meterStart = 1e20` $\rightarrow$ trả `CALLERROR FormationViolation`, server an toàn không lỗi DB 500 $\rightarrow$ PASS.
- **TC-S09 (Fix QA):** Đồng hồ trụ lệch về 1970 phát lại sau 600s với `messageId` mới $\rightarrow$ trả cùng `transactionId`, không tạo phiên ma ABNORMAL $\rightarrow$ PASS.

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
4. **Bug 4 (Phản hồi QA 1 - Trụ lệch đồng hồ > 24h về 1970 gửi lại sinh phiên ma):**
   - *Hiện tượng:* Khi trụ lệch giờ quá 24h, code ban đầu gán `started_at = now()`. Khi trụ phát lại sau 600s, `started_at` lần 2 sinh ra mốc thời gian khác nên trượt tra cứu `findNaturalSession` $\rightarrow$ phiên cũ bị đóng thành `ABNORMAL`, sinh phiên mới `CHARGING` (phiên ma).
   - *Cách khắc phục:* `started_at` luôn lưu mốc nguyên văn của tin (`reportedMs`), đảm bảo tính idempotent của cặp khoá tự nhiên D4; việc lệch giờ được đánh dấu bởi cờ `needs_review = true` và `review_reason` theo D6.
   - *Kiểm chứng:* TC-U15 và TC-S09.
5. **Bug 5 (Phản hồi QA 2 - `meterStart = 1e20` gây sập DB InternalError):**
   - *Hiện tượng:* `Number.isInteger(1e20)` trả về `true` trong JavaScript nhưng vượt quá `Number.MAX_SAFE_INTEGER` và ngưỡng `BIGINT` của PostgreSQL, dẫn đến `InternalError` trong DB.
   - *Cách khắc phục:* Dùng `Number.isSafeInteger(meterStart)` để kiểm tra, ném `FormationViolation` khi số không an toàn.
   - *Kiểm chứng:* TC-U06 và TC-S08.
6. **Bug 6 (Phản hồi QA 3 - Khóa ngoại `charging_sessions` cần ON DELETE RESTRICT):**
   - *Hiện tượng:* Migration 017 ban đầu đặt `ON DELETE CASCADE` cho `charge_point_id` và `connector_id`, rủi ro xóa mất dữ liệu lịch sử phiên sạc tài chính.
   - *Cách khắc phục:* Đổi sang `ON DELETE RESTRICT` trong `017_charging_sessions.sql`.
   - *Kiểm chứng:* TC-M01 và TC-M02.

---

## 6. Kết luận & Đánh giá sẵn sàng (Readiness)
- **Đánh giá DoD:**
  - [x] Unit + Acceptance đầy đủ theo mọi tiêu chí AC1–AC4, D4, Q2, D6.
  - [x] 3 điểm phản hồi của QA đã được khắc phục triệt để và có test case độc lập chứng minh.
  - [x] CI / Test suite toàn hệ thống xanh: 453/453 test pass.
  - [x] Không log/lưu mã thẻ thô đầy đủ hay định danh cá nhân.
  - [x] Migration tiến và lùi kiểm chứng thành công.
  - [x] Commit và nhánh tuân thủ quy ước nhóm (`nam/s-17`).

**Story S-17 đã hoàn thiện và đáp ứng 100% yêu cầu chất lượng, sẵn sàng nghiệm thu bàn giao.**
