# BÁO CÁO KIỂM THỬ HỒI QUY (REGRESSION REPORT) — CSMS

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Người thực hiện**: TESTER / QA ANALYST  
> **Phiên bản snapshot**: 26/09/2026 (Nhánh `main`, commit `68d877799eb407b0421ca44a82514f9f4c639193`)  
> **Phạm vi**: Đánh giá hồi quy chức năng của các Story S-01, S-02, S-03 khi tích hợp tính năng Quản lý trạm sạc S-04 / T-08 / T-09 và Migration 004.  

---

## 1. Danh sách Kiểm thử Hồi quy Hiện tại (Current Regression Tests)

- `tests/unit/no-backdoor.test.js`: Kiểm tra hồi quy việc loại bỏ hoàn toàn các backdoor, hardcoded secret, và dependency không an toàn.
- `tests/unit/nodeVersion.test.js`: Kiểm tra hồi quy tính tương thích phiên bản Node.js (>= 22.7.0).
- `tests/unit/scope.test.js`: Kiểm tra hồi quy hàm điều kiện lọc sở hữu `scopeByOwner` cho từng vai trò (`ADMIN`, `STATION_OWNER`, `OPERATOR`).
- `tests/unit/frontend.test.js`: Kiểm tra hồi quy form validate, fetcher headers, token storage check, 401 auto-redirect, và điều hướng router theo vai trò.
- `tests/acceptance/S-03.rbac.test.js`: Kiểm tra hồi quy cô lập dữ liệu trạm giữa Owner A và Owner B trên môi trường CSDL thực tế.
- `tests/acceptance/S-03.rbac-matrix.test.js`: Kiểm tra toàn bộ ma trận quyền đối với các endpoint trạm và trụ sạc.
- `tests/acceptance/S-03.route-guard.test.js`: Kiểm tra Route Guard Default Deny.
- `tests/acceptance/S-03.accounts.test.js`: Kiểm tra tạo tài khoản và phân vai trò.
- `tests/integration/migrate.test.js`: Kiểm tra chu trình migration tiến và lùi từ 001 đến 004.

---

## 2. Kết quả Thực thi Kiểm thử Cũ (Test cũ chạy lại có còn PASS không)

| Regression Suite | Số lượng test | Kết quả chạy lại (26/09/2026) | Trạng thái |
|:---|:---:|:---:|:---:|
| `no-backdoor.test.js` | 3 tests | `✔ 3 pass, 0 fail (6.4ms)` | **PASS** |
| `nodeVersion.test.js` | 2 tests | `✔ 2 pass, 0 fail (1.6ms)` | **PASS** |
| `scope.test.js` | 4 tests | `✔ 4 pass, 0 fail (2.8ms)` | **PASS** |
| `frontend.test.js` | 9 tests | `✔ 9 pass, 0 fail (5.4ms)` | **PASS** |
| `S-03.rbac.test.js` | 9 tests | `✔ 9 pass, 0 fail (843.8ms)` | **PASS** |
| `S-03.rbac-matrix.test.js` | 11 tests | `✔ 11 pass, 0 fail (803.5ms)` | **PASS** |
| `S-03.route-guard.test.js` | 7 tests | `✔ 7 pass, 0 fail (380.0ms)` | **PASS** |
| `S-03.accounts.test.js` | 8 tests | `✔ 8 pass, 0 fail (1870.4ms)` | **PASS** |
| `migrate.test.js` | 3 tests | `✔ 3 pass, 0 fail (2081.7ms)` | **PASS** |

*Tất cả 56 test cases kiểm thử hồi quy chạy lại đều đạt kết quả **PASS 100%**.*

---

## 3. So sánh Hành vi Trước vs Hiện tại (Behavior Comparison)

| Khu vực chức năng | Hành vi trước đây (Sprint 1 S-03) | Hành vi hiện tại (Sprint 1 S-04 Snapshot) | Đánh giá hồi quy |
|:---|:---|:---|:---:|
| **Station Coordinates** | Tọa độ `latitude`, `longitude` không giới hạn dải số, độ chính xác mặc định `NUMERIC` | Chuẩn hóa `NUMERIC(10,8)` và `NUMERIC(11,8)`; ràng buộc CHECK $[-90, 90]$ và $[-180, 180]$ | **CẢI THIỆN / ĐẠT CHUẨN** |
| **New Station Status** | Trạm mới mặc định mang trạng thái `ACTIVE` | Trạm mới tạo bắt buộc mặc định ở trạng thái `INACTIVE` theo S04-AC-01 | **BẢO ĐẢM AC** |
| **Active Coordinate Guard**| Cho phép đổi tọa độ bất kỳ lúc nào | Chặn đổi tọa độ khi trạm đang ở trạng thái `ACTIVE` (yêu cầu chuyển về `INACTIVE` trước) | **TĂNG CƯỜNG BẢO VỆ** |
| **Creation Concurrency** | Không có cơ chế chống tạo trùng lặp khi người dùng click đúp | Tích hợp bảng `idempotency_keys` và `pg_advisory_xact_lock` replay request tạo trạm | **CẢI THIỆN / AN TOÀN** |
| **Owner FK Deletion** | Khóa ngoại `stations.owner_id` dùng `ON DELETE CASCADE` | Nâng cấp lên `ON DELETE RESTRICT` ngăn ngừa mất dữ liệu trạm khi xóa tài khoản | **BẢO TOÀN DỮ LIỆU** |
| **UI Management Form** | Chỉ có placeholder, chưa có form nhập liệu và bản đồ | Hoàn thiện dialog tạo/sửa trạm với Leaflet map, hiển thị lỗi tại ô và nút disabled | **HOÀN THIỆN TÍNH NĂNG** |

---

## 4. Lỗi Hồi quy (Regression Defects)

- **Số lượng Regression Defect phát hiện**: **0**.
- Không phát hiện bất kỳ lỗi hồi quy nào trong logic nghiệp vụ hay mã nguồn hiện hành. Việc cập nhật Migration 004 không làm sai lệch tính cô lập dữ liệu theo vai trò chủ trạm.

---

## 5. Trạng thái Hồi quy Tổng thể (Regression Status)

- **Hồi quy Logic & Unit/Acceptance Tests**: **PASS** (56/56 test cases xanh).
- **Hồi quy Live Container & Database**: **PASS** (chạy trực tiếp trên PostgreSQL test container 5433).
- **Kết luận**: Tính năng S-04 / T-08 / T-09 tương thích hoàn toàn với nền tảng S-01, S-02, S-03 hiện có; hệ thống không bị hồi quy.
