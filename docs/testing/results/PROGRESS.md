# MA TRẬN TIẾN ĐỘ KIỂM THỬ & AUDIT — CSMS (S-01 → S-20)

> Cập nhật: **09/10/2026**  
> Nhánh: `nam/gymxx_tester_audit_docs`  
> Commit cơ sở: `9f544e7` (Merge pull request #96 from dtc245010034-rgb/lam/GYM46_S_20)  
> Kết quả chạy hồi quy cơ sở (`python test.py`): **520 pass, 0 fail, 1 skip, 0 todo (521 tests / 113 suites)**.  
> Quét phụ thuộc (`npm audit`): **0 vulnerabilities**.  
> Lint (`npm run lint`): **Sạch (0 lỗi, 0 cảnh báo)**.  

---

## 1. Ma trận Story × Trạng thái (S-01 → S-20 & Tầng Web)

| Story | Task | Tên Story | Backend / Core | UI / Web | Lần kiểm cuối | Lỗi mở (BUG/VULN) | Ghi chú & Hồ sơ kiểm thử |
|---|---|---|:---:|:---:|:---:|:---:|---|
| **S-01** | GYM-7 | Khung ứng dụng chạy được trên máy cá nhân | **PASS** | **PASS** | 2026-10-09 | 0 | Chạy sạch qua Docker, migration tiến/lùi đạt. Trang chủ HTTP 200. |
| **S-02** | GYM-8 | Đăng nhập email + mật khẩu, khoá tạm khi sai | **PASS** | **PASS** | 2026-10-09 | 0 | Khoá 15p sau 5 lần sai, form báo lỗi chung, điều hướng vai trò. |
| **S-03** | GYM-9 | Phân quyền vai trò, cô lập dữ liệu theo chủ | **PASS** | **PASS** | 2026-10-09 | 0 | RBAC 5 vai trò, route chưa khai quyền bị chặn mặc định. |
| **S-04** | GYM-10 | Chủ trạm tạo và sửa trạm | **PASS** | **PARTIAL** | 2026-10-09 | 1 (VULN) | Chống lưu trùng đạt; **Lỗi Stored XSS** trong Leaflet tooltip ([VULN-S04-FE01](../bugs/VULN-S04-FE01.md)). |
| **S-05** | GYM-11 | Thêm trụ và đầu nối, mã trụ duy nhất | **PASS** | **PASS** | 2026-10-09 | 0 | Mã chữ hoa, 1-4 đầu nối, chặn trùng mã tại form và server. |
| **S-06** | GYM-32 | Trụ đã đăng ký kết nối, trụ lạ bị từ chối | **PASS** | N/A | 2026-10-09 | 0 (B5 accepted) | Subprotocol ocpp1.6, mã lạ từ chối đóng kết nối trong 1s. B5 chấp nhận rủi ro cho demo. |
| **S-07** | GYM-33 | Đọc/ghi đúng ba loại khung OCPP | **PASS** | N/A | 2026-10-09 | 0 | Khung sai schema trả CALLERROR, kết nối giữ mở. |
| **S-08** | GYM-34 | `BootNotification` | **PASS** | N/A | 2026-10-09 | 0 | Lưu vendor/model/firmware, trả UTC server time. |
| **S-09** | GYM-35 | Nhịp tim (`Heartbeat`), liên lạc cuối | **PASS** | N/A | 2026-10-09 | 0 | Cập nhật `last_seen_at` theo giờ DB. 1 test T-19 skip do môi trường test container thiếu Docker CLI. |
| **S-10** | GYM-36 | `StatusNotification` | **PASS** | N/A | 2026-10-09 | 0 | Lưu 9 trạng thái OCPP ra 4 trạng thái nội bộ, khử trùng lỗi. |
| **S-11** | GYM-37 | Màn hình trạng thái mọi trụ & SSE | **PASS** | **PASS** | 2026-10-09 | 0 | Cây 3 tầng 1 query, SSE cô lập theo chủ trạm, UI bảng & thẻ drawer. |
| **S-12** | GYM-38 | Quá hạn nhịp tim → ngoại tuyến | **PASS** | **PASS** | 2026-10-09 | 0 | Cờ offline suy ra từ `last_seen_at`, UI hiển thị mốc liên lạc cuối. |
| **S-13** | GYM-39 | Trùng mã trụ → đóng kết nối cũ | **PASS** | N/A | 2026-10-09 | 0 | Registry quản lý 1 socket sống duy nhất / mã trụ. |
| **S-14** | GYM-40 | Chống xử lý trùng tin nhắn (`messageId`) | **PASS** | N/A | 2026-10-09 | 0 | Cửa sổ replay 600s, lưu khoá DB `(charge_point_id, message_id)`. |
| **S-15** | GYM-41 | Xác thực thẻ qua `Authorize` | **PASS** | N/A | 2026-10-09 | 0 | Bảng `id_tags`, hàm `evaluateIdTag`, che mã thẻ trong log. |
