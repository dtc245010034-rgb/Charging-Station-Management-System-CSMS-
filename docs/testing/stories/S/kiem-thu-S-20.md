# Hồ sơ kiểm thử S-20 (GYM-46)

**Tính năng:** Bỏ qua số đo lùi hoặc trùng mốc trong `MeterValues`
**Phạm vi:** T-42 (quy tắc số đo), T-43 (kiểm thử)
**Trạng thái:** Các AC S-20 đã có unit test và kiểm thử WebSocket + PostgreSQL đạt. Bộ integration toàn dự án còn một test S-17 không liên quan bị lỗi do timestamp cố định quá hạn.

## Tiêu chí và bằng chứng

| Ca | Kết quả mong đợi | Bằng chứng hiện có |
|---|---|---|
| Mốc số đo cũ hơn mẫu gần nhất trong cùng measurand/phase/context | Bỏ qua, ghi cảnh báo | Unit test quy tắc thuần và unit test handler |
| Cùng mốc, cùng giá trị | Bỏ qua im lặng | Unit test quy tắc và kiểm tra logger handler |
| Cùng mốc, giá trị khác | Giữ mẫu đã có, bỏ mẫu mới, ghi cảnh báo | Unit test quy tắc và kiểm tra logger handler |
| Mốc mới hơn, Energy giảm | Lưu mẫu, đặt `needs_review`, thêm `METER_VALUE_DECREASE` | Unit test quy tắc và ca WebSocket + DB |
| Mốc mới hơn nhưng Energy, Power hoặc Current giảm | Lưu số đo và đánh dấu phiên cần xem xét | Unit test quy tắc và ca WebSocket + DB |
| Mẫu Wh/kWh, số lớn và số 0 | So sánh chính xác, không dựa vào làm tròn số thực | Unit test quy tắc |
| Đồng hồ trụ lệch quá 24 giờ | Không dùng thời gian không đáng tin để loại nhầm các mẫu cùng batch; vẫn đánh dấu `CLOCK_SKEW` | Unit test và ca WebSocket + DB |
| Hai tin đến đồng thời trên cùng phiên | Khóa hàng phiên trước khi đọc mẫu gần nhất và ghi trong transaction | Unit test xác nhận khóa; integration test xác nhận transaction/ghi dữ liệu trên PostgreSQL |

## Lệnh kiểm thử và kết quả

| Lệnh | Kết quả |
|---|---|
| Tại `backend/`: `node --test tests\unit\meter-rules.test.js tests\unit\meter-values.repository.test.js tests\unit\ocpp-meter-values.test.js` | **PASS** — 26 tests, 0 failures |
| Tại thư mục gốc: `python test.py --only unit` | **PASS** — 199 tests, 0 failures |
| Tại thư mục gốc: `python test.py --file tests/integration/S-19.meter-values-server.test.js` | **PASS** — 13 tests, 0 failures (Docker, WebSocket + PostgreSQL) |
| Tại thư mục gốc: `python test.py --only integration` | **PARTIAL** — 202 passed, 1 failed, 1 skipped. Lỗi duy nhất ở S-17 AC1: test hard-code `2026-10-07T10:00Z`, quá 24 giờ so với thời điểm chạy ngày 08/10, nên S-17 đúng ra đặt `needs_review=true` do D6 trong khi test đòi `false`. Không liên quan tới S-20. |
| Tại thư mục gốc: `python test.py --only acceptance` | **PASS** — 110 tests, 0 failures |
| Tại thư mục gốc: `python test.py --lint-only` | **PASS** |
| Tại thư mục gốc: `python test.py` | **BLOCKED trước khi chạy backend tests** — self-test `tools/test_run.py` gặp `EOFError` do test `wipe_stale_data` đọc `input()` không được giả lập trong test không tương tác. Các nhóm unit/integration/acceptance/lint đã chạy riêng như trên. |

## Vấn đề phát hiện và xử lý

- Unit test ban đầu phát hiện chiều so sánh năng lượng bị đảo, khiến số đo giảm không được đánh dấu. Đã sửa để so sánh số thập phân chính xác.
- Unit test cho giá trị 0 phát hiện lỗi chuẩn hóa số 0 có phần thập phân; đã sửa và thêm kiểm thử hồi quy.
- Rà soát D6 phát hiện các mẫu trong cùng payload có đồng hồ lệch sẽ cùng được chuẩn hóa thành giờ nhận, có thể khiến S-20 nhầm chúng là trùng/conflict. Các mẫu lệch giờ hiện không dùng làm bằng chứng thứ tự; truy vấn mẫu gần nhất chỉ dùng các mẫu có `reported_at = sampled_at`. Đã thêm ca unit và tích hợp hồi quy.
- Rà soát đầu vào phát hiện scientific notation với số mũ cực lớn có thể làm phép so sánh exact tạo `BigInt` bất thường. Đã giới hạn độ dài chuỗi và số mũ; đầu vào vượt mức bị từ chối bằng `PropertyConstraintViolation`.
- Đối chiếu AC phát hiện code ban đầu chỉ gắn cờ khi Energy giảm, trong khi Sprint 3 không giới hạn measurand. Đã áp dụng cho mọi measurand có đơn vị so sánh được, thêm test Power/Current ở unit và WebSocket + DB.

## Việc cần làm trước khi nghiệm thu

1. Sửa test fixture S-17 dùng thời gian tương đối để toàn bộ integration suite xanh; sửa self-test `tools/test_run.py` để mock `input()` nếu cần dùng lệnh gộp `python test.py` không tương tác.
2. Đo p95 theo yêu cầu D5 trong bài kiểm tra tải 20 trụ trên môi trường phù hợp.
