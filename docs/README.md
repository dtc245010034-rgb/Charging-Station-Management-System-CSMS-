# CSMS — Tài liệu dự án

Mục lục thư mục `docs/`. Muốn chạy hoặc demo dự án: đọc mục **Đang dùng**. Mục **Lịch sử** chỉ để tra cứu, nội dung dừng ở mốc ghi trong từng file.

## Đang dùng

| Thư mục | Nội dung | Điểm vào |
|---|---|---|
| [`demo/`](demo/) | Hướng dẫn demo, kịch bản, checklist trước buổi demo | [`demo/README.md`](demo/README.md), [`demo/TOAN-DU-AN.md`](demo/TOAN-DU-AN.md) |
| [`guides/`](guides/) | Vận hành (build, chạy, dừng, sao lưu, staging, biến môi trường) và đề xuất xác thực trụ B5 | [`guides/OPERATIONS.md`](guides/OPERATIONS.md) |
| [`project/`](project/) | Kế hoạch tới hết dự án, tổng kết 66 thẻ story, hợp đồng tính tiền, báo cáo bàn giao từng chặng | [`project/TONG-KET-DU-AN.md`](project/TONG-KET-DU-AN.md) |
| [`design/`](design/) | Đặc tả UX/UI Dashboard và ảnh chụp màn hình | [`design/README.md`](design/README.md) |
| [`testing/`](testing/) | Kiểm thử/QA: quy chuẩn, test case, báo cáo từng vòng | [`testing/README.md`](testing/README.md) |
| [`Audit/`](Audit/) | Kiểm toán độc lập | |

Báo cáo bàn giao từng chặng nằm ở [`project/handover/`](project/handover/) (`CHANG-01` … `CHANG-09`, `S-17`, `S-22`).

## Lịch sử

[`archive/`](archive/) giữ lại, không xoá:

- `SPRINT-2-PLAN.md`, `SPRINT-3-PLAN.md`, `SPRINT-STATUS.md`: kế hoạch và trạng thái Sprint 2–3 (dừng ở mốc 12/10/2026).
- `design/S15-S16-KE-HOACH.md`: kế hoạch S-15/S-16.
- `spikes/`: nghiên cứu K-01 (trụ ảo OCPP) và ghi nhận S-05 cho PO.

Trạng thái hiện tại của từng thẻ: xem [`project/TONG-KET-DU-AN.md`](project/TONG-KET-DU-AN.md), không xem `archive/`.

## Quy ước

- Tên file mới: viết HOA, nối bằng dấu gạch ngang (ví dụ `KICH-BAN-DEMO.md`).
- Chuyển hoặc đổi tên file: chạy `node tools/check-docs.js`, và quét lại link `.md` bị gãy.
- `testing/` và `Audit/` thuộc vai trò kiểm thử: không sửa nội dung nếu không được giao.
