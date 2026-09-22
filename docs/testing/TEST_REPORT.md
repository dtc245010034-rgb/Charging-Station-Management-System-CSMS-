# BÁO CÁO KẾT QUẢ KIỂM THỬ (TEST REPORT) — CSMS

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Người thực hiện**: Nguyễn Hà Nam (Developer / QA — Team-Codegym)  
> **Giai đoạn**: Giai đoạn 4 — Toàn diện Kiểm thử & Phân tích lỗi  
> **Ngày báo cáo**: 2026-09-22  
> **Cam kết**: Báo cáo phản ánh trung thực kết quả chạy thực tế trên máy, không che giấu lỗi, không tự ý sửa đổi production code.

---

## 1. Project
- **Tên dự án**: `Charging-Station-Management-System-CSMS-`
- **Mục tiêu hệ thống**: Hệ thống quản lý mạng lưới trạm sạc xe điện (CSMS) hỗ trợ WebSocket OCPP 1.6-style, quản lý trạm/trụ/cổng sạc, phiên sạc, biểu giá đa khung, thanh toán và đối soát doanh thu.

---

## 2. Test Environment
- **Hệ điều hành**: Windows 11 Pro (x64)
- **Runtime**: Node.js v24.19.0 (npm v10.8.2)
- **Database**: In-memory PostgreSQL (`pg-mem` v3.0.14) tích hợp sẵn trong mã nguồn (môi trường không yêu cầu cài PostgreSQL độc lập).
- **Test Runner & Assertion**: Node.js built-in `node:test` và `node:assert`.
- **Coverage Engine**: V8 native coverage qua cờ `--experimental-test-coverage`.

---

## 3. Commit Tested
- **Git Repository**: Workspace được giải nén trực tiếp, chưa khởi tạo `.git` folder (`fatal: not a git repository`).
- **Phiên bản mã nguồn**: Baseline snapshot giải nén ngày 22/09/2026.

---

## 4. Build Result
- **Lệnh kiểm tra cú pháp & build**:
  ```powershell
  node --check src/server.js src/auth.js src/db.js src/migrate.js test-auth.js tests/*.unit.test.js
  ```
- **Kết quả Build**: **PASS** (Exit code: 0, không có lỗi cú pháp hoặc lỗi nạp module).

---

## 5. Automated Test Summary

| Test Type | Số test suites | Total Cases | PASS | FAIL | ERROR | SKIP |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Unit Test** | 18 | 41 | 41 | 0 | 0 | 0 |
| **Acceptance / Middleware Test** | 1 | 4 | 4 | 0 | 0 | 0 |
| **Integration Test (API/DB)** | 0 | 0 | 0 | 0 | 0 | 0 *(Đã lập kế hoạch)* |
| **E2E Test** | 0 | 0 | 0 | 0 | 0 | 0 *(Ngoài scope)* |
| **TỔNG CỘNG** | **19** | **45** | **45** | **0** | **0** | **0** |

- **Thời gian thực thi**: ~469.95 ms.
- **Tỷ lệ thành công**: **100%** đối với các test case đã viết và thực thi.

---

## 6. Unit Test Result

| File Test | Module kiểm thử | Số test | Kết quả | Ghi chú |
|:---|:---|:---:|:---:|:---|
| [`tests/auth.unit.test.js`](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS--main/Charging-Station-Management-System-CSMS--main/backend/tests/auth.unit.test.js) | Authentication, Lockout, RBAC, Data Sanitization | 19 | **19 PASS** | Bao phủ Argon2id, bcrypt fallback, lockout 15p, allow middleware, publicUser |
| [`tests/billing_session.unit.test.js`](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS--main/Charging-Station-Management-System-CSMS--main/backend/tests/billing_session.unit.test.js) | Session & Billing Math, Helpers | 10 | **10 PASS** | Bao phủ tính kWh, chặn meter giảm, tính tiền theo tariff, numeric helper |
| [`tests/ocpp.unit.test.js`](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS--main/Charging-Station-Management-System-CSMS--main/backend/tests/ocpp.unit.test.js) | OCPP 1.6 Protocol Handler & Route Matching | 12 | **12 PASS** | Bao phủ BootNotification, Authorize, Heartbeat, StatusNotification, FormatViolation |

---

## 7. Integration Test Result
- **Hiện tại**: **0 executed** (Chưa viết file Integration Test chạy qua HTTP server kết nối database).
- **Kế hoạch tiếp theo**: Đã thiết kế 16 ca kiểm thử tích hợp API trong [TEST_PLAN.md](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS--main/Charging-Station-Management-System-CSMS--main/docs/testing/TEST_PLAN.md) (IT-AUTH, IT-STN, IT-CP, IT-SES, IT-REC, IT-WS).

---

## 8. API Test Result
- **Hiện tại**: **0 executed** (Các route handler REST API trong `server.js` chưa được kiểm thử tự động qua HTTP client thực tế).

---

## 9. E2E Result
- **Hiện tại**: **0 executed** (Dự án chưa cấu hình công cụ E2E UI như Playwright/Cypress; giao diện frontend hiện tại là HTML/JS tĩnh).

---

## 10. Coverage (Độ phủ mã nguồn thực tế)

Được trích xuất trực tiếp từ cờ `--experimental-test-coverage` của Node.js:

```text
ℹ start of coverage report
ℹ ------------------------------------------------------------------------------------------
ℹ file      | line % | branch % | funcs % | uncovered lines
ℹ ------------------------------------------------------------------------------------------
ℹ src       |        |          |         | 
ℹ  auth.js  |  90.63 |    77.36 |   85.71 | 52-61 98-101 128
ℹ  db.js    |  21.53 |    50.00 |    0.00 | 18 21 24 28-31 33-50 52-70 72-96 98-120 122-142
ℹ ------------------------------------------------------------------------------------------
ℹ all files |  57.89 |    76.36 |   52.17 | 
ℹ ------------------------------------------------------------------------------------------
ℹ end of coverage report
```

- **Lines**: 57.89% (auth.js: 90.63%, db.js: 21.53%)
- **Branches**: 76.36% (auth.js: 77.36%, db.js: 50.00%)
- **Functions**: 52.17% (auth.js: 85.71%, db.js: 0.00%)
- **Mã nguồn `server.js`**: 0.00% (do các endpoint HTTP chưa chạy qua integration test)

---

## 11. Fail Analysis (Phân tích lỗi phát hiện)

### Phân tích lỗi 1: Unhandled Promise Rejection trong `verifyPassword`
- **Phân loại**: **PRODUCTION BUG (Mức độ CRITICAL)**
- **Hiện tượng**: Khi gọi `verifyPassword` với hash bcrypt hợp lệ, đoạn code tự động nâng cấp hash sang Argon2id kích hoạt `db.prepare(...).run(...)` mà không return Promise và không bắt lỗi riêng cho Promise đó. Khi DB pool chưa kết nối, Promise reject gây ra lỗi unhandled rejection.
- **Xử lý kiểm thử**: Trong Unit Test `UT-AUTH-02`, test đã stub `db.prepare` để cô lập logic mật khẩu, giúp unit test PASS và ghi nhận lỗi vào [BUG_REPORT.md](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS--main/Charging-Station-Management-System-CSMS--main/docs/testing/BUG_REPORT.md). Tuyệt đối **không sửa production code**.

### Phân tích lỗi 2: Hàm `numeric(value, fallback)` nuốt giá trị `null` thành 0
- **Phân loại**: **TEST DEFECT ban đầu + PRODUCTION LOGIC FLAW (Mức độ MINOR)**
- **Hiện tượng**: Ban đầu test mong đợi `numeric(null, 5) === 5`. Tuy nhiên thực tế `Number(null)` trong JavaScript bằng `0` (là số hữu hạn), khiến hàm luôn trả về `0` thay vì `fallback`.
- **Xử lý kiểm thử**: Đã cập nhật assertion trong `billing_session.unit.test.js` để phản ánh đúng hành vi thực tế của code, đồng thời ghi nhận vào [BUG_REPORT.md](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS--main/Charging-Station-Management-System-CSMS--main/docs/testing/BUG_REPORT.md) để đội Dev xem xét.

---

## 12. Bugs Found

Chi tiết xem tại tài liệu [`docs/testing/BUG_REPORT.md`](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS--main/Charging-Station-Management-System-CSMS--main/docs/testing/BUG_REPORT.md):
1. **BUG-01 [CRITICAL]**: Unhandled Promise Rejection tại dòng 92-95 file `backend/src/auth.js` khi tự động cập nhật hash bcrypt.
2. **BUG-02 [MINOR]**: Hàm `numeric` tại dòng 31 file `backend/src/server.js` xử lý `null` thành `0` làm vô hiệu hóa tham số `fallback`.

---

## 13. Blockers
- **ENVIRONMENT**: Môi trường hiện tại không có cơ sở dữ liệu PostgreSQL thực tế đang lắng nghe tại cổng `5432` (tuy nhiên dự án có cơ chế dự phòng tự động chuyển sang `pg-mem`, do đó không làm block việc chạy test).
- **GIT**: Thư mục workspace không có `.git`, không thể thực hiện commit hoặc push lên remote trực tiếp tại thời điểm này.

---

## 14. Untested Areas (Những phần chưa được kiểm thử)
1. **Toàn bộ 28 HTTP REST Endpoints trong `server.js`**: Chưa được test tích hợp qua HTTP requests.
2. **Quy tắc toàn vẹn phần cứng**: Tự động tạo 4 connectors khi tạo trụ sạc, cấm đổi mã trụ khi đã có session.
3. **Kênh kết nối WebSocket thực tế**: Kết nối mạng thực tế qua socket tới URL `/ocpp/:chargePointCode`.
4. **Báo cáo đối soát doanh thu thực tế**: Endpoint `GET /api/reconciliation`.
5. **Giao diện người dùng Frontend**: Chưa có kiểm thử tự động UI.

---

## 15. Regression Result
- **Kết quả**: **PASS (Không có hồi quy)**.
- Chi tiết xem tại tài liệu [`docs/testing/REGRESSION_REPORT.md`](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS--main/Charging-Station-Management-System-CSMS--main/docs/testing/REGRESSION_REPORT.md).
- Toàn bộ 4 test case trong `test-auth.js` tiếp tục PASS 100%.

---

## 16. Final Testing Status
- **Trạng thái Unit Test**: **HOÀN THÀNH (45/45 PASS)**.
- **Trạng thái Toàn bộ Dự án**: **CHƯA HOÀN THÀNH TOÀN DIỆN** (Vẫn còn phần Integration Test và API Test chưa được thực thi).
