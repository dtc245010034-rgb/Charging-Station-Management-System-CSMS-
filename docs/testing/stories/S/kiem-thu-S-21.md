# Hồ sơ kiểm thử S-21 (GYM-47)

**Tính năng:** Phiên đang dở được khôi phục đúng khi trụ nối lại  
**Phạm vi:** T-44a (Token Bucket D7), T-44 (Dung hòa trạng thái hai chiều khi nối lại), T-45 (StopTransaction Fault-Tolerant), T-46 (Kịch bản kiểm thử tải đội trụ ảo)  
**Trạng thái:** ĐÃ HOÀN TẤT & ĐẠT TOÀN DIỆN (100% Pass)  
**Thời điểm kiểm thử thực tế:** 2026-10-09T13:45:00+07:00  

---

## 1. Tiêu chí kiểm thử và bằng chứng thực tế

| Mã ca | Kịch bản kiểm thử | Kết quả mong đợi | Bằng chứng kiểm thử thực tế | Trạng thái |
|---|---|---|---|:---:|
| **AC-01** | Trụ ngắt kết nối khi phiên đang sạc | Phiên giữ trạng thái `CHARGING`, không tự động đóng | `ocpp-presence-lifecycle.test.js`: `T-26: nối lại báo Charging tiếp tục phiên cũ` | **PASS** |
| **AC-02** | Trụ nối lại báo `Available` trên đầu nối có phiên mở | Giữ phiên `CHARGING`, bật `needs_review = true`, gắn cờ `CONNECTOR_AVAILABLE_WITH_OPEN_SESSION`, bắn SSE | `ocpp-presence-lifecycle.test.js`: `T-26: nối lại báo Available giữ phiên CHARGING nhưng bật needs_review` | **PASS** |
| **AC-03** | Trụ nối lại báo `Charging` | Phiên tiếp tục bình thường; `MeterValues` sau đó gắn đúng `transactionId` của phiên | `ocpp-presence-lifecycle.test.js`: `MeterValues khớp transactionId cũ` | **PASS** |
| **AC-04** | `StopTransaction` gửi muộn sau khi nối lại | Nhận theo `transactionId`, tính kWh, xả `transactionData` vào `meter_values` | `ocpp-stop-transaction-server.test.js`: `T-38/T-41: trụ nối lại chốt phiên ngoại tuyến theo timestamp và xả transactionData vào meter_values` | **PASS** |
| **AC-05** | Đội trụ ảo ngắt–nối mạng ngẫu nhiên 1–3 lần | Toàn bộ các phiên hoàn tất đều khớp số kWh và số mẫu điện năng | `tools/test-s21-reconnect-fleet.js`: `5/5 sessions matched in 1/1 runs` trên Docker server | **PASS** |
| **T-44a** | Token Bucket Rate Limiter (D7) | Bắn 400 tin burst liên tục không đóng; xả 2000 tin bị đóng với mã 1008 | `ws-connection-rate-limit.test.js`: 4/4 tests pass | **PASS** |
| **T-44-W** | Cảnh báo khi trụ báo `Charging` nhưng không có phiên mở | Ghi log cảnh báo `logWarning` để giám sát | `ocpp-status-notification.test.js`: `T-44: cảnh báo khi trụ gửi StatusNotification báo Charging nhưng không có phiên mở` | **PASS** |
| **T-45-FT** | Fault-Tolerant khi `transactionData` lỗi | Phiên sạc vẫn chốt `COMPLETED`, gắn cờ `INVALID_TRANSACTION_DATA` | `ocpp-stop-transaction.test.js`: `transactionData bị lỗi vẫn chốt phiên COMPLETED` | **PASS** |
| **SEC-01** | Trụ lạ gửi `StopTransaction` có `transactionData` | Không can thiệp phiên của trụ khác (D12) | `stop-transaction.js:95-102`: kiểm tra `charge_point_id = connection.chargePoint.id` | **PASS** |
| **SEC-02** | Giới hạn phần tử `transactionData` chống DoS | Áp trần mảng theo quy định S-19 (CWE-400) | `stop-transaction.js`: gọi qua `createMeterValuesHandler` -> `validatePayload` | **PASS** |

---

## 2. Kết quả chạy lệnh kiểm thử thực tế (Evidence-First)

### Lệnh 1: Toàn bộ Test Suite và Lint hệ thống
- **Lệnh thực thi:** `python test.py`
- **Kết quả:**
  - Unit Tests: **217 pass, 0 fail**
  - Integration Tests: **208 pass, 0 fail**
  - Acceptance Tests: **110 pass, 0 fail**
  - Lint: **PASS (0 lỗi, 0 cảnh báo)**
  - Tổng cộng: **535 PASS, 0 FAIL, 1 SKIP** (Thời gian chạy toàn bộ: ~270s).

### Lệnh 2: Kiểm thử Tải Đội trụ Thật qua Docker
- **Lệnh thực thi:**
  ```powershell
  $env:ADMIN_EMAIL="s21admin@csms.local"; $env:ADMIN_PASSWORD="AdminPassword12345!"; $env:STAGING_BASE_URL="http://127.0.0.1:3000"; $env:STAGING_DATABASE_URL="postgresql://csms:91253f1bc463143a4f5f9305559e98eb@127.0.0.1:5434/csms"; node tools/test-s21-reconnect-fleet.js --count 5 --disconnects 1-3 --runs 1 --prefix S21-FIX-
  ```
- **Kết quả:**
  ```text
  Run 1/1
  | Trụ         | Tx | Ngắt | Start Wh | Stop Wh | Simulator kWh | CSMS kWh | Mẫu | Kết quả |
  |-------------|----|------|----------|---------|---------------|----------|-----|---------|
  | S21-FIX-001 | 30 | 3    | 1100000  | 1108750 | 8.750         | 8.750    | 7   | PASS    |
  | S21-FIX-002 | 31 | 3    | 1110000  | 1118750 | 8.750         | 8.750    | 7   | PASS    |
  | S21-FIX-003 | 32 | 2    | 1120000  | 1126250 | 6.250         | 6.250    | 5   | PASS    |
  | S21-FIX-004 | 33 | 2    | 1130000  | 1136250 | 6.250         | 6.250    | 5   | PASS    |
  | S21-FIX-005 | 34 | 2    | 1140000  | 1146250 | 6.250         | 6.250    | 5   | PASS    |
  Run result: 5/5 sessions matched
  PASS: 5/5 sessions matched in 1/1 runs
  ```
