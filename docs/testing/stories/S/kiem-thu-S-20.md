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
| **FIX-07** | Rollback Migration 022 (`022_meter_values_dedup_phase.down.sql`) | Dọn dẹp bản ghi trùng pha trước khi tạo lại unique index, không crash DB | `022_meter_values_dedup_phase.down.sql`: xóa trùng trước `CREATE UNIQUE INDEX` | **PASS** |
| **DB-01** | Tối ưu hóa truy vấn `findLatestMeterValues` | Tạo Composite Index `idx_meter_values_stream_latest` trên `(session_id, measurand, phase, context, sampled_at DESC, id DESC)` | `022_meter_values_dedup_phase.sql`: Index Scan trực tiếp, không tốn chi phí Sort | **PASS** |
| **CLN-01** | Dọn dẹp định kỳ bảng `orphan_messages` | Tự động quét dọn bản ghi mồ côi theo `OCPP_MESSAGE_RETENTION_DAYS` mỗi 1 giờ | `backend/src/server.js`: `purgeOldMessages` tích hợp dọn `orphan_messages` | **PASS** |
