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
