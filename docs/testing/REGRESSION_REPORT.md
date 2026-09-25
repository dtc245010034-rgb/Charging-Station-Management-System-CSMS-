# BÁO CÁO KIỂM THỬ HỒI QUY (REGRESSION REPORT) — CSMS

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Người thực hiện**: TESTER / QA ANALYST  
> **Phiên bản snapshot**: 24/09/2026 (Nhánh `main`, commit `4bc5758`)  
> **Phạm vi**: Đánh giá hồi quy chức năng của các Story S-01, S-02, S-03 sau các đợt refactor và dọn dẹp mã nguồn.  

---

## 1. Danh sách Kiểm thử Hồi quy Hiện tại (Current Regression Tests)

- `tests/unit/no-backdoor.test.js`: Kiểm tra hồi quy việc loại bỏ hoàn toàn các backdoor, hardcoded secret, và dependency không an toàn (`bcryptjs`).
- `tests/unit/nodeVersion.test.js`: Kiểm tra hồi quy tính tương thích phiên bản Node.js (>= 22.7.0).
- `tests/unit/scope.test.js`: Kiểm tra hồi quy hàm điều kiện lọc sở hữu `scopeByOwner` cho từng vai trò (`ADMIN`, `STATION_OWNER`, `OPERATOR`).
- `tests/unit/frontend.test.js`: Kiểm tra hồi quy form validate, fetcher headers, token storage check, 401 auto-redirect, và điều hướng router theo vai trò.

---

## 2. Kết quả Thực thi Kiểm thử Cũ (Test cũ chạy lại có còn PASS không)

| Regression Suite | Số lượng test | Kết quả chạy lại (24/09/2026) | Trạng thái |
|:---|:---:|:---:|:---:|
| `no-backdoor.test.js` | 3 tests | `✔ 3 pass, 0 fail (60ms)` | **PASS** |
| `nodeVersion.test.js` | 2 tests | `✔ 2 pass, 0 fail (55ms)` | **PASS** |
| `scope.test.js` | 4 tests | `✔ 4 pass, 0 fail (2.9ms)` | **PASS** |
| `frontend.test.js` | 9 tests | `✔ 9 pass, 0 fail (2.8ms)` | **PASS** |

*Tất cả 18 test cases con thuộc 4 file unit test cũ khi chạy lại đều tiếp tục giữ kết quả **PASS 100%**.*

---

## 3. So sánh Hành vi Trước vs Hiện tại (Behavior Comparison)

| Khu vực chức năng | Hành vi trước đây (Legacy) | Hành vi hiện tại (Current Baseline 24/09/2026) | Đánh giá hồi quy |
|:---|:---|:---|:---:|
| **Secret Management** | Sử dụng chuỗi secret hardcode (`seedAdminPassword`, `admin123`) trong source | 100% nạp từ biến môi trường qua `process.env` và Zod schema; file test `no-backdoor` xác nhận không còn chuỗi secret cũ | **CẢI THIỆN / AN TOÀN** |
| **Password Hashing** | Sử dụng thư viện `bcryptjs` với nguy cơ unhandled promise rejection khi auto-upgrade | Loại bỏ hoàn toàn bcrypt; chuẩn hóa duy nhất thuật toán **Argon2id** trong `src/lib/password.js` | **CẢI THIỆN / AN TOÀN** |
| **Login Throttle** | Lưu trữ số lần thử sai trực tiếp trên bảng `users` | Tách biệt hoàn toàn sang bảng riêng `login_throttle`, ghi nhận độc lập theo `email:<sha256>` và `ip:<ip>` | **BẢO TOÀN NGHIỆP VỤ** |
| **Ownership Isolation** | Rải rác câu lệnh WHERE ở từng truy vấn | Tập trung hóa điều kiện lọc qua hàm duy nhất `scopeByOwner` trong `src/db/scope.js` | **BẢO TOÀN NGHIỆP VỤ** |
| **Token Storage** | Có nguy cơ lưu JWT vào `localStorage` | Không lưu trữ token trong bất kỳ storage nào ở client; sử dụng cookie HttpOnly | **CẢI THIỆN / AN TOÀN** |

---

## 4. Lỗi Hồi quy (Regression Defects)

- **Số lượng Regression Defect phát hiện**: **0**.
- Không phát hiện bất kỳ lỗi hồi quy nào trong logic nghiệp vụ hoặc mã nguồn hiện hành.
- Các vấn đề phát sinh hiện tại (`BUG-01` đến `BUG-05`) hoàn toàn xuất phát từ việc thiếu cấu hình môi trường máy test (Docker, PostgreSQL service, `node_modules` sync).

---

## 5. Trạng thái Hồi quy Tổng thể (Regression Status)

- **Logic & Unit Tests**: **PASS** (18/18 test cases xanh).
- **Runtime Live Regression**: **BLOCKED** do rào cản môi trường (`BUG-01`, `BUG-02`, `BUG-03`).
- **Kết luận**: Hệ thống không bị hồi quy mã nguồn so với các baseline trước đó.
