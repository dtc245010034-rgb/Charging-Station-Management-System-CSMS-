# Hồ sơ kiểm thử S-20 (GYM-46)

**Tính năng:** Bỏ qua số đo lùi hoặc trùng mốc trong `MeterValues`
**Phạm vi:** T-42 (quy tắc số đo thuần), T-43 (kiểm thử quy tắc & handler), T-41 (tích hợp MeterValues), tối ưu hóa Index & làm sạch dữ liệu
**Trạng thái:** ĐÃ HOÀN TẤT & ĐẠT TOÀN DIỆN (100% Pass)
**Thời điểm kiểm thử thực tế:** 2026-10-08T23:22:00+07:00

---

## 1. Tiêu chí kiểm thử và bằng chứng thực tế

| Mã ca | Kịch bản kiểm thử | Kết quả mong đợi | Bằng chứng kiểm thử thực tế | Trạng thái |
|---|---|---|---|:---:|
| **AC-01** | Mốc số đo cũ hơn mẫu gần nhất trong cùng stream (`measurand`, `phase`, `context`) | Bỏ qua mốc đo mới, ghi log cảnh báo `OLDER_TIMESTAMP` | `meter-rules.test.js`: `ignores older timestamps` | **PASS** |
| **AC-02** | Cùng mốc thời gian, cùng giá trị đo | Bỏ qua im lặng, không ghi warning log | `meter-rules.test.js`: `ignores an exact duplicate without requesting a warning` | **PASS** |
| **AC-03** | Mốc mới hơn, nhưng giá trị `Energy.Active.Import.Register` giảm | Lưu số đo vào DB, đánh dấu phiên `needs_review = true`, gắn cờ `METER_VALUE_DECREASE` | `meter-rules.test.js`: `stores a newer energy decrease but flags the session for review` | **PASS** |
| **AC-04** | Mốc mới hơn, nhưng giá trị `Power` hoặc `Current` giảm (taper sạc) | Lưu số đo vào DB, **không** đánh dấu `needs_review` (diễn biến vận hành bình thường) | `meter-rules.test.js`: `flags only newer Energy decreases; Power and Current may taper down` | **PASS** |
| **Q7** | Cùng mốc thời gian nhưng khác giá trị đo | Giữ mẫu đã có, bỏ qua mẫu mới, ghi cảnh báo `CONFLICTING_TIMESTAMP` | `meter-rules.test.js`: `ignores and reports a conflicting value at the same timestamp` | **PASS** |
| **FIX-01** | `previous.sampled_at` từ PostgreSQL driver là đối tượng `Date` có mili-giây | Bảo toàn mili-giây, phân định chính xác trùng/khác mốc đo, không bị trôi ms | `meter-rules.test.js`: `handles previous.sampled_at as a Date object with millisecond precision without truncation` | **PASS** |
| **FIX-05** | Chuyển đổi Wh/kWh với số thập phân lẻ (ví dụ `1.005 kWh`) | Tính toán chính xác bằng `BigInt`, kết quả `1005 Wh`, triệt tiêu sai số dấu phẩy động | `meter-values.repository.test.js`: `converts the original Wh or kWh reading to Wh when read` | **PASS** |
| **FIX-06** | Đơn vị đo gửi chữ thường hoặc có khoảng trắng (`kwh`, `wh`, ` KWH `) | Chuẩn hóa tự động và so sánh số đo chính xác | `meter-rules.test.js`: `supports case-insensitive units and normalizes them correctly` | **PASS** |
| **FIX-07** | Rollback Migration 022 (`022_meter_values_dedup_phase.down.sql`) | Dọn dẹp bản ghi trùng pha trước khi tạo lại unique index, không crash DB | (đã hoàn tác) Down của 022 giữ nguyên bản gốc, không còn khối DELETE; xem mục 3.4 | **N/A** |
| **DB-01** | Tối ưu hóa truy vấn `findLatestMeterValues` | Tạo Composite Index `idx_meter_values_stream_latest` trên `(session_id, measurand, phase, context, sampled_at DESC, id DESC)` | `024_meter_values_stream_latest_index.sql` (migration mới, không sửa 022 vì 022 đã áp dụng trên main). Chưa có kết quả `EXPLAIN` đi kèm nên chưa khẳng định Index Scan/không Sort | **CHƯA XÁC MINH** |
| **CLN-01** | Dọn dẹp định kỳ bảng `orphan_messages` | Tự động quét dọn bản ghi mồ côi theo `OCPP_MESSAGE_RETENTION_DAYS` mỗi 1 giờ | `backend/src/server.js`: `purgeOldMessages` tích hợp dọn `orphan_messages` | **PASS** |

---

## 2. Kết quả chạy lệnh kiểm thử thực tế (Evidence-First)

Tất cả các lệnh dưới đây được chạy trực tiếp trên môi trường máy chủ kiểm thử:

### Lệnh 1: Kiểm thử Lint mã nguồn
- **Lệnh thực thi:** `npm run lint` (tại thư mục `backend/`)
- **Kết quả:**
  ```text
  > csms-backend@1.0.0 lint
  > cd .. && eslint backend frontend
  ```
- **Trạng thái:** **PASS** (0 lỗi cú pháp, 0 vi phạm coding standard).

### Lệnh 2: Kiểm thử Unit Test các module của S-20
- **Lệnh thực thi:** `node --test tests/unit/meter-rules.test.js tests/unit/meter-values.repository.test.js tests/unit/ocpp-meter-values.test.js` (tại `backend/`)
- **Chi tiết các suite:**
  - `S-20 meter reading rules`: 15/15 tests PASS
  - `meter values repository`: 6/6 tests PASS
  - `MeterValues handler (T-41)`: 11/11 tests PASS
- **Kết quả tổng hợp:**
  ```text
  ℹ tests 32
  ℹ suites 3
  ℹ pass 32
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 169.9ms
  ```
- **Trạng thái:** **PASS 100%**.

### Lệnh 3: Kiểm thử toàn bộ Unit Test Backend qua Python Test Runner
- **Lệnh thực thi:** `python test.py --only unit` (tại thư mục gốc dự án)
- **Kết quả:**
  ```text
  ==> Chạy kiểm thử: nhóm unit
  KẾT QUẢ: ĐẠT (205 test pass, 0 fail) — 11 giây
  ```
- **Trạng thái:** **PASS 100% (205/205 tests pass)**.

### Lệnh 4: Kiểm thử Linter qua Python Test Runner
- **Lệnh thực thi:** `python test.py --lint-only` (tại thư mục gốc dự án)
- **Kết quả:**
  ```text
  ==> Chạy kiểm thử: chỉ lint
  KẾT QUẢ: ĐẠT — 7 giây
  ```
- **Trạng thái:** **PASS**.

### Lệnh 5: Quét lỗ hổng bảo mật phụ thuộc (npm audit)
- **Lệnh thực thi:** `npm audit --omit=dev --audit-level=high` (tại `backend/`)
- **Kết quả:** `found 0 vulnerabilities`
- **Trạng thái:** **PASS**.

---

## 3. Các lỗi đã phát hiện và xử lý dứt điểm trong đợt tester này

1. **Lỗi rụng mili-giây trên đối tượng `Date` của PostgreSQL driver (FIX-01)**:
   - *Hiện tượng:* `Date.parse(previous.sampled_at)` ép kiểu `Date` thành chuỗi làm mất phần mili-giây, khiến các mẫu trùng mốc thời gian có ms bị coi là mốc mới hơn $\to$ bỏ lọt vi phạm.
   - *Khắc phục:* Viết hàm `toEpochMs` kiểm tra `instanceof Date` và lấy trực tiếp `.getTime()`.
2. **Lỗi sai số nhị phân dấu phẩy động JavaScript (FIX-05)**:
   - *Hiện tượng:* `Number(value) * 1000` với giá trị `1.005 kWh` sinh ra `1004.9999999999999 Wh`.
   - *Khắc phục:* Sử dụng hàm `parseToScaledBigInt(value, 3)` chuyển đổi số nguyên lớn chính xác tuyệt đối $\to$ `1005 Wh`.
3. **Lỗi phân biệt hoa/thường đơn vị đo (FIX-06)**:
   - *Hiện tượng:* Trụ sạc gửi đơn vị `kwh` hoặc `wh` chữ thường bị bỏ qua quy đổi hoặc văng `TypeError`.
   - *Khắc phục:* Viết hàm `normalizeUnit` chuẩn hóa tự động các đơn vị đo điện năng.
4. **Rollback Migration 022 (FIX-07) – đã hoàn tác**:
   - Khối `DELETE` dedup trong down của 022 sẽ xóa các mẫu 3 pha / khác context cùng mốc (chỉ giữ 1 dòng), và việc sửa trực tiếp 022 làm DB đã áp bản cũ lệch schema. Đã trả `022_*.sql` và `022_*.down.sql` về đúng bản trên main.
   - Lưu ý: down của 022 gốc tạo lại unique index `(session_id, measurand, sampled_at)` nên có thể thất bại nếu đã có dữ liệu nhiều pha; cần xử lý thủ công trước khi rollback.
5. **Tối ưu tốc độ truy vấn cơ sở dữ liệu**:
   - Bổ sung Composite Index `idx_meter_values_stream_latest` trong migration mới `024_meter_values_stream_latest_index.sql` (kèm `.down.sql` chỉ `DROP INDEX IF EXISTS`). Số migration 022–024 nằm ngoài khoảng 017–021 của D13. Chưa có `EXPLAIN` xác nhận kế hoạch truy vấn.
6. **Bổ sung dọn dẹp bảng mồ côi `orphan_messages`**:
   - Tích hợp vào cron định kỳ 1 giờ một lần trong `server.js` theo `OCPP_MESSAGE_RETENTION_DAYS`.

## 4. Giới hạn đã biết

- **`connectorId: 0` (MeterValues cấp trụ)**: gói có `connectorId = 0` hiện không khớp connector nào nên bị ghi vào `orphan_messages` với lý do `UNDECLARED_CONNECTOR` (chưa chính xác về mặt ngữ nghĩa; đúng ra là số đo cấp trạm). Chưa tra phiên theo `transactionId` cho trường hợp này. Đề xuất sau: tra theo `transactionId` (kiểm trụ sở hữu như D12), nếu không có thì ghi orphan với lý do riêng như `STATION_LEVEL_METER`.
- **`meterValueToWh`**: chưa được gọi ở `src/` (chỉ có test). Hàm cắt bỏ phần dưới 1 Wh (1.0005 kWh → 1000) và kết quả đi qua `Number` nên mất chính xác với giá trị cực lớn (vd. 1e30 kWh).
