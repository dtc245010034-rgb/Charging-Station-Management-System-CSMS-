# Báo Cáo & Đặc Tả Kiểm Thử S-10: Cập Nhật Trạng Thái Từng Đầu Nối Qua StatusNotification (T-20, T-21, T-22)

> **Dự án:** Nền tảng quản lý trạm sạc xe điện (CSMS)  
> **Story ID:** S-10 (Jira: GYM-36)  
> **Người thực hiện:** QA Specialist / Independent AI Tester  
> **Chuẩn quy trình:** [`docs/testing/TESTER_STANDARD.md`](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS-/docs/testing/TESTER_STANDARD.md)  
> **Đường dẫn báo cáo:** `docs/testing/stories/S/kiem_thu-S10.md`  
> **Script kiểm chứng tự động (Repo-Native):** [`tools/verify-s10-live.js`](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS-/tools/verify-s10-live.js)

---

## 1. Thông Tin Lần Chạy & Môi Trường Kiểm Thử (Execution Metadata)

- **Ngày chạy kiểm thử:** 2026-10-03 (Thời gian: 16:56 UTC+7)
- **Commit SHA:** `ec49cea` (nhánh `nam/docs-kiem-thu-s09-s10-s11`)
- **Môi trường thực thi:**
  - Hệ điều hành: Windows 11 (WSL2 / Docker Desktop 4.92.0)
  - Runtime Node.js: v22.23.3 (Container `csms_app:latest`) / Host v24.19.0
  - Cơ sở dữ liệu: PostgreSQL 16 Alpine (`charging-station-management-system-csms--db-1`)
  - Giao thức: WebSocket OCPP 1.6J (`ws://127.0.0.1:3000/ocpp/<CP_CODE>`)
- **Phân loại kiểm thử:** Kiểm thử đơn vị (Unit Test) + Kiểm thử tích hợp Runtime trên Container sống (Live Integration Test).
- **Mã nguồn liên quan:**
  - `backend/src/modules/ocpp/handlers/status-notification.js`: Handler xử lý action `StatusNotification`.
  - `backend/src/modules/connectors/status-mapping.js`: Ánh xạ 9 trạng thái chuẩn OCPP sang 4 trạng thái hệ thống.
  - `backend/migrations/010_connector_ocpp_status.sql`: Thêm cột `ocpp_status` vào bảng `connectors`.
  - `backend/migrations/011_connector_errors.sql`: Tạo bảng lịch sử lỗi `connector_errors`.
  - `backend/tests/unit/ocpp-status-notification.test.js`: Bộ unit test chuẩn của handler.

---

## 2. Bảng Tổng Kết Kết Quả Kiểm Thử (Summary)

| Phân nhóm kiểm thử | Loại kiểm thử | Tổng số ca | PASS | FAIL | BLOCKED | Tỷ lệ Đạt |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Giai đoạn A – Nền tảng (Smoke & Pre-requisites)** | Automated / Live | 4 | 4 | 0 | 0 | 100% |
| **Giai đoạn B – Nghiệp vụ T-20 & T-21 (Mapping & Error Log)** | Live Runtime | 6 | 6 | 0 | 0 | 100% |
| **Giai đoạn C – T-22 Biên & Validation (Edge & Constaints)** | Live Runtime | 5 | 5 | 0 | 0 | 100% |
| **Giai đoạn D – Bộ Test Hồi Quy Tự Động (CI Suite)** | CI Automated | 3 | 3 | 0 | 0 | 100% |
| **TỔNG CỘNG** | | **18** | **18** | **0** | **0** | **100%** |

---

## 3. Ma Trận Truy Vết Tiêu Chí Chấp Nhận & Bằng Chứng Thực Tế (AC Traceability)

| Tiêu chí chấp nhận (AC) | Mô tả yêu cầu | Ca test chứng minh | Bằng chứng thực tế xác thực (Raw Evidence) | Đánh giá |
|---|---|:---:|---|:---:|
| **AC-1: Ánh xạ chuẩn 9 trạng thái OCPP sang 4 trạng thái nội bộ** | Phân loại chính xác sang `AVAILABLE`, `OCCUPIED`, `RESERVED`, `ERROR`. | TC-S10-B01 | Kiểm tra CSDL 9/9 trạng thái:<br>Available $\rightarrow$ `AVAILABLE`<br>Preparing, Charging, SuspendedEV, SuspendedEVSE, Finishing $\rightarrow$ `OCCUPIED`<br>Reserved $\rightarrow$ `RESERVED`<br>Unavailable, Faulted $\rightarrow$ `ERROR`. | **PASS** |
| **AC-2: Lưu nguyên trạng chuỗi OCPP gốc** | Cột `connectors.ocpp_status` bảo toàn nguyên văn chuỗi mà trụ sạc gửi lên. | TC-S10-B02 | SQL Query: `SELECT ocpp_status FROM connectors WHERE id=1;`<br>Kết quả: `'Faulted'` (nguyên vẹn). | **PASS** |
| **AC-3: Trạng thái lạ/Vendor-specific xử lý an toàn** | Trạng thái tuỳ biến của hãng không làm sập luồng, map an toàn về `ERROR`. | TC-S10-B03 | Gửi `status: "CustomOEMState"` $\rightarrow$ CSDL lưu: `status = 'ERROR'`, `ocpp_status = 'CustomOEMState'`, server trả `CALLRESULT` rỗng `{}`. | **PASS** |
| **AC-4: Ghi nhận sự cố vào `connector_errors`** | Khi `errorCode != 'NoError'`, thêm bản ghi lưu `error_code`, `vendor_error_code`, `occurred_at`. | TC-S10-B04 | CSDL tăng từ 0 lên 1 bản ghi lỗi:<br>`error_code = 'GroundFailure'`<br>`vendor_error_code = 'OEM_GROUND_ERR_505'`<br>`occurred_at = '2026-10-03T07:15:30.000Z'`. | **PASS** |
| **AC-5: Khôi phục trạng thái không xoá lịch sử lỗi** | Báo `NoError` chuyển về `AVAILABLE` nhưng **không được xoá** dòng cũ trong `connector_errors`. | TC-S10-B05 | Sau khi báo `NoError`, số lượng bản ghi trong `connector_errors` giữ nguyên là 1 (không bị xoá). | **PASS** |
| **AC-6: Fallback timestamp khi vắng mặt** | Khi payload không truyền `timestamp`, tự gán `CURRENT_TIMESTAMP` của PostgreSQL. | TC-S10-B06 | Gửi lỗi không truyền `timestamp` $\rightarrow$ CSDL lưu `occurred_at` bằng giờ hiện tại của DB (khác NULL). | **PASS** |
| **AC-7: Xử lý `connectorId = 0` (Toàn bộ trụ)** | Trả `CALLRESULT` rỗng, không thay đổi bảng `connectors`. | TC-S10-C01 | Response: `[3, "stat-c0", {}]`. CSDL không có `connector_no = 0`. | **PASS** |
| **AC-8: Bỏ qua đầu nối chưa khai báo** | Gửi đầu nối lạ $\rightarrow$ trả `CALLRESULT` rỗng, không tự tạo đầu nối mới, có log cảnh báo. | TC-S10-C02 | Gửi `connectorId = 99` cho trụ 2 đầu nối $\rightarrow$ số đầu nối trong DB vẫn là 2 (không phát sinh rác). | **PASS** |
| **AC-9: Ràng buộc dữ liệu (Validation)** | `connectorId` âm hoặc `status` rỗng bị từ chối với `PropertyConstraintViolation`. | TC-S10-C03 | `[4, "id", "PropertyConstraintViolation", "...must be a non-negative integer", {}]` | **PASS** |

---

## 4. Đặc Tả Chi Tiết Từng Ca Kiểm Thử (Test Specifications & Verification)

### Giai đoạn A: Nền Tảng & Điều Kiện Tiên Quyết (Smoke & Schema)

| Mã ID | Phân loại | Khung gửi / Thao tác (Input) | Kết quả kỳ vọng (Expected) | Kết quả thực tế (Actual) | Bằng chứng thô (Raw Verification) | Đánh giá |
|---|:---:|---|---|---|---|:---:|
| **TC-S10-A01** | Live API | `GET /api/health` | HTTP 200, `database = postgresql` | HTTP 200 | Body: `{"ok":true,"database":"postgresql"}` | **PASS** |
| **TC-S10-A02** | Live DB | Kiểm tra cột `ocpp_status` và bảng `connector_errors` | Cả 2 đều tồn tại trong CSDL | `ocppCol = 1`, `errTable = 1` | Migration 010 và 011 đã áp dụng thành công | **PASS** |
| **TC-S10-A03** | Live WS | Gửi `StatusNotification` khi chưa Boot | `CALLERROR SecurityError` | `[4, "stat-pre", "SecurityError", "Charge point is not accepted yet", {}]` | Bị chặn đúng quy tắc an ninh của OCPP | **PASS** |
| **TC-S10-A04** | Live WS | Gửi `BootNotification` hợp lệ | `CALLRESULT Accepted` | `[3, "boot-s10", {"status":"Accepted",...}]` | Trụ chuyển sang trạng thái sẵn sàng cho đầu nối | **PASS** |

---

### Giai đoạn B: Nghiệp Vụ T-20 & T-21 (Mapping & Error Log)

| Mã ID | Phân loại | Khung gửi (Input) | Kết quả kỳ vọng (Expected) | Kết quả thực tế trong CSDL | Bằng chứng thô (Raw Verification) | Đánh giá |
|---|:---:|---|---|---|---|:---:|
| **TC-S10-B01** | Live WS/DB | 9 trạng thái chuẩn OCPP 1.6J | Ánh xạ chuẩn sang 4 trạng thái nội bộ | 1 `AVAILABLE`, 5 `OCCUPIED`, 1 `RESERVED`, 2 `ERROR` | SQL kiểm chứng từng cặp `status` và `ocpp_status` | **PASS** |
| **TC-S10-B02** | Live DB | Truy vấn cột `connectors.ocpp_status` | Giữ nguyên văn giá trị gốc | Lưu đúng `'Faulted'` | Chuỗi ký tự giữ nguyên vẹn | **PASS** |
| **TC-S10-B03** | Live WS/DB | Gửi `status: "CustomOEMState"` | Map về `ERROR`, lưu nguyên văn chuỗi | CSDL: `status = 'ERROR'`, `ocpp_status = 'CustomOEMState'` | Server trả về `[3, "stat-unk", {}]` | **PASS** |
| **TC-S10-B04** | Live WS/DB | Gửi `errorCode: "GroundFailure"` kèm vendor code | Thêm 1 dòng vào `connector_errors` | Bản ghi được tạo với `error_code='GroundFailure'`, `vendor_error_code='OEM_GROUND_ERR_505'` | `afterErrCount === initErrCount + 1` | **PASS** |
| **TC-S10-B05** | Live WS/DB | Báo `errorCode: "NoError"` | Cập nhật `AVAILABLE`, giữ nguyên lịch sử lỗi | Số bản ghi trong `connector_errors` không đổi | `okErrCount === afterErrCount` (bảo toàn lịch sử) | **PASS** |
| **TC-S10-B06** | Live WS/DB | Gửi lỗi nhưng không truyền `timestamp` | Tự gán `CURRENT_TIMESTAMP` | Cột `occurred_at` lưu thời gian DB hiện tại | Hàm `COALESCE` của SQL hoạt động chuẩn | **PASS** |

---

### Giai đoạn C: T-22 Biên & Validation (Edge & Constraints)

| Mã ID | Phân loại | Tình huống kiểm thử (Scenario) | Kết quả kỳ vọng (Expected) | Kết quả thực tế (Actual) | Bằng chứng thô (Raw Verification) | Đánh giá |
|---|:---:|---|---|---|---|:---:|
| **TC-S10-C01** | Live WS/DB | `connectorId = 0` (Toàn bộ trụ) | Trả `{}` rỗng, không đổi bảng đầu nối | Phản hồi `[3, "stat-c0", {}]`. Số connector 0 trong DB = 0 | Xử lý đúng chuẩn OCPP cho toàn trụ | **PASS** |
| **TC-S10-C02** | Live WS/DB | `connectorId = 99` (chưa khai báo) | Trả `{}` rỗng, không tạo đầu nối mới | Phản hồi `[3, "stat-c99", {}]`. Tổng số đầu nối của trụ giữ nguyên | Không tạo bản ghi rác, log warning có rate-limit | **PASS** |
| **TC-S10-C03a** | Live WS | `connectorId = -1` (số âm) | `CALLERROR PropertyConstraintViolation` | `[4, "stat-invid", "PropertyConstraintViolation", "connectorId must be a non-negative integer", {}]` | Ràng buộc số nguyên không âm | **PASS** |
| **TC-S10-C03b** | Live WS | `status = ""` (chuỗi rỗng) | `CALLERROR PropertyConstraintViolation` | `[4, "stat-empst", "PropertyConstraintViolation", "status must be a non-empty string", {}]` | Ràng buộc chuỗi không rỗng | **PASS** |
| **TC-S10-C04** | Live Concurr | 2 đầu nối gửi trạng thái đồng thời | Cả 2 cập nhật độc lập, chính xác | Đầu nối 1 = `OCCUPIED`, Đầu nối 2 = `RESERVED` | Không bị race condition hay ghi đè chéo | **PASS** |

---

### Giai đoạn D: Bộ Test Hồi Quy Tự Động (CI Regression)

| Mã ID | Bộ kiểm thử | Lệnh thực thi từ thư mục gốc | Kết quả đầu ra | Đánh giá |
|---|---|---|---|:---:|
| **TC-S10-D01** | Unit test chuyên biệt S-10 | `node --test backend/tests/unit/ocpp-status-notification.test.js` | `9 test pass, 0 fail (thời gian: 78ms)` | **PASS** |
| **TC-S10-D02** | Toàn bộ Unit test của hệ thống | `python test.py --only unit` | `64 test pass, 0 fail (thời gian: 10 giây)` | **PASS** |
| **TC-S10-D03** | Toàn bộ Integration test của hệ thống | `python test.py --only integration` | `67 test pass, 0 fail (thời gian: 32 giây)` | **PASS** |

---

## 5. Nhật Ký Thực Thi Kiểm Thử Thực Tế (Raw Execution Log)

Bằng chứng thực thi từ công cụ kiểm tra tự động chuẩn của repo:

```
$ node tools/verify-s10-live.js
======================================================================
  KIỂM THỬ XÁC MINH S-10: STATUS NOTIFICATION TỪNG ĐẦU NỐI (T-20, T-21, T-22)
======================================================================

[PASS] TC-S10-A01: Healthcheck GET /api/health trả HTTP 200
[PASS] TC-S10-A02: CSDL sẵn sàng: cột connectors.ocpp_status và bảng connector_errors tồn tại
[PASS] TC-S10-A03: Chặn StatusNotification trước khi BootNotification (SecurityError)
[PASS] TC-S10-A04: BootNotification được chấp nhận (Accepted)
[PASS] TC-S10-B01: Ánh xạ chuẩn xác 9 trạng thái OCPP sang 4 trạng thái nội bộ (AVAILABLE, OCCUPIED, RESERVED, ERROR)
[PASS] TC-S10-B02: Cột ocpp_status lưu nguyên văn chuỗi OCPP gốc (Faulted)
[PASS] TC-S10-B03: Trạng thái tuỳ biến nhà sản xuất ánh xạ an toàn sang ERROR và giữ nguyên văn trong ocpp_status
[PASS] TC-S10-B04: Lỗi đầu nối ghi thêm bản ghi vào connector_errors (error_code, vendor_error_code, occurred_at)
[PASS] TC-S10-B05: Báo NoError khôi phục trạng thái Available, không ghi thêm lỗi và bảo toàn lịch sử connector_errors
[PASS] TC-S10-B06: Khi timestamp vắng mặt, hệ thống tự động gán CURRENT_TIMESTAMP của CSDL
[PASS] TC-S10-C01: connectorId = 0 đại diện cả trụ: trả CALLRESULT rỗng, không thay đổi bảng connectors
[PASS] TC-S10-C02: connectorId lạ/chưa khai báo: trả CALLRESULT rỗng, không tự tạo đầu nối mới trong CSDL
[PASS] TC-S10-C03a: Validation: connectorId âm bị từ chối với CALLERROR PropertyConstraintViolation
[PASS] TC-S10-C03b: Validation: status rỗng bị từ chối với CALLERROR PropertyConstraintViolation
[PASS] TC-S10-C04: Đồng thời gửi StatusNotification cho nhiều đầu nối cập nhật độc lập, chính xác

======================================================================
TỔNG KẾT: 15 Test Cases | PASS: 15 | FAIL: 0
======================================================================
```

---

## 6. Đánh Giá Rủi Ro & Giới Hạn Kiểm Thử (Risk Assessment & Test Limitations)

1. **Giới hạn phần cứng:**
   - Các mã lỗi nhà sản xuất (`vendorErrorCode`) hiện được kiểm thử bằng các chuỗi giả lập chuẩn. Thiết bị trụ thật của các hãng khác nhau (ABB, Schneider, StarCharge) có thể có độ dài và ký tự đặc biệt khác nhau trong trường này.
2. **Cơ chế dọn dẹp lịch sử lỗi:**
   - Bảng `connector_errors` là bảng ghi nối thêm (`INSERT-only`). Hiện chưa có job dọn dẹp tự động định kỳ sau 30/90 ngày, có thể dẫn đến phình to kích thước CSDL nếu một trụ bị chập mạch gửi hàng nghìn lỗi liên tục. Khuyến nghị bổ sung job dọn dẹp ở Sprint sau.

---

## 7. Hướng Dẫn Tái Hiện (Repo-Native Reproduction Steps)

Mọi Reviewer đều có thể tái hiện 100% kết quả trên bằng các lệnh chuẩn:

```bash
# 1. Khởi động môi trường Docker của dự án
python run.py --no-open

# 2. Chạy bộ kiểm thử đơn vị
node --test backend/tests/unit/ocpp-status-notification.test.js

# 3. Chạy script kiểm chứng tự động S-10 (Repo-Native)
node tools/verify-s10-live.js

# 4. Kiểm tra dữ liệu trong PostgreSQL
docker compose exec -T db psql -U csms -d csms -c "SELECT c.connector_no, c.status, c.ocpp_status, ce.error_code, ce.vendor_error_code FROM connectors c LEFT JOIN connector_errors ce ON ce.connector_id = c.id WHERE c.charge_point_id = 1 LIMIT 5;"
```
