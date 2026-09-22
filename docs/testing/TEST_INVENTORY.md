# TEST INVENTORY — CHARGING STATION MANAGEMENT SYSTEM (CSMS)

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Người thực hiện**: Nguyễn Hà Nam (Developer / QA — Team-Codegym)  
> **Giai đoạn**: Cập nhật sau Giai đoạn 3 (Viết Unit Test)  
> **Ngày cập nhật**: 2026-09-22  
> **Cam kết**: 100% dựa trên source code thực tế, cấu hình và test runner hiện có. Không phỏng đoán, không sửa production code.

---

## 1. Project Snapshot

- **Workspace Path**: `Charging-Station-Management-System-CSMS--main/backend`
- **Ngôn ngữ & Runtime**: Node.js v24.19.0 (JavaScript CommonJS)
- **Framework chính**:
  - Web framework: `express` (v4.21.2)
  - WebSocket: `ws` (v8.18.0)
  - Database Driver: `pg` (v8.13.1) & in-memory PostgreSQL `pg-mem` (v3.0.14)
  - Password Crypto: `argon2` (v0.45.1), `bcryptjs` (v2.4.3)
  - Token: `jsonwebtoken` (v9.0.2)
  - Cookie: `cookie-parser` (v1.4.7)

---

## 2. Test Framework & Runner Thực tế

| Hạng mục | Hiện trạng thực tế | Ghi chú từ mã nguồn |
|:---|:---|:---|
| **Test Runner** | Node.js native test runner (`node --test`) | Có sẵn trong Node.js v24.19.0 |
| **Assertion Library** | `node:assert` (Native Node.js assert module) | Chuẩn built-in của Node.js |
| **Test Suites Framework** | `node:test` (`describe`, `it`) | Hỗ trợ cấu trúc BDD / TDD chuẩn |
| **Test Directory** | `backend/tests/` (Unit tests mới) & `backend/` (test cũ) | Đã phân tách rõ ràng |
| **Coverage Tool** | Node.js built-in `--experimental-test-coverage` | Đo được Line %, Branch %, Function % từ V8 |

---

## 3. Danh mục Test hiện tại (Đã bổ sung Unit Test Giai đoạn 3)

| ID | Module | File | Test Type | Test Suite / Function | Scenario | Status thực tế |
|:---|:---|:---|:---|:---|:---|:---:|
| **EXT-01** | Auth / Crypto | `test-auth.js` | Unit Test | `runTests() / Test 1` | Băm Argon2id và verify password đúng/sai | **PASS** |
| **EXT-02** | Auth / Security | `test-auth.js` | Unit Test | `runTests() / Test 2` | Logic khóa 5 lần sai khóa 15 phút, lần 6 bị chặn | **PASS** |
| **EXT-03** | Auth / RBAC | `test-auth.js` | Unit Test | `runTests() / Test 3` | Danh sách 5 vai trò hệ thống | **PASS** |
| **EXT-04** | Auth / Middleware | `test-auth.js` | Acceptance | `runTests() / Test 4` | Cookie token và token hết hạn trả về 401 | **PASS** |
| **UT-AUTH-01** | Auth / Crypto | `tests/auth.unit.test.js` | Unit Test | `verifyPassword` | Input rỗng, null, undefined, không có hash | **PASS** (3 tests) |
| **UT-AUTH-02** | Auth / Crypto | `tests/auth.unit.test.js` | Unit Test | `verifyPassword` | Hỗ trợ hash legacy bcrypt ($2a$/$2b$) và auto-upgrade | **PASS** (1 test) |
| **UT-AUTH-03** | Auth / Security | `tests/auth.unit.test.js` | Unit Test | `checkUserLock` | Tự động mở khóa khi hết hạn và tính thời gian còn lại | **PASS** (3 tests) |
| **UT-AUTH-04** | Auth / RBAC | `tests/auth.unit.test.js` | Unit Test | `allow` middleware | Cho phép truy cập khi user có role trong role/roles | **PASS** (2 tests) |
| **UT-AUTH-05** | Auth / RBAC | `tests/auth.unit.test.js` | Unit Test | `allow` middleware | Từ chối 403 Forbidden khi user không đủ quyền | **PASS** (1 test) |
| **UT-AUTH-06** | Auth / RBAC | `tests/auth.unit.test.js` | Unit Test | `allow` middleware | Từ chối 401 Unauthorized khi chưa đăng nhập | **PASS** (1 test) |
| **UT-AUTH-07** | Auth / Session | `tests/auth.unit.test.js` | Unit Test | `authenticate` | Xác thực thành công qua header Authorization Bearer | **PASS** (1 test) |
| **UT-AUTH-08** | Auth / Session | `tests/auth.unit.test.js` | Unit Test | `authenticate` | Từ chối 401 khi header không dùng Bearer hoặc token hỏng | **PASS** (2 tests) |
| **UT-AUTH-09** | Auth / Security | `tests/auth.unit.test.js` | Unit Test | `publicUser` | Loại bỏ trường nhạy cảm `password_hash` | **PASS** (2 tests) |
| **UT-LOCK-01** | Auth / DB | `tests/auth.unit.test.js` | Unit Test | `recordUserFailedLogin` | Ghi nhận lần sai vào DB, khóa 15p tại lần 5, reset về 0 | **PASS** (3 tests) |
| **UT-SES-01** | Sessions / Logic | `tests/billing_session.unit.test.js` | Unit Test | `calculateSessionEnergy` | Tính chênh lệch `meter - start_meter`, boundary 0 | **PASS** (2 tests) |
| **UT-SES-02** | Sessions / Valid | `tests/billing_session.unit.test.js` | Unit Test | `calculateSessionEnergy` | Chặn `meter < start_meter` văng ngoại lệ | **PASS** (1 test) |
| **UT-SES-03** | Sessions / Stop | `tests/billing_session.unit.test.js` | Unit Test | `calculateStopSessionValues`| Fallback `end_meter = start_meter + energy_kwh` | **PASS** (1 test) |
| **UT-BIL-01** | Billing / Math | `tests/billing_session.unit.test.js` | Unit Test | `calculateStopSessionValues`| Tính `amount = (end - start) * price_per_kwh` | **PASS** (1 test) |
| **UT-BIL-02** | Billing / Boundary| `tests/billing_session.unit.test.js` | Unit Test | `calculateStopSessionValues`| Tiền = 0 khi điện tiêu thụ = 0 | **PASS** (1 test) |
| **UT-BIL-03** | Billing / Boundary| `tests/billing_session.unit.test.js` | Unit Test | `calculateStopSessionValues`| Tiền = 0 khi tariff miễn phí hoặc null | **PASS** (1 test) |
| **UT-BIL-04** | Billing / Decimal | `tests/billing_session.unit.test.js` | Unit Test | `calculateStopSessionValues`| Xử lý số thực thập phân chính xác | **PASS** (1 test) |
| **UT-UTIL-01** | DB Helper | `tests/billing_session.unit.test.js` | Unit Test | `convertPlaceholders` | Chuyển `?` sang `$1, $2, ...` | **PASS** (1 test) |
| **UT-UTIL-02** | Common Helper | `tests/billing_session.unit.test.js` | Unit Test | `numeric` | Parse số, chuỗi số, NaN, null, undefined | **PASS** (1 test) |
| **UT-OCPP-01** | OCPP / Protocol | `tests/ocpp.unit.test.js` | Unit Test | `processOcppMessage` | Bản tin `BootNotification`: Accepted, interval 60 | **PASS** (1 test) |
| **UT-OCPP-02** | OCPP / Auth | `tests/ocpp.unit.test.js` | Unit Test | `processOcppMessage` | Bản tin `Authorize`: Accepted khi có idTag, Invalid khi thiếu | **PASS** (2 tests) |
| **UT-OCPP-03** | OCPP / Heartbeat | `tests/ocpp.unit.test.js` | Unit Test | `processOcppMessage` | Bản tin `Heartbeat`: trả về currentTime | **PASS** (1 test) |
| **UT-OCPP-04** | OCPP / Status | `tests/ocpp.unit.test.js` | Unit Test | `processOcppMessage` | Bản tin `StatusNotification`: status Accepted | **PASS** (1 test) |
| **UT-OCPP-05** | OCPP / Error | `tests/ocpp.unit.test.js` | Unit Test | `processOcppMessage` | Action không hỗ trợ hoặc type != 2 -> `NotSupported` | **PASS** (2 tests) |
| **UT-OCPP-06** | OCPP / Error | `tests/ocpp.unit.test.js` | Unit Test | `processOcppMessage` | JSON sai cú pháp hoặc không phải mảng -> `FormatViolation`| **PASS** (2 tests) |
| **UT-OCPP-07** | OCPP / Route | `tests/ocpp.unit.test.js` | Unit Test | `matchOcppUrl` | Regex bóc tách `chargePointCode` từ URL WebSocket | **PASS** (3 tests) |

---

## 4. Bảng tổng kết số lượng Test (Summary)

| Loại | Số lượng ban đầu | Số lượng bổ sung | Tổng hiện tại |
|:---|:---:|:---:|:---:|
| **Test files** | 1 | 3 | **4** |
| **Test suites** | 1 | 18 | **19** |
| **Test cases** | 4 | 41 | **45** |
| **PASS** | 4 | 41 | **45** |
| **FAIL** | 0 | 0 | **0** |
| **SKIP** | 0 | 0 | **0** |

---

## 5. Báo cáo độ phủ mã nguồn thực tế (Code Coverage)

Kết quả đo bằng công cụ thực tế (`node --test --experimental-test-coverage test-auth.js tests/*.unit.test.js`):

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

- Độ phủ dòng (`auth.js`): Tăng từ **52.50% lên 90.63%** (+38.13%)
- Độ phủ nhánh (`auth.js`): Tăng từ **47.37% lên 77.36%** (+29.99%)
- Độ phủ hàm (`auth.js`): Tăng từ **41.67% lên 85.71%** (+44.04%)
