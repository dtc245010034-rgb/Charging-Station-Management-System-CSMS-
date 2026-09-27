# Ghi nhận gửi PO — S-05 AC3 chưa đạt được trong Sprint 1

> Soạn kèm spike K-01 (`GYM-12`) vì cùng nguyên nhân gốc: dự án chưa có bảng lưu phiên sạc.
> Mục đích: xin PO xác nhận hoãn AC3 sang Sprint 3, không phải xin lỗi hay xin thêm thời gian Sprint 1.

## AC3 yêu cầu gì

`S-05 AC3`: đã có phiên sạc thì chặn đổi mã trụ.

## Vì sao chưa đạt

- Cơ sở dữ liệu (`backend/migrations/`) chưa có bảng nào cho phiên sạc.
- Điều kiện chặn hiện tại (`charge-points.service.js`) dựa vào `connection-registry.js` — một `Map` trong
  bộ nhớ RAM, đánh dấu trụ "đang có kết nối WebSocket", không phải "đang có phiên sạc".
- Hai điều đó không tương đương: trụ mất kết nối (rớt mạng) hoặc server khởi động lại thì bảng ghi nhớ
  trong RAM mất, và mã trụ đổi được — dù trên lý thuyết phiên sạc đó vẫn có thể coi là đang diễn ra.
- Đã kiểm thật: cùng một trụ, lúc còn kết nối đổi mã → 409; sau khi mất kết nối hoặc restart server, đổi
  mã cùng trụ → 200.

## Đề xuất

Hoãn AC3 sang Sprint 3, khi có bảng phiên sạc thật (Product Goal Sprint 3: "một phiên sạc chạy trọn vẹn
từ cắm tới rút với số kWh đúng, dù trụ mất kết nối giữa chừng" — chặn đổi mã khi có phiên sạc nên dùng
đúng bảng đó, không nên làm tạm bằng RAM rồi phải viết lại.

## Cần PO xác nhận

- [ ] Đồng ý hoãn S-05 AC3 sang Sprint 3.
- [ ] Hoặc: có bảng phiên sạc tối thiểu ngay trong Sprint 1 (ngoài phạm vi 1 SP đã chốt cho S-05, cần ước
      lượng lại điểm).
