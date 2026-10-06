# Kiểm tra dự án – lần 10 (05/10/2026 buổi chiều, `main` = a00100c, PR #87)

## Kết luận: đủ điều kiện kết thúc Sprint 2 (chỉ cần kéo S-16 sang Done)
- `main` = `a00100c`: so với `0f61792` (đã kiểm) chỉ thêm 4 file tài liệu (PR #87), không đổi mã.
- Lint sạch. Test: **426 chạy, 425 pass, 1 fail** — T-19 (`S-09 T-19`, cần Docker), lỗi do môi trường như mọi lần. F14 (mốc ngày cứng) đã được PR #85 sửa; không còn test đỏ do thời gian.
- **S-16 chạy thật trên server (DB csms_chk), 16/16 ca**: 403 cho Chủ trạm/Tài xế/Kế toán, 401 khi chưa đăng nhập, trụ ngoại tuyến → 409 trong 5 ms, Soft/Hard → 200 `Accepted` và khung `[2,<uuid>,"Reset",{type}]` đúng, ADMIN cũng được, `type` lạ → 400, trụ không tồn tại → 404, trụ `Rejected` → 422, không trả lời → 504 sau đúng thời gian chờ (đặt 3 giây), `Heartbeat` vẫn được trả lời trong lúc chờ, kết nối vẫn sống sau hết giờ.
- **Nút Reset trên trình duyệt (Playwright):** Vận hành viên thấy nút, hộp thoại có Mềm/Cứng, bấm Hard → trụ nhận `Reset {type:Hard}` và có thông báo; Chủ trạm không thấy nút.
- Jira: 14/15 story Sprint 2 (GYM-7…41) đã Done; **GYM-42 (S-16) còn Review**. Mọi story của backlog đã có Parent (epic): 0 story không có epic.

## Còn lại (không chặn đóng Sprint 2)
- S-16 chưa ghi vết vào `audit_logs` (chỉ log ứng dụng): `audit_logs` có 0 dòng cho Reset (chỉ `CREATE`). Backlog (T-35) cho phép ghi tạm và giao việc chuẩn hoá cho T-57 (S-27, Sprint 3). `docs/SPRINT_STATUS.md` (mục 10) vẫn ghi “commit S-16 chưa qua PR” — đã lỗi thời sau PR #86.
- DoD “AC pass trên staging với trụ ảo chạy thật” vẫn chưa đạt (chưa có URL staging) — xem Q6 trong `SPRINT_3_PLAN.md`.
- B5 (xác thực trụ) vẫn mở, cần PO chốt trước Sprint 4.

## Phát hiện mới ảnh hưởng Sprint 3 (đã đo)
- **Giới hạn 50 tin/giây/kết nối đóng kết nối (mã 1008) khi trụ xả hàng đợi**: 400 `Heartbeat` tuần tự (~576 tin/giây) → bị đóng sau 49 tin. Trụ thật xả bộ đệm `MeterValues` sau khi mất mạng sẽ bị đá lặp lại → S-21 AC3 không thể đạt nếu không đổi (đề xuất token bucket, burst 500; xem D7).
- Chống trùng S-14 chỉ nhớ 600 giây → `StartTransaction` gửi lại muộn hơn sẽ sinh phiên thứ hai (D4). `Preparing → OCCUPIED` trong `status-mapping.js` làm kiểm tra “đầu nối rảnh” của S-24 chặn nhầm ca hợp lệ (D8). Bảng `audit_logs` đã có từ migration 001 nhưng T-57 viết như tạo mới (D10). Backlog không có task nào tạo bảng `orphan_messages`.
