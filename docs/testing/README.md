# Testing — CSMS

Tài liệu hướng dẫn thiết lập, thực thi kiểm thử và tra cứu báo cáo chất lượng cho hệ thống Quản lý Mạng lưới Trạm Sạc Xe Điện (CSMS - Charging Station Management System).

---

## 1. Mục đích

Thư mục `docs/testing/` lưu trữ toàn bộ tài liệu kiểm thử chuẩn hóa của dự án (Kế hoạch, Danh mục test, Báo cáo kết quả, Hồ sơ lỗi và Báo cáo hồi quy). Tài liệu này giúp các thành viên mới hoặc thành viên clone project về có thể nhanh chóng hiểu cấu trúc kiểm thử, thiết lập môi trường và chạy toàn bộ test suite một cách nhất quán.

---

## 2. Cấu trúc thư mục

### 2.1. Cấu trúc tài liệu kiểm thử (`docs/testing/`)
```text
docs/testing/
├── README.md               # Hướng dẫn tổng quan về testing (tài liệu này)
├── TEST_INVENTORY.md       # Bảng kê hiện trạng test, phân loại module và baseline coverage
├── TEST_PLAN.md            # Kế hoạch kiểm thử chi tiết (Scope, Strategy, Priority, Traceability)
├── TEST_CASES.md           # Danh mục chi tiết 45 test cases kèm Scenario, Input, Expected/Actual
├── TEST_REPORT.md          # Báo cáo kết quả chạy test toàn diện, coverage và phân tích lỗi
├── BUG_REPORT.md           # Hồ sơ các lỗi phát hiện trong production code (BUG-01, BUG-02)
└── REGRESSION_REPORT.md    # Báo cáo kiểm thử hồi quy đối chiếu test cũ và test mới
```

### 2.2. Vị trí mã nguồn kiểm thử (`backend/`)
Toàn bộ mã kiểm thử tự động được tổ chức trong thư mục `backend/`:
```text
backend/
├── test-auth.js                   # Bộ kiểm thử bảo mật & xác thực gốc (Sprint 1)
└── tests/                         # Thư mục chứa các bộ Unit Test bổ sung (Sprint 2)
    ├── auth.unit.test.js          # Unit tests cho Authentication, RBAC và Lockout
    ├── billing_session.unit.test.js # Unit tests cho Session Math, Meter Validation & Billing
    └── ocpp.unit.test.js          # Unit tests cho giao thức bản tin WebSocket OCPP 1.6
```

---

## 3. Test Framework & Công cụ kiểm thử

- **Ngôn ngữ**: JavaScript (Node.js CommonJS).
- **Test Runner**: Node.js Native Test Runner (`node:test`), hỗ trợ cấu trúc `describe`, `it`.
- **Assertion Library**: `node:assert` (module chuẩn built-in của Node.js).
- **Coverage Engine**: V8 Native Coverage qua cờ `--experimental-test-coverage` của Node.js.
- **Database giả lập cho test**: `pg-mem` (v3.0.14) tích hợp sẵn cơ chế fallback tự động trong `backend/src/db.js`, không bắt buộc cài đặt PostgreSQL server vật lý để chạy test.

---

## 4. Yêu cầu môi trường

- **Node.js**: Phiên bản `22.5+` (khuyến nghị Node.js `v22` hoặc `v24`; đã kiểm tra thực tế trên Node.js `v24.19.0`).
- **npm**: Đi kèm với Node.js (đã kiểm tra trên `npm v10.8.2`).
- **PostgreSQL**: Không bắt buộc để chạy Unit Test (nhờ có `pg-mem`). Nếu chạy live integration với server cần PostgreSQL 14+ hoặc Docker Compose.

---

## 5. Cài đặt

Từ thư mục gốc của dự án, di chuyển vào thư mục `backend` và cài đặt dependencies:

```powershell
cd backend
npm install
```

---

## 6. Chạy Unit Test

### 6.1. Chạy test xác thực mặc định (Script gốc trong `package.json`):
```powershell
npm test
```
*Lệnh này sẽ thực thi script `"test": "node test-auth.js"` kiểm tra 4 kịch bản bảo mật cơ bản.*

### 6.2. Chạy toàn bộ các file Unit Test mới:
```powershell
node --test tests/*.unit.test.js
```

---

## 7. Chạy toàn bộ Automated Test Suite

Để chạy đồng thời toàn bộ test cũ và các unit test mới (45 test cases):

```powershell
node --test test-auth.js tests/*.unit.test.js
```

*(Lưu ý: `package.json` hiện tại chưa cấu hình script npm riêng cho lệnh này, do đó hãy chạy trực tiếp qua lệnh `node --test` ở trên).*

---

## 8. Chạy Coverage (Đo độ phủ mã nguồn)

Node.js v22/v24 hỗ trợ cờ đo coverage trực tiếp mà không cần cài thêm thư viện bên thứ ba:

```powershell
node --test --experimental-test-coverage test-auth.js tests/*.unit.test.js
```

Kết quả sẽ xuất ra bảng số liệu chi tiết:
- **Line %** (Độ phủ dòng)
- **Branch %** (Độ phủ nhánh rẽ)
- **Funcs %** (Độ phủ hàm)
- **Uncovered lines** (Các dòng code chưa được test gọi tới)

---

## 9. Chạy từng Test File / Test Suite riêng lẻ

Khi phát triển hoặc debug từng module cụ thể, có thể chạy riêng từng file:

- **Chỉ chạy Unit Test Auth & RBAC**:
  ```powershell
  node --test tests/auth.unit.test.js
  ```
- **Chỉ chạy Unit Test Phiên sạc & Biểu giá**:
  ```powershell
  node --test tests/billing_session.unit.test.js
  ```
- **Chỉ chạy Unit Test Giao thức OCPP 1.6**:
  ```powershell
  node --test tests/ocpp.unit.test.js
  ```

---

## 10. Đọc kết quả test

Khi chạy `node --test`, kết quả trả về theo định dạng TAP / BDD tiêu chuẩn:
- **`✔` (PASS)**: Test case chạy thành công, assertion đúng với kỳ vọng.
- **`✖` (FAIL)**: Test case thất bại (sai lệch giữa Expected và Actual, hoặc có Exception ngoài ý muốn).
- **`ℹ tests X | pass Y | fail Z | duration_ms T`**: Bảng tổng kết số lượng test đã chạy, số test đỗ/hỏng và tổng thời gian thực thi.
- **Coverage Summary**: Hiển thị tỷ lệ phần trăm theo từng file (`auth.js`, `db.js`,...).

---

## 11. Các tài liệu kiểm thử liên quan

| Tài liệu | Mô tả nội dung |
|:---|:---|
| [TEST_INVENTORY.md](./TEST_INVENTORY.md) | Thống kê số lượng test ban đầu, phân loại module cần test và độ phủ mã nguồn baseline. |
| [TEST_PLAN.md](./TEST_PLAN.md) | Kế hoạch kiểm thử toàn diện, phạm vi (Scope / Out of Scope), chiến lược, mức độ ưu tiên (P0-P3) và Traceability Matrix. |
| [TEST_CASES.md](./TEST_CASES.md) | Bảng mô tả chi tiết 45 test cases: ID, Module, Scenario, Input, Expected Result và Actual Result. |
| [TEST_REPORT.md](./TEST_REPORT.md) | Báo cáo kiểm thử toàn diện sau khi chạy toàn bộ test suite và đo lường độ phủ. |
| [BUG_REPORT.md](./BUG_REPORT.md) | Báo cáo chi tiết các lỗi phát hiện trong production code (`BUG-01: CRITICAL`, `BUG-02: MINOR`) kèm mã lỗi và các bước tái hiện. |
| [REGRESSION_REPORT.md](./REGRESSION_REPORT.md) | Báo cáo kiểm thử hồi quy xác nhận các test case cũ không bị ảnh hưởng. |

---

## 12. Quy trình Testing (Testing Workflow)

Quy trình chuẩn được áp dụng trong dự án:

```text
Khảo sát mã nguồn (Scan)
       ↓
Lập danh mục & Kế hoạch (Inventory & Plan)
       ↓
Viết Test (Write Unit / Integration Tests)
       ↓
Thực thi kiểm thử (Run Tests & Coverage)
       ↓
Phân tích lỗi & Hồi quy (Analyze Fail & Regression)
       ↓
Lập hồ sơ Bug & Báo cáo (Bug Report & Deliverables)
```

---

## 13. Xử lý khi Test FAIL

Tuân thủ nghiêm ngặt quy tắc của Team Charter:

1. **KHÔNG tự ý sửa production code**: Mục tiêu của QA/Tester là phát hiện và ghi nhận lỗi, không tự ý sửa đổi code nghiệp vụ của thành viên khác.
2. **KHÔNG nới lỏng assertion**: Không sửa đổi Expected Result chỉ để làm test chuyển sang màu xanh (PASS).
3. **Phân loại nguyên nhân lỗi**:
   - **Test Defect**: Do viết sai assertion, setup test data hoặc mock không phù hợp -> Sửa lại mã test và chạy lại.
   - **Production Bug**: Do mã nguồn xử lý sai logic, văng ngoại lệ hoặc unhandled rejection -> Giữ nguyên test FAIL, ghi nhận đầy đủ vào [BUG_REPORT.md](./BUG_REPORT.md) (kèm steps to reproduce, severity) để đội Developer xử lý.
   - **Environment Issue**: Do thiếu biến môi trường hoặc cổng mạng bị chiếm dụng -> Ghi nhận blocker môi trường.

---

## 14. Lưu ý quan trọng

- **Cơ chế In-Memory DB**: File `src/db.js` tự động khởi tạo `pg-mem` khi không kết nối được PostgreSQL ở `localhost:5432`. Điều này cho phép chạy toàn bộ Unit Test độc lập, tốc độ cao (dưới 500ms) mà không cần bật Docker hay cài database bên ngoài.
- **Bảo vệ nhánh Git**: Nhánh `main` của repository được cài đặt quy tắc Protected Branch. Mọi thay đổi kiểm thử cần được push lên nhánh riêng (ví dụ `test/csms-unit-tests`) và tạo Pull Request để review trước khi merge vào `main`.
