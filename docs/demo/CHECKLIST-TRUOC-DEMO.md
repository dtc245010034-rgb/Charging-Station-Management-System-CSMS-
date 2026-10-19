# Checklist Trước Khi Demo (30 Phút)

> Tài liệu chuẩn bị bắt buộc dành cho đội ngũ kỹ thuật trước khi bắt đầu buổi demo sản phẩm với PO và Mentor.

---

## 1. Kiểm tra môi trường & Hạ tầng (T - 30 phút)
- [ ] **Docker Engine**: Đang chạy bình thường (`docker info` không báo lỗi).
- [ ] **Cơ sở dữ liệu**: PostgreSQL 16 sẵn sàng trên cổng dev.
- [ ] **Sao lưu an toàn**: Chạy lệnh sao lưu CSDL trước demo:
  ```bash
  bash tools/backup-db.sh
  ```
- [ ] **Biến môi trường**: Đặt biến `DEMO_PASSWORD` (ít nhất 12 ký tự, ví dụ: `DemoCsmsSecure2026!`):
  ```powershell
  # Trên Windows PowerShell:
  $env:DEMO_PASSWORD="DemoCsmsSecure2026!"
  ```

---

## 2. Kiểm tra chất lượng mã nguồn (T - 20 phút)
- [ ] **Kiểm tra Lint**: Chạy `python test.py --lint-only` -> KẾT QUẢ: ĐẠT.
- [ ] **Kiểm tra Unit Tests**: Chạy `python test.py --only unit` -> KẾT QUẢ: ĐẠT (504+ test pass).
- [ ] **Kiểm tra Acceptance Chặng 9**:
  ```bash
  python test.py --file tests/acceptance/S-45.power-windows.test.js
  python test.py --file tests/acceptance/S-50.reservation-expiry.test.js
  python test.py --file tests/acceptance/S-51.reservation-cancel.test.js
  python test.py --file tests/acceptance/S-65.subscription.test.js
  ```
  Tất cả 4 file nghiệm thu đều đạt 100% (XANH).

---

## 3. Khởi tạo dữ liệu mẫu (T - 15 phút)
- [ ] **Nạp dữ liệu mẫu Demo**:
  ```bash
  node tools/seed-demo.js
  ```
  Xác nhận in ra: `Khởi tạo dữ liệu mẫu Demo THÀNH CÔNG (Idempotent)`.
- [ ] **Chạy kiểm khói toàn diện qua API thật**:
  ```bash
  node tools/demo-smoke.js
  ```
  Xác nhận in ra: `KẾT QUẢ KIỂM KHÓI: 12/12 BƯỚC ĐẠT (PASS)`.

---

## 4. Kiểm tra trình duyệt & Thiết bị (T - 5 phút)
- [ ] Mở trình duyệt web (Google Chrome hoặc Firefox) ở chế độ Ẩn danh (Incognito) để tránh cache cũ.
- [ ] Mở sẵn địa chỉ ứng dụng: `http://localhost:3000`.
- [ ] Mở sẵn tài liệu [`KICH-BAN-DEMO.md`](KICH-BAN-DEMO.md) trên màn hình thứ hai để theo dõi.
- [ ] Chuẩn bị sẵn danh sách tài khoản demo:
  * Quản trị: `demo.admin@csms.local`
  * Kế toán: `demo.accountant@csms.local`
  * Vận hành: `demo.operator@csms.local`
  * Chủ trạm: `demo.owner1@csms.local`
  * Tài xế: `demo.driver@csms.local`
  * Mật khẩu: `$DEMO_PASSWORD`
