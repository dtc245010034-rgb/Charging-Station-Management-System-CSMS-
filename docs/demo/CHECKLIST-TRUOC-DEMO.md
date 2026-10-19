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
- [ ] **Kiểm tra Unit Tests**: Chạy `python test.py --only unit` -> KẾT QUẢ: ĐẠT (không còn test đỏ).
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
  cd backend
  ALLOW_DEMO_SEED=1 npm run seed-demo      # cần DATABASE_URL trỏ đúng CSDL demo và DEMO_PASSWORD (>= 12 ký tự)
  ```
  Xác nhận in ra dòng `Seed demo xong: ...` và `Dữ liệu nền mới: ...`. Đây là bộ seed duy nhất; chạy lại lần hai phải in `0 tài khoản mới, 0 trạm mới, 0 trụ mới` và `0 biểu giá, 0 khung công suất, 0 lần nạp ví, 0 gói thuê bao`.
- [ ] **Chạy kiểm khói toàn diện qua API thật**:
  ```bash
  node tools/demo-smoke.js     # cần server đang chạy và cùng DEMO_PASSWORD
  ```
  Xác nhận in ra: `KẾT QUẢ KIỂM KHÓI: 6/6 NHÓM ĐẠT (PASS)` (thoát mã khác 0 nếu có nhóm lỗi).

---

## 4. Kiểm tra trình duyệt & Thiết bị (T - 5 phút)
- [ ] Mở trình duyệt web (Google Chrome hoặc Firefox) ở chế độ Ẩn danh (Incognito) để tránh cache cũ.
- [ ] Mở sẵn địa chỉ ứng dụng: `http://localhost:3000`.
- [ ] Mở sẵn tài liệu [`KICH-BAN-DEMO.md`](KICH-BAN-DEMO.md) trên màn hình thứ hai để theo dõi.
- [ ] Chuẩn bị sẵn danh sách tài khoản demo:
  * Quản trị: `admin@demo.csms.local`
  * Kế toán: `accountant@demo.csms.local`
  * Vận hành: `operator@demo.csms.local`
  * Chủ trạm: `owner@demo.csms.local` (và `owner2@demo.csms.local`)
  * Tài xế: `driver@demo.csms.local`
  * Mật khẩu: `$DEMO_PASSWORD`
