# Hồ sơ kiểm thử S-20 (GYM-46)

**Tính năng:** Bỏ qua số đo lùi hoặc trùng mốc trong `MeterValues`
**Phạm vi:** T-42 (quy tắc số đo), T-43 (kiểm thử)
**Trạng thái:** Đã mở rộng kiểm thử hồi quy cho các lỗi S20-1 đến S20-4; xác nhận quy tắc giảm chỉ áp dụng với bộ đếm năng lượng, Power/Current có thể giảm khi taper.

## Tiêu chí và bằng chứng

| Ca | Kết quả mong đợi | Bằng chứng hiện có |
|---|---|---|
| Mốc số đo cũ hơn mẫu gần nhất trong cùng measurand/phase/context | Bỏ qua, ghi cảnh báo | Unit test quy tắc thuần và unit test handler |
| Cùng mốc, cùng giá trị | Bỏ qua im lặng | Unit test quy tắc và kiểm tra logger handler |
| Cùng mốc, giá trị khác | Giữ mẫu đã có, bỏ mẫu mới, ghi cảnh báo | Unit test quy tắc và kiểm tra logger handler |
| Mốc mới hơn, Energy giảm | Lưu mẫu, đặt `needs_review`, thêm `METER_VALUE_DECREASE` | Unit test quy tắc và ca WebSocket + DB |
| Mốc mới hơn, Power hoặc Current giảm | Lưu mẫu, không tự đặt `needs_review` | Unit test quy tắc và ca WebSocket + DB |
| Mẫu Wh/kWh, số lớn và số 0 | So sánh chính xác, không dựa vào làm tròn số thực | Unit test quy tắc |
| Số âm, lớn hơn `1e12` (Energy quy về Wh), hoặc khác 0 nhỏ hơn `1e-12` | Từ chối bằng `PropertyConstraintViolation` trước khi ghi DB | Unit test và ca WebSocket + PostgreSQL với NUMERIC lịch sử rất lớn/rất nhỏ |
| Mẫu trong cùng payload đến ngược thứ tự | Sắp xếp theo `sampledAt`, lưu đủ mẫu theo thứ tự thời gian | Unit test handler và ca WebSocket + PostgreSQL |
| Đồng hồ trụ lệch quá 24 giờ | Không dùng thời gian không đáng tin để loại nhầm các mẫu cùng batch; vẫn đánh dấu `CLOCK_SKEW` | Unit test và ca WebSocket + DB |
| Hai tin đến đồng thời trên cùng phiên | Khóa hàng phiên trước khi đọc mẫu gần nhất và ghi trong transaction | Unit test xác nhận khóa; integration test xác nhận transaction/ghi dữ liệu trên PostgreSQL |

**Giới hạn đã thống nhất với PO:** chỉ `Energy.Active.Import.Register` là bộ đếm tích luỹ nên giá trị mới nhỏ hơn mới kích hoạt `METER_VALUE_DECREASE`. Power và Current được phép giảm, ví dụ khi công suất sạc taper. Chỉ sắp xếp mẫu nằm trong cùng payload; mẫu cũ đến ở tin sau vẫn bị bỏ qua theo AC hiện tại và chưa có kho đệm riêng để lưu/xử lý mẫu trễ (cần tính trong S-21).

## Lệnh kiểm thử và kết quả

| Lệnh | Kết quả |
|---|---|
| Tại thư mục gốc: `python test.py --only unit` | **PASS** — 202 tests, 0 failures |
| Tại thư mục gốc: `python test.py --file tests/integration/S-19.meter-values-server.test.js` | **PASS** — 15 tests, 0 failures (Docker, WebSocket + PostgreSQL) |
| Tại thư mục gốc: `python test.py` | **PASS** — 517 tests, 0 failures; gồm self-test Python, lint, unit, integration và acceptance |
| Tại `backend/`: `npm audit --omit=dev --audit-level=high` | **PASS** — 0 vulnerabilities |

## Vấn đề phát hiện và xử lý

- Unit test ban đầu phát hiện chiều so sánh năng lượng bị đảo, khiến số đo giảm không được đánh dấu. Đã sửa để so sánh số thập phân chính xác.
- Unit test cho giá trị 0 phát hiện lỗi chuẩn hóa số 0 có phần thập phân; đã sửa và thêm kiểm thử hồi quy.
- Rà soát D6 phát hiện các mẫu trong cùng payload có đồng hồ lệch sẽ cùng được chuẩn hóa thành giờ nhận, có thể khiến S-20 nhầm chúng là trùng/conflict. Các mẫu lệch giờ hiện không dùng làm bằng chứng thứ tự; truy vấn mẫu gần nhất chỉ dùng các mẫu có `reported_at = sampled_at`. Đã thêm ca unit và tích hợp hồi quy.
- Rà soát đầu vào phát hiện scientific notation cực lớn/nhỏ có thể làm phép so sánh exact thất bại sau khi PostgreSQL trả `NUMERIC` đã mở rộng. Đầu vào hiện bị giới hạn theo khoảng giá trị thực tế và parser nội bộ vẫn xử lý được chuỗi decimal dài từ dữ liệu cũ.
- PO xác nhận chỉ bộ đếm Energy giảm cần review; Power/Current giảm không cảnh báo để tránh đánh dấu các phiên taper bình thường. Đã cập nhật unit và WebSocket + DB.
- Mẫu không theo thứ tự trong một payload được sắp theo `sampledAt` trước khi đối chiếu. Mẫu trễ ở tin riêng vẫn bị bỏ hoàn toàn; đây là giới hạn chủ ý của AC hiện hành, không phải cơ chế lưu bù.

## Việc cần làm trước khi nghiệm thu

1. Đo p95 theo yêu cầu D5 trong bài kiểm tra tải 20 trụ trên môi trường phù hợp.
