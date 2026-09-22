# BÁO CÁO KIỂM THỬ HỒI QUY (REGRESSION REPORT) — CSMS

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Người thực hiện**: Nguyễn Hà Nam (Developer / QA — Team-Codegym)  
> **Giai đoạn**: Giai đoạn 4 — Kiểm thử toàn bộ & Phân tích hồi quy  
> **Ngày thực hiện**: 2026-09-22  

---

## 1. Mục tiêu kiểm thử hồi quy

Đảm bảo rằng việc bổ sung 3 file Unit Test mới ([`auth.unit.test.js`](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS--main/Charging-Station-Management-System-CSMS--main/backend/tests/auth.unit.test.js), [`billing_session.unit.test.js`](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS--main/Charging-Station-Management-System-CSMS--main/backend/tests/billing_session.unit.test.js), [`ocpp.unit.test.js`](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS--main/Charging-Station-Management-System-CSMS--main/backend/tests/ocpp.unit.test.js)) và tài liệu kiểm thử:
1. Không làm hỏng hoặc thay đổi kết quả của các test case ban đầu trong [`test-auth.js`](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS--main/Charging-Station-Management-System-CSMS--main/backend/test-auth.js).
2. Không gây ra bất kỳ tác dụng phụ (side-effects) hoặc thay đổi ngầm nào trên production code.

---

## 2. Bảng đối chiếu kết quả kiểm thử hồi quy (Baseline vs Current)

| Test ID | Tên kịch bản kiểm thử | File Test | Trạng thái trước (Sprint 1) | Trạng thái hiện tại (Sprint 2) | Có lỗi hồi quy (Regression)? |
|:---|:---|:---|:---:|:---:|:---:|
| **EXT-01** | Argon2id password hash verification | `backend/test-auth.js` | **PASS** | **PASS** | **KHÔNG** |
| **EXT-02** | 5-attempt account lockout logic | `backend/test-auth.js` | **PASS** | **PASS** | **KHÔNG** |
| **EXT-03** | 5 standard RBAC roles configured | `backend/test-auth.js` | **PASS** | **PASS** | **KHÔNG** |
| **EXT-04** | httpOnly cookie auth & 401 token expiry | `backend/test-auth.js` | **PASS** | **PASS** | **KHÔNG** |

---

## 3. Tương tác chéo giữa Test cũ và Test mới

- Lệnh chạy test gốc của dự án (`npm test` -> `node test-auth.js`) hoạt động hoàn toàn bình thường, trả về exit code 0.
- Lệnh chạy toàn bộ test suite (`node --test test-auth.js tests/*.unit.test.js`) chạy đồng thời cả test cũ và test mới mà không xảy ra xung đột tài nguyên hay unhandled rejection.

---

## 4. Kết luận kiểm thử hồi quy

**KẾT QUẢ: PASS (Không phát hiện lỗi hồi quy nào).**  
Toàn bộ các ca kiểm thử ban đầu vẫn giữ nguyên tính đúng đắn 100%.
