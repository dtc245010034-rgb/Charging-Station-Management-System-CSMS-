# Kịch bản Demo CSMS — Chặng 9 & Đóng Dự Án

> Thời lượng dự kiến: 15–20 phút.
> Thẻ tính năng nghiệm thu: S-45 (Hạn mức công suất theo giờ), S-50 (Phí không đến và quá hạn đặt chỗ), S-51 (Huỷ chỗ đặt), S-65 (Gói thuê bao tháng).
> Chuẩn bị trước demo: Xem [`docs/demo/CHECKLIST-TRUOC-DEMO.md`](CHECKLIST-TRUOC-DEMO.md).

---

## 1. Dàn ý theo 5 vai trò (Persona Flow)

```
[1. TÀI XẾ] ────► [2. CHỦ TRẠM] ────► [3. VẬN HÀNH] ────► [4. KẾ TOÁN] ────► [5. QUẢN TRỊ]
 (Đặt chỗ, huỷ,   (Đặt hạn mức      (Giám sát trụ     (Đối soát kỳ,     (Audit log,
  mua gói tháng,    theo giờ, xem     trực tiếp,        bảng kê chia      bảo mật K1-K12,
  sạc giá ưu đãi)   phí không đến)    công suất sạc)    doanh thu S-54)   đóng dự án)
```

---

## 2. Các bước trình diễn chi tiết

### BƯỚC 1: TÀI XẾ (Driver) — Mua gói tháng & Trải nghiệm sạc ưu đãi
* **Tài khoản:** `demo.driver@csms.local` / Mật khẩu: `$DEMO_PASSWORD`
* **Màn hình:** «Ví của tôi» (`#/driver/wallet`) & «Tìm trạm» (`#/driver/find`)
* **Thao tác:**
  1. Vào màn hình **Ví**: Cho người xem thấy số dư hiện tại (> 900.000 đ) và danh mục **Gói thuê bao tháng**.
  2. Bấm **Mua gói**: Chọn «Gói Tháng Tiết Kiệm 3.500» (300.000 đ/30 ngày).
     * *Kết quả:* Số dư ví bị trừ 300.000 đ qua dòng sổ cái `SUBSCRIPTION_FEE`. Xuất hiện thẻ «Gói đang dùng: Gói Tháng Tiết Kiệm 3.500 (Đang hiệu lực)».
  3. Vào màn hình **Tìm trạm / Đặt chỗ**: Tìm «Trạm Sạc Bến Thành - Q1».
     * Thấy mức phí không đến niêm yết rõ: `20.000 đ`. Bấm **Đặt chỗ** cổng 1.
  4. Đổi ý: Bấm **Huỷ đặt chỗ** tại trang «Đặt chỗ của tôi» (`#/driver/find`).
     * *Kết quả (S-51):* Chỗ đặt chuyển sang `CANCELLED`, đầu nối mở lại `Available`, ví không bị trừ phí.
  5. Xem **Lịch sử & Hoá đơn** phiên sạc cũ:
     * *Kết quả (S-65):* Hoá đơn ghi rõ nhãn xanh `Áp dụng gói: Gói Tháng Tiết Kiệm 3.500`, đơn giá tính theo biểu giá gói 3.500 đ/kWh thay vì biểu giá trạm 3.850 đ/kWh.
* **Phương án dự phòng (Nếu hỏng):** Nếu kết nối mạng chậm, mở phiên kiểm khói tự động `node tools/demo-smoke.js` để đối chiếu kết quả API.

---

### BƯỚC 2: CHỦ TRẠM (Station Owner) — Hạn mức theo giờ & Cấu hình phí
* **Tài khoản:** `demo.owner1@csms.local` / Mật khẩu: `$DEMO_PASSWORD`
* **Màn hình:** «Trạm sạc của tôi» (`#/owner/stations`)
* **Thao tác:**
  1. Mở drawer cấu hình «Trạm Sạc Bến Thành - Q1».
  2. Xem mục **Hạn mức theo khung giờ (S-45)**:
     * Hiện đang có khung giờ cao điểm `17:00 – 20:00` hạ công suất còn `15 kW` (hạn mức nền `30 kW`).
  3. Thao tác thêm khung giờ mới hoặc thử khung qua nửa đêm:
     * Nhập `22:00 – 06:00` và bấm nút **Qua nửa đêm**.
     * *Kết quả:* Hệ thống tự động tách thành 2 khung hợp lệ `22:00 – 24:00` và `00:00 – 06:00` theo quy tắc K10/Mục 3.1.
  4. Xem trường **Phí không đến khi đặt chỗ (S-50)**: Đang cấu hình `20.000 đ`.
* **Phương án dự phòng:** Khung giờ bị trùng lặp sẽ bị PostgreSQL `btree_gist EXCLUDE` chặn với mã 409 Conflict.

---

### BƯỚC 3: VẬN HÀNH VIÊN (Operator) — Giám sát trụ & Cân bằng phụ tải
* **Tài khoản:** `demo.operator@csms.local` / Mật khẩu: `$DEMO_PASSWORD`
* **Màn hình:** «Trạng thái trụ» (`#/operator/fleet-status`) & «Phiên sạc» (`#/operator/sessions`)
* **Thao tác:**
  1. Xem danh sách các trụ `CP-DEMO-BT-01`, `CP-DEMO-LM-01` trạng thái `ONLINE`.
  2. Minh hoạ cơ chế rebalance: Khi đồng hồ chuyển sang khung giờ cao điểm, job nền `power/schedule-job.js` tự động tính `effectiveLimitW` và phát lệnh `SetChargingProfile` chia đều công suất cho các xe đang sạc mà không làm gián đoạn phiên.
* **Phương án dự phòng:** Mở file log tiến trình server để xem dòng log `[schedule-job] rebalanced station ...`.

---

### BƯỚC 4: KẾ TOÁN VIÊN (Accountant) — Đối soát & Bảng kê chia sẻ doanh thu
* **Tài khoản:** `demo.accountant@csms.local` / Mật khẩu: `$DEMO_PASSWORD`
* **Màn hình:** «Đối soát» (`#/accountant/reconciliation`) & «Bảng kê đối tác» (`#/accountant/settlements`)
* **Thao tác:**
  1. Vào màn hình **Đối soát**: Chạy đối soát kỳ hiện tại.
     * *Kết quả (G09):* 0 lỗi đối soát (`issueCount = 0`). Hoá đơn tính theo biểu giá gói khớp 100% với số đo điện năng và số tiền trừ ví.
  2. Vào màn hình **Bảng kê đối tác (S-54)**:
     * Xem bảng phân chia doanh thu theo tỷ lệ đã cấu hình (85% cho Chủ trạm Bến Thành, 90% cho Landmark 81).
* **Phương án dự phòng:** Mở kết quả chạy test nghiệm thu `S-65.subscription.test.js` ca G09 đã chứng minh đối soát 0 lỗi.

---

### BƯỚC 5: QUẢN TRỊ VIÊN (Admin) — Nhật ký kiểm toán & An toàn dữ liệu
* **Tài khoản:** `demo.admin@csms.local` / Mật khẩu: `$DEMO_PASSWORD`
* **Màn hình:** «Nhật ký điều khiển (Audit Logs)» (`#/admin/control-log`)
* **Thao tác:**
  1. Mở nhật ký kiểm toán: Xem các bản ghi vừa phát sinh trong buổi demo:
     * `SUBSCRIPTION_PURCHASED` (Tài xế mua gói)
     * `RESERVATION_CANCELLED` (Tài xế huỷ chỗ)
     * `POWER_WINDOW_CREATED` (Chủ trạm tạo khung giờ)
  2. Minh hoạ tuân thủ **Nghị định 13 & K6**: Metadata kiểm toán KHÔNG chứa toạ độ GPS thật, mã thẻ RFID bị che giấu (`TAG-***`), mật khẩu không lưu bản rõ.
* **Phương án dự phòng:** Mở màn hình danh sách tài khoản (`#/admin/users`) để chứng minh hệ thống phân quyền RBAC đa người dùng.

---

## 3. Tổng kết chuyển giao
* Xác nhận 4 tính năng Chặng 9 (S-45, S-50, S-51, S-65) đã hoạt động đồng bộ trên giao diện và API.
* Mời PO và Hội đồng đặt câu hỏi.
