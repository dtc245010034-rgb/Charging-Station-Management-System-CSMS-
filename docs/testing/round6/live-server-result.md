# Kết quả verify-round6-live

Tổng 93 dòng: 93 ok, 0 FAIL | 36.5s | Node v22.23.3 | DB csms_r6live_chk (đã DROP)

| # | Khu vực | Kỳ vọng | Quan sát | KQ |
|---|---|---|---|---|
| 1 | A | GET /api/health → 200 ok:true | HTTP 200 | ok |
| 2 | A | Chưa đăng nhập GET /stations → 401 | HTTP 401 | ok |
| 3 | A | Sai mật khẩu → 401, không cấp cookie | HTTP 401, cookie=không | ok |
| 4 | A | Admin đăng nhập → 200 + cookie phiên | HTTP 200, cookie=có | ok |
| 5 | A | Admin tạo 4 user (owner×2, operator, driver) và đăng nhập được | owner1:201/200 owner2:201/200 operator:201/200 driver:201/200 | ok |
| 6 | A | DRIVER GET /stations → 403 | HTTP 403 | ok |
| 7 | A | OPERATOR POST /stations → 403 | HTTP 403 | ok |
| 8 | A | OPERATOR GET /stations → 200 | HTTP 200 | ok |
| 9 | A | STATION_OWNER tạo user qua /admin/users → 403 | HTTP 403 | ok |
| 10 | A | Đăng ký công khai kèm role ADMIN → 400 | HTTP 400 | ok |
| 11 | B | POST /stations thiếu Idempotency-Key → 400 | HTTP 400 | ok |
| 12 | B | Idempotency-Key quá ngắn → 400 | HTTP 400 | ok |
| 13 | B | Thiếu toạ độ → 400 | HTTP 400 | ok |
| 14 | B | Chỉ định status khi tạo trạm → 400 | HTTP 400 | ok |
| 15 | B | Cùng Idempotency-Key + cùng body → 201 cùng id, chỉ 1 dòng DB | HTTP 201/201, id 1/1, dòng=1 | ok |
| 16 | B | Cùng Idempotency-Key + body khác → 409 | HTTP 409 | ok |
| 17 | B | Owner2 không xem được trạm của Owner1 (403/404) và danh sách chỉ chứa trạm của mình | owner2 GET 403, list owner1=1 owner2=0 | ok |
| 18 | B | Tạo trụ mã chữ thường → 201, mã lưu IN HOA, mặc định 4 đầu nối | HTTP 201, code=R6-IDEM-01, đầu nối=4 | ok |
| 19 | B | connector_count=0 (ngoài khoảng 1–4) → 400 và không tạo trụ | HTTP 400, dòng DB=0 | ok |
| 20 | B | connector_count=5 (ngoài khoảng 1–4) → 400 và không tạo trụ | HTTP 400, dòng DB=0 | ok |
| 21 | B | connector_count=1 → 201 và đúng 1 đầu nối | HTTP 201, đầu nối=1 | ok |
| 22 | B | connector_count=4 → 201 và đúng 4 đầu nối | HTTP 201, đầu nối=4 | ok |
| 23 | B | Mã trụ trùng → 409 | HTTP 409 | ok |
| 24 | B | Mã trụ trùng khác hoa/thường → 409 | HTTP 409 | ok |
| 25 | B | Mã trụ sai định dạng ("bad code!") → 400 | HTTP 400 | ok |
| 26 | B | Mã trụ sai định dạng ("") → 400 | HTTP 400 | ok |
| 27 | B | Mã trụ sai định dạng ("AAAAAAAAAAAAAAAAAA…) → 400 | HTTP 400 | ok |
| 28 | B | Mã trụ sai định dạng ("trụ-1") → 400 | HTTP 400 | ok |
| 29 | B | Trạm không tồn tại → 404 | HTTP 404 | ok |
| 30 | B | check-code của mã đã dùng → is_available=false | HTTP 200, is_available=false | ok |
| 31 | C | Bắt tay: mã lạ → 403; thiếu subprotocol → 400; đường dẫn rỗng → 400; mã sai ký tự → 400 | lạ=403 thiếu-sub=400 rỗng=400 sai-ký-tự=400 | ok |
| 32 | C | Heartbeat trước Boot → CALLERROR SecurityError | SecurityError | ok |
| 33 | C | StatusNotification trước Boot → SecurityError, DB đầu nối không đổi | SecurityError; 1:UNKNOWN/- 2:UNKNOWN/- | ok |
| 34 | C | Khung không phải JSON → CALLERROR FormationViolation, kết nối vẫn mở | FormationViolation, readyState=1 | ok |
| 35 | C | CALL có payload là mảng → FormationViolation | FormationViolation | ok |
| 36 | C | Boot với vendor 21 ký tự → PropertyConstraintViolation, trụ không ONLINE | PropertyConstraintViolation; DB=UNKNOWN | ok |
| 37 | C | Boot hợp lệ → Accepted, interval=60, currentTime ISO lệch giờ máy < 2s, DB ONLINE + lưu thông tin | Accepted, interval=60, lệch=3ms, DB=ONLINE, SN=SN-KEEP, FW=FW-1.0 | ok |
| 38 | C | Heartbeat → currentTime theo giờ server, last_seen_at lệch now() DB < 2s | lệch=2ms, last_seen_age=0.001s | ok |
| 39 | C | Action không hỗ trợ → NotImplemented | NotImplemented | ok |
| 40 | C | Authorize có idTag → Accepted | {"idTagInfo":{"status":"Accepted"}} | ok |
| 41 | C | 9 trạng thái OCPP → CALLRESULT {} và ánh xạ nội bộ đúng (lưu cả ocpp_status) | 9/9 đúng: Available→AVAILABLE Preparing→OCCUPIED Charging→OCCUPIED SuspendedEV→OCCUPIED SuspendedEVSE→OCCUPIED | ok |
| 42 | C | F4: Unavailable → connectors.status=UNAVAILABLE (không còn ERROR) | UNAVAILABLE/Unavailable | ok |
| 43 | C | Trạng thái lạ "Vendor-X" → CALLRESULT {}, kết nối ERROR, lưu nguyên văn ở ocpp_status | ERROR/Vendor-X | ok |
| 44 | C | Trạng thái lạ chứa ký tự điều khiển → không sập, lưu bản đã làm sạch | ERROR/BadState | ok |
| 45 | C | 16 payload sai/vượt giới hạn (kể cả 5000 ký tự) → PropertyConstraintViolation | 16/16 bị từ chối | ok |
| 46 | C | Payload bị từ chối không ghi gì: đầu nối không đổi, không thêm connector_errors, mọi chuỗi lưu ≤ 50 ký tự | đầu nối giữ nguyên, connector_errors 1→1, max len error=13, ocpp_status=9 | ok |
| 47 | C | Khung ~60 KB (dưới 64 KB) vẫn được xử lý: CALLERROR vi phạm ràng buộc, kết nối vẫn mở | PropertyConstraintViolation, readyState=1 | ok |
| 48 | C | Đầu nối không khai báo (connectorId=9) → CALLRESULT {}, không tạo đầu nối mới | CALLRESULT; đầu nối 11→11 | ok |
| 49 | C | F5: connectorId=0 → CALLRESULT {}, không lưu gì (đầu nối và connector_errors không đổi) | CALLRESULT; đầu nối không đổi; errors 1→1 | ok |
| 50 | C | 15 mã lỗi OCPP đều được ghi; mã lạ ≤ 50 ký tự → error_code=OtherError, giữ nguyên văn ở vendor_error_code | thiếu=0, mã lạ→OtherError/MyWeirdCode | ok |
| 51 | C | errorCode=NoError không tạo dòng connector_errors | 16→16 | ok |
| 52 | C | F1: 30 tin Faulted y hệt gửi dồn trong ~1 giây → đủ 30 CALLRESULT nhưng chỉ 1 dòng connector_errors | CALLRESULT=30/30, dòng=1 | ok |
| 53 | C | F1: Faulted → Available → Faulted vẫn ghi dòng mới (tổng 2) | dòng=2 | ok |
| 54 | C | F1: cùng lỗi nhưng vendorErrorCode khác → coi là lỗi mới (tổng 3) | dòng=3 | ok |
| 55 | C | GET /api/charge-points trả connector_statuses khớp DB theo thứ tự đầu nối | API=["AVAILABLE","ERROR"] DB=["AVAILABLE","ERROR"] | ok |
| 56 | D | Boot lần 2 thiếu serial/firmware → giữ SN-KEEP/FW-OLD; vendor/model được cập nhật | SN=SN-KEEP FW=FW-OLD vendor=R6Vendor2 model=R6Model2 | ok |
| 57 | D | Boot lần 3 gửi chuỗi rỗng → vẫn giữ giá trị cũ | SN=SN-KEEP FW=FW-OLD | ok |
| 58 | D | Boot lần 4 có giá trị mới → ghi đè | SN=SN-NEW FW=FW-NEW | ok |
| 59 | E | F3: ngắt kết nối bình thường → trụ UNKNOWN, mọi đầu nối UNKNOWN, ocpp_status cuối được giữ | close=1000; UNKNOWN; 1:UNKNOWN/Charging 2:UNKNOWN/Available | ok |
| 60 | E | API danh sách sau khi offline: status=UNKNOWN và connector_statuses toàn UNKNOWN (giao diện không báo "Bận") | UNKNOWN ["UNKNOWN","UNKNOWN"] | ok |
| 61 | E | Boot lại → ONLINE, đầu nối vẫn UNKNOWN cho tới khi có StatusNotification | ONLINE; 1:UNKNOWN/Charging 2:UNKNOWN/Available | ok |
| 62 | E | StatusNotification sau Boot cập nhật bình thường (đầu nối 1 → OCCUPIED, đầu nối 2 còn UNKNOWN) | 1:OCCUPIED/Preparing 2:UNKNOWN/Available | ok |
| 63 | E | B8: ngắt TCP đột ngột (1006) → trụ về UNKNOWN trong ≤ 3s | sau 52ms | ok |
| 64 | E | S-13: kết nối thứ 2 thay thế → kết nối cũ nhận close 1000; DB vẫn ONLINE, đầu nối giữ OCCUPIED/Charging; kết nối mới hoạt động | close cũ=1000; ONLINE; 1:OCCUPIED/Charging 2:UNKNOWN/-; heartbeat=true | ok |
| 65 | E | S-13: đóng kết nối hiện hành → trụ UNKNOWN | sau 52ms | ok |
| 66 | E | S-13 (kết nối cũ treo): sau khi server terminate kết nối cũ, DB vẫn ONLINE và đầu nối không bị đưa về UNKNOWN | ONLINE; 1:OCCUPIED/Charging 2:UNKNOWN/- | ok |
| 67 | F | Khoá trạm → API 200, trụ nhận close 1008 "Station locked", DB UNKNOWN, đầu nối UNKNOWN (ocpp_status giữ) | API 200; close=1008/Station locked; UNKNOWN; 1:UNKNOWN/Charging 2:UNKNOWN/Available | ok |
| 68 | F | Trụ nối lại khi trạm còn khoá → Boot bị Rejected, DB không ONLINE, Heartbeat sau đó bị SecurityError | Rejected; DB=UNKNOWN; heartbeat=SecurityError | ok |
| 69 | F | Khoá lần 2 (trụ không còn kết nối) → 200, idempotent | HTTP 200 | ok |
| 70 | F | Mở khoá → 200, trụ kết nối lại và Boot Accepted → ONLINE | unlock 200; Accepted; DB=ONLINE | ok |
| 71 | F | Chỉ ADMIN được khoá trạm: OPERATOR và STATION_OWNER → 403 | operator 403, owner 403 | ok |
| 72 | F | F6: trụ treo (không đọc socket, không trả close frame) → DB về UNKNOWN trong ≤ 3s sau khi khoá (trước vá ≈ 30,5s) | API 200; UNKNOWN sau 1552ms; 1:UNKNOWN/Charging 2:UNKNOWN/- | ok |
| 73 | F | Race: khoá trạm khi trụ đang gửi ~40 tin/giây (6 vòng) → luôn close 1008, DB cuối cùng UNKNOWN và đầu nối UNKNOWN, ổn định sau 2s | 6/6 vòng nhất quán (đã gửi ~120+ tin mỗi vòng) | ok |
| 74 | G | B2: khung 70 KB (> 64 KB) → server đóng 1009, DB UNKNOWN | close=1009; DB UNKNOWN sau 49ms | ok |
| 75 | G | B3: 120 Heartbeat trong < 1s (giới hạn 50/s) → đóng 1008 "Rate limit", DB UNKNOWN | close=1008/Policy Violation: Rate limit exceeded; DB UNKNOWN sau 89ms | ok |
| 76 | G | B3: sau khi bị đóng vì tràn tần suất, kết nối lại + Boot vẫn được → ONLINE | ONLINE | ok |
| 77 | G | B3: tốc độ ~20 tin/giây trong 2s (dưới giới hạn) → không bị đóng | readyState=1 | ok |
| 78 | H | SIGTERM rồi SIGINT liền sau (idempotent) → tiến trình thoát mã 0 trong ≤ 8s | exit={"code":0,"signal":null} sau 100ms | ok |
| 79 | H | Mọi trụ nhận close 1001 "Server shutting down" (không phải 1006) | A=1001/Server shutting down; B=1001 | ok |
| 80 | H | Sau tắt máy: DB trụ UNKNOWN, đầu nối UNKNOWN, ocpp_status cuối được giữ | A: UNKNOWN 1:UNKNOWN/Charging 2:UNKNOWN/Available / B: UNKNOWN 1:UNKNOWN/Faulted 2:UNKNOWN/- | ok |
| 81 | H | Sau tắt máy: cổng HTTP đã đóng, không còn lỗi/stack trong log server | cổng đóng=true; stack=không | ok |
| 82 | H | Khởi động với 2 trụ ONLINE mồ côi → dọn xong trước khi mở cổng: trụ và đầu nối UNKNOWN, ocpp_status giữ, log có dòng "Dọn khi khởi động" | UNKNOWN[UNKNOWN,UNKNOWN] / UNKNOWN[UNKNOWN,UNKNOWN]; log=Dọn khi khởi động: 2 trụ | ok |
| 83 | H | SIGKILL (không kịp dọn): client thấy 1006 và DB còn ONLINE mồ côi (hành vi đã biết, được dọn ở lần khởi động kế) | close=1006; DB=ONLINE | ok |
| 84 | H | Khởi động lại sau SIGKILL → trụ mồ côi về UNKNOWN, đầu nối UNKNOWN | UNKNOWN; 1:UNKNOWN/Charging 2:UNKNOWN/- | ok |
| 85 | H | Trụ mồ côi kết nối lại, Boot Accepted → ONLINE | ONLINE | ok |
| 86 | H | Tắt server bằng SIGTERM khi không còn kết nối → mã 0 | {"code":0,"signal":null} | ok |
| 87 | I | B9: trụ trả pong tự động ở chu kỳ 1s → sống qua 4,5s, nhận ≥ 3 ping, DB vẫn ONLINE | readyState=1, ping=4, DB=ONLINE | ok |
| 88 | I | B9: trụ ngừng trả pong → server terminate trong ≤ 2×chu kỳ + sai số (≤ 3,5s) và DB UNKNOWN | đóng sau 1340ms (close=1006); DB UNKNOWN +52ms | ok |
| 89 | I | B9: trụ kết nối lại + Boot → ONLINE | ONLINE | ok |
| 90 | I | Tắt server thứ hai bằng SIGTERM → mã 0 | {"code":0,"signal":null} | ok |
| 91 | J | Log hai server không chứa mật khẩu admin, JWT_SECRET hay cookie phiên | quét 117580 byte log | ok |
| 92 | J | Log server không có stack trace / unhandledRejection | quét log | ok |
| 93 | J | Không CALLERROR nào (tổng 24) lộ chi tiết Postgres/đường dẫn/mật khẩu | sạch | ok |
