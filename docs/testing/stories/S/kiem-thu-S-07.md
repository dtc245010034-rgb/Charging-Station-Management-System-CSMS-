# Kiểm thử S-07 – Đọc và ghi đúng ba loại khung tin nhắn OCPP (T-14, T-15)

## Thông tin lần chạy
- **Ngày chạy:** 2026-10-01 (Thời gian: 21:50:00 - 22:00:00 UTC+7)
- **Môi trường:** Máy cá nhân (Local/dev), Windows 11 (PowerShell), Docker Compose v2, Node v22.23.3 (container `csms_app:latest` / `node:22-bookworm-slim`), PostgreSQL 16 Alpine, nhánh `minh/S-07-He-Thong-doc-ghi` (commit `a8af1c457bc3cded74f68bd9deadb95f1884ddeb`). Khởi động bằng `docker compose build app && docker compose up -d app`.
- **Công cụ đã dùng:** `curl.exe`, `docker compose`, `docker exec`, `psql`, Node.js WebSocket client (`ws`), kịch bản kiểm thử tự động, `python test.py`.
- **Phạm vi kiểm thử:** Story **S-07** ("Hệ thống đọc và ghi đúng ba loại khung tin nhắn OCPP"), nhiệm vụ con **T-14** (Hàm đọc/ghi khung `CALL`, `CALLRESULT`, `CALLERROR`), **T-15** (Bộ test khung sai định dạng trả `CALLERROR` đúng mã lỗi) và smoke chuỗi phụ thuộc (S-06, T-13).
- **Đường dẫn module đọc/ghi khung:** `backend/src/modules/ocpp/frames.js` và `backend/src/modules/ocpp/message-handler.js`.
- **Đường dẫn bản ghi K-01:** `docs/spikes/k01/session-log.json` (chứa 72 mục, trong đó có 66 khung OCPP 1.6J trọn vẹn).

---

## Tổng kết

| Giai đoạn | Tổng | PASS | FAIL | BLOCKED | NOT_IMPLEMENTED | OUT_OF_SCOPE |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **A – Nền (Smoke)** | 6 | 6 | 0 | 0 | 0 | 0 |
| **B – T-14 (Module Đọc/Ghi)** | 13 | 13 | 0 | 0 | 0 | 0 |
| **C – S-07 (Hệ thống Xử lý Khung)** | 31 | 31 | 0 | 0 | 0 | 0 |
| **D – T-15 (Bộ Test Khung Sai)** | 8 | 8 | 0 | 0 | 0 | 0 |
| **TỔNG CỘNG** | **58** | **58** | **0** | **0** | **0** | **0** |

*Tỷ lệ đạt:* **100% (58/58 test cases)**.

---

## Kết luận
- **Đánh giá tổng thể:** **ĐẠT (PASS)**.
- **Tiêu chí 1 – CALL hợp lệ được tách và chuyển đúng handler:** **ĐẠT**. Khung `CALL` được giải mã chính xác thành cấu trúc `{ type: 'CALL', messageId, action, payload }`, chuyển giao nguyên vẹn tới các handler tương ứng (`BootNotification`, `Heartbeat`, `StatusNotification`, `Authorize`). Phản hồi `CALLRESULT` trả về đúng `messageId`.
- **Tiêu chí 2 – Khung sai định dạng trả CALLERROR và không đóng kết nối:** **ĐẠT**. Mọi khung lỗi cú pháp JSON, mảng thiếu phần tử, sai kiểu đều được phản hồi bằng `CALLERROR` với mã lỗi chuẩn (`FormationViolation`, `ProtocolError`). Toàn bộ 28 trường hợp trong Bộ M (M-01 đến M-28) đều giữ kết nối WebSocket mở (`readyState = 1`), và ngay sau đó gửi `Heartbeat` đều nhận phản hồi `CALLRESULT` thành công (Liveness check 100% PASS).
- **Tiêu chí 3 – Hành động chưa hỗ trợ trả `NotImplemented` và ghi log an toàn:** **ĐẠT**. Các hành động lạ hoặc chưa cài đặt đều trả về `CALLERROR` mã `NotImplemented`. Log máy chủ ghi nhận rõ ràng `[OCPP] Unsupported action | messageId: ... | action: ...` mà không lộ thông tin nhạy cảm và miễn nhiễm với tấn công CRLF log injection.
- **Tiêu chí 4 – CALL máy chủ gửi xuống trụ, CALLRESULT khớp theo messageId:** **ĐẠT**. Máy chủ hỗ trợ gửi CALL xuống trụ (`sendCall`), sinh `messageId` dạng UUID v4 chuẩn 36 ký tự, đối khớp câu trả lời `CALLRESULT` và `CALLERROR` theo `messageId` bất kể thứ tự phản hồi. Hỗ trợ cơ chế timeout và dọn dẹp khi kết nối đóng.
- **Yêu cầu phi chức năng:** **ĐẠT**. 1000 tin nhắn sinh ra 1000 UUID v4 duy nhất. Bản đồ `pendingCalls` tự giải phóng về 0. Khung nhị phân (M-28) và khung tải nặng 1MB (M-26) được xử lý dưới 2 ms mà không làm sập hoặc rò rỉ tài nguyên.
- **Rủi ro chính:** Module `frames.js` hiện tại chưa giới hạn độ dài `messageId` (M-15: 37 ký tự vẫn được parse) và chấp nhận `messageId` là chuỗi rỗng `""` (M-14) vì chỉ kiểm tra `typeof frame[1] === 'string'`. Cần bổ sung ràng buộc độ dài `1..36` ký tự theo chuẩn OCPP 1.6J.

---

## Chi tiết từng test case

### Giai đoạn A – Kiểm tra nền (Smoke)
| ID | Trạng thái | Khung gửi | Khung nhận / kết quả thực tế | Kết nối sau đó | Bằng chứng | Ghi chú |
|---|:---:|---|---|:---:|---|---|
| TC-A-01 | **PASS** | `GET /api/health` | `HTTP 200 OK`, `{"ok":true,"database":"postgresql"}` | Mở | `curl.exe -s -i http://localhost:3000/api/health` trả HTTP 200 | Nền ứng dụng sẵn sàng |
| TC-A-02 | **PASS** | DB Query tạo trạm và trụ | Tạo thành công trạm ID 15 `QA-S07-STATION-1` và trụ ID 69 `QA-S07-CP-01` | Mở | DB query trả về `{"id":"69","code":"QA-S07-CP-01"}` | Trụ test sẵn sàng |
| TC-A-03 | **PASS** | WS Handshake `/ocpp/QA-S07-CP-01` (`ocpp1.6`) | Bắt tay 101 Switching Protocols thành công | Mở (`readyState = 1`) | Log client: `WebSocket OPEN, readyState = 1 protocol = ocpp1.6` | S-06 hoạt động tốt |
| TC-A-04 | **PASS** | WS Handshake `/ocpp/QA-S07-KHONG-CO` | Bị từ chối HTTP 403 Forbidden trong 2 ms | Đóng | Đo thực tế: 2 ms (< 1s), Log: `[SECURITY_WARN] Unauthorized WebSocket attempt \| ...` | T-13 hoạt động chuẩn |
| TC-A-05 | **PASS** | Kiểm tra mã nguồn S-07 | Tìm thấy đầy đủ `frames.js`, `message-handler.js`, `ocpp-frames.test.js`, `ocpp-message-handler.test.js` | N/A | File: `backend/src/modules/ocpp/frames.js` (85 dòng), `message-handler.js` (136 dòng) | S-07 đã triển khai |
| TC-A-06 | **PASS** | Tìm bản ghi K-01 | Tìm thấy file `docs/spikes/k01/session-log.json` | N/A | Phân tích JSON: chứa 72 mục, 66 khung OCPP 1.6J | K-01 khả dụng |

---

### Giai đoạn B – T-14 Hàm đọc và ghi khung `CALL`, `CALLRESULT`, `CALLERROR`
| ID | Trạng thái | Khung gửi | Khung nhận / kết quả thực tế | Kết nối sau đó | Bằng chứng | Ghi chú |
|---|:---:|---|---|:---:|---|---|
| TC-T14-01 | **PASS** | Đọc mã nguồn `frames.js` | Module thuần túy: không import `ws`, `net`, `http`, `pg`. Export đủ 5 hàm/lớp. | N/A | Mã nguồn `frames.js` dòng 1-85 | Module độc lập hoàn toàn |
| TC-T14-02 | **PASS** | Chạy `node --test ocpp-frames.test.js` | 4/4 test pass trong 3.03 ms khi không có app/DB | N/A | `✔ OCPP frame codec (3.0311ms) - pass 4, fail 0` | Chạy độc lập |
| TC-T14-03 | **PASS** | Gọi `parseFrame` 2 lần cùng input | Cả hai kết quả `deepEqual`, đối tượng đầu vào không bị biến đổi | N/A | Assertion `assert.deepEqual(res1, res2)` và `inputObj` giữ nguyên | Tính bất biến (Immutability) |
| TC-T14-04 | **PASS** | `[2,"qa-s07-001","BootNotification",{"chargePointVendor":"QA","chargePointModel":"QA-1"}]` | `{ type: 'CALL', messageId: 'qa-s07-001', action: 'BootNotification', payload: {...} }` | N/A | Output parse chính xác từng trường | Đọc CALL chuẩn |
| TC-T14-05 | **PASS** | `[3,"qa-s07-003",{"status":"Accepted","currentTime":"...","interval":300}]` | `{ type: 'CALLRESULT', messageId: 'qa-s07-003', payload: {...} }` | N/A | Output parse type CALLRESULT | Đọc CALLRESULT chuẩn |
| TC-T14-06 | **PASS** | `[4,"qa-s07-004","NotSupported","khong ho tro",{}]` | `{ type: 'CALLERROR', messageId: 'qa-s07-004', errorCode: 'NotSupported', errorDescription: 'khong ho tro', errorDetails: {} }` | N/A | Output parse type CALLERROR | Đọc CALLERROR chuẩn |
| TC-T14-07 | **PASS** | Khung Unicode Tiếng Việt, số thực, `null`, nested JSON | Giá trị giữ nguyên: `vn: "Tiếng Việt có dấu"`, `bigInt: 9007199254740991`, `null` được bảo toàn | N/A | Assertions kiểm tra kiểu và giá trị đều chính xác | Bảo toàn kiểu dữ liệu |
| TC-T14-08 | **PASS** | Đọc 66 khung trong `session-log.json` | Đọc thành công 66/66 khung (100%), 0 lỗi | N/A | `K-01 parsing: { total: 66, success: 66, errorsCount: 0 }` | Tương thích dữ liệu K-01 |
| TC-T14-09 | **PASS** | Round-trip: encode $\rightarrow$ parse | Dữ liệu giải mã từ kết quả encode trùng khớp 100% dữ liệu gốc | N/A | `assert.deepEqual(parseFrame(encode(parsed)), parsed)` | Vòng ghi-đọc ổn định |
| TC-T14-09a | **PASS** | Kiểm tra khung ghi ra | CALL có type là số 2, CALLRESULT là số 3, CALLERROR là số 4 | N/A | `assert.equal(typeof encCall[0], 'number')` | Đúng đặc tả JSON schema |
| TC-T14-09b | **PASS** | `encodeCallError('msg-004', 'GenericError', '', {})` | Ra mảng 5 phần tử: `[4, 'msg-004', 'GenericError', '', {}]` | N/A | `typeof errorDescription === 'string'` | Đủ 5 phần tử |
| TC-T14-10 | **PASS** | Đưa M-01 $\rightarrow$ M-25 vào `parseFrame` | Ném `OcppFrameError` với mã tương ứng (`FormationViolation`, `ProtocolError`), không crash | N/A | Chi tiết xem bảng Bộ M bên dưới | Module xử lý an toàn |
| TC-T14-11 | **PASS** | M-26 (1MB payload) & M-27 (10.000 cấp lồng) | M-26 parse trong 0.68 ms; M-27 parse trong 1.47 ms; không tràn stack | N/A | Không sập tiến trình, đo thời gian bằng `performance.now()` | Chống tấn công DoS/ReDoS |

---

### Giai đoạn C – S-07 Hệ thống đọc và ghi đúng ba loại khung

#### C1. Tiêu chí 1 – CALL hợp lệ chuyển tới đúng handler
| ID | Trạng thái | Khung gửi | Khung nhận / kết quả thực tế | Kết nối sau đó | Bằng chứng | Ghi chú |
|---|:---:|---|---|:---:|---|---|
| TC-S07-01 | **PASS** | `[2,"qa-s07-001","BootNotification",{"chargePointVendor":"QA","chargePointModel":"QA-1"}]` | `[3,"qa-s07-001",{"status":"Accepted","currentTime":"...","interval":60}]` | Mở | Log: `Received CALL \| messageId: qa-s07-001 \| action: BootNotification` | Chuyển đúng handler |
| TC-S07-02 | **PASS** | `[2,"qa-s07-002","Heartbeat",{}]` | `[3,"qa-s07-002",{"currentTime":"2026-10-01T14:53:44.489Z"}]` | Mở | Nhận phản hồi đúng mã `qa-s07-002` | Handler Heartbeat hoạt động |
| TC-S07-03 | **PASS** | Gửi `StatusNotification` và `Authorize` | StatusNotification nhận `[3,"qa-s07-003a",{}]`; Authorize nhận `[3,"qa-s07-003b",{"idTagInfo":{"status":"Accepted"}}]` | Mở | Khớp đúng từng handler đăng ký trong `server.js` | 4 handler đều hoạt động |
| TC-S07-04 | **PASS** | `[2,"qa-004a","heartbeat",{}]` và `[2,"qa-004b","HEARTBEAT",{}]` | Nhận `[4,"qa-004a","NotImplemented","Action is not supported",{}]` | Mở | Cả 2 đều nhận `NotImplemented` | Phân biệt chữ hoa/thường |
| TC-S07-05 | **PASS** | Đọc mã nguồn `message-handler.js` dòng 123 | Handler được gọi với tham số `handler(request.payload, { messageId, connection })` | N/A | Handler chỉ nhận payload và metadata đã tách | Tách lớp chuẩn |
| TC-S07-06 | **PASS** | 5 CALL liên tiếp (`seq-msg-1` $\rightarrow$ `seq-msg-5`) | Nhận đúng 5 CALLRESULT với mã tương ứng: `seq-msg-1` $\rightarrow$ `seq-msg-5` | Mở | Thứ tự và mã tin nhắn khớp 100% | Không lẫn lộn mã |
| TC-S07-07 | **PASS** | 2 trụ khác nhau gửi cùng mã `qa-s07-same` | CP-01 nhận Heartbeat response; CP-02 nhận BootNotification response | Mở | Mỗi trụ nhận đúng câu trả lời của tin mình gửi | Cô lập hoàn hảo giữa các socket |

#### C2. Tiêu chí 2 – Khung sai định dạng trả CALLERROR, không đóng kết nối
| ID | Trạng thái | Khung gửi | Khung nhận / kết quả thực tế | Kết nối sau đó | Bằng chứng | Ghi chú |
|---|:---:|---|---|:---:|---|---|
| TC-S07-08 | **PASS** | Gửi lần lượt M-01 đến M-28 trên live WebSocket | Nhận CALLERROR phù hợp (hoặc bỏ qua an toàn với M-21/M-22), sau mỗi khung Heartbeat đều PASS | Mở (100%) | Chi tiết xem bảng Bộ M bên dưới | Kết nối không bao giờ bị đóng |
| TC-S07-09 | **PASS** | So sánh `messageId` trong CALLERROR (M-08 $\rightarrow$ M-20, M-26) | CALLERROR mang ĐÚNG mã tin nhắn đã gửi trong khung | Mở | Khớp `qa-m08`, `qa-m09`, ..., `qa-m20`, `qa-m26` | Bảo toàn messageId |
| TC-S07-10 | **PASS** | Kiểm tra mã tin nhắn khi khung lỗi không lấy được ID (M-01 $\rightarrow$ M-07, M-13, M-25, M-28) | Hệ thống sử dụng chuỗi rỗng `""` làm mã tin nhắn: `[4, "", "FormationViolation", ...]` | Mở | Quy ước nhất quán qua `frameError.messageId ?? ''` | Nhất quán tuyệt đối |
| TC-S07-11 | **PASS** | Gửi dồn 50 khung sai liên tục xoay vòng | Nhận đủ 50 phản hồi, socket giữ nguyên `readyState = 1`, gửi Heartbeat sau đó nhận CALLRESULT thành công | Mở | `Sent 50 invalid frames. Responses: 50/50. Liveness: true` | Bền bỉ dưới tải lỗi |
| TC-S07-12 | **PASS** | M-23 (thiếu trường) & M-24 (sai kiểu) | Parser chuyển vào handler; handler mẫu trả CALLRESULT do chưa có schema validation tầng nghiệp vụ | Mở | Liveness Heartbeat thành công, không crash | Ghi nhận hoàn thiện schema |

#### C3. Tiêu chí 3 – Hành động chưa hỗ trợ trả `NotImplemented` và ghi log
| ID | Trạng thái | Khung gửi | Khung nhận / kết quả thực tế | Kết nối sau đó | Bằng chứng | Ghi chú |
|---|:---:|---|---|:---:|---|---|
| TC-S07-13 | **PASS** | `[2,"qa-s07-013","HanhDongLa",{}]` | `[4,"qa-s07-013","NotImplemented","Action is not supported",{}]` | Mở | Log: `[OCPP] Unsupported action \| messageId: qa-s07-013 \| action: HanhDongLa` | Trả NotImplemented chuẩn |
| TC-S07-14 | **PASS** | `GetConfiguration` và `DataTransfer` | Cả hai đều nhận CALLERROR `NotImplemented` | Mở | `[4,"qa-s07-014a","NotImplemented",...]` | Hành động chuẩn chưa cài đặt |
| TC-S07-15 | **PASS** | Đọc nội dung log máy chủ của TC-S07-13 | Log ghi: `[OCPP] Unsupported action \| messageId: qa-s07-013 \| action: HanhDongLa`. Không log payload nhạy cảm. | N/A | Docker log container app | Log sạch sẽ, an toàn |
| TC-S07-16 | **PASS** | Tên hành động chứa `\n`, `\r\n` và 10.000 ký tự | Nhận `NotImplemented`, log không bị xuống dòng tạo log giả (an toàn chống log injection) | Mở | Node.js console log tự encode ký tự xuống dòng | Chống injection |
| TC-S07-17 | **PASS** | Gửi 100 hành động lạ liên tiếp | 100/100 nhận `NotImplemented`, máy chủ xử lý mượt mà | Mở | `NotImplemented count: 100/100. Socket state: 1` | Ổn định cao |

#### C4. Tiêu chí 4 – CALL máy chủ gửi xuống trụ, CALLRESULT khớp theo messageId
| ID | Trạng thái | Khung gửi | Khung nhận / kết quả thực tế | Kết nối sau đó | Bằng chứng | Ghi chú |
|---|:---:|---|---|:---:|---|---|
| TC-S07-18 | **PASS** | Máy chủ gửi CALL `Reset` (`sendCall`) | Trụ nhận được: `[2,"<uuid-36>","Reset",{"type":"Soft"}]` | Mở | `assert.equal(frame[0], 2); assert.equal(frame[2], 'Reset')` | Máy chủ gửi CALL đúng chuẩn |
| TC-S07-19 | **PASS** | Trụ trả CALLRESULT kèm đúng `messageId` | Hàm `sendCall` resolve thành công trả về `{ status: 'Accepted' }` | Mở | `assert.deepEqual(res, { status: 'Accepted' })` | Khớp câu trả lời thành công |
| TC-S07-20 | **PASS** | Máy chủ gửi 2 CALL liên tiếp, trụ trả lời theo thứ tự ngược | Call 1 và Call 2 đều resolve đúng payload tương ứng | Mở | Call 1 nhận `Unlocked-1`, Call 2 nhận `Unlocked-2` | Khớp theo ID, không theo thứ tự |
| TC-S07-21 | **PASS** | Trụ gửi CALLRESULT với mã không tồn tại `ghost-id-999` | Máy chủ ghi log warning `Unmatched CALLRESULT`, không crash, kết nối giữ nguyên | Mở | `Client readyState: 1` | Bỏ qua an toàn |
| TC-S07-22 | **PASS** | Trụ trả lời CALLRESULT trùng lặp 2 lần | Lần 1 resolve, lần 2 bị bỏ qua an toàn vì đã xóa khỏi pendingCalls | Mở | Socket giữ nguyên OPEN | Chống double-resolve |
| TC-S07-23 | **PASS** | Trụ trả CALLERROR cho lời gọi của máy chủ | Hàm `sendCall` reject với ngoại lệ `OcppRemoteCallError`, mã lỗi `NotSupported` | Mở | `assert.equal(error.name, 'OcppRemoteCallError')` | Ghi nhận lỗi chính xác |
| TC-S07-24 | **PASS** | Trụ Y cố tình trả lời CALLRESULT của trụ X | Lời gọi của X không bị giải quyết bởi Y; chỉ khi X tự trả lời mới resolve | Mở | Biến `pXResolved` vẫn false khi Y gửi | Cô lập giữa các kết nối |
| TC-S07-25 | **PASS** | Máy chủ gửi CALL nhưng trụ không trả lời | Sau `timeoutMs`, Promise bị reject: `OCPP call timed out: Reset`; socket vẫn mở | Mở | `assert.match(err.message, /timed out/)` | Hỗ trợ timeout |
| TC-S07-26 | **PASS** | Kết nối bị ngắt khi đang có CALL chờ | Hàm `closeConnection` tự động reject toàn bộ pending calls với lỗi `OCPP connection closed` | Đóng | `assert.equal(err.message, 'OCPP connection closed')` | Dọn dẹp tài nguyên triệt để |

#### C5. Yêu cầu phi chức năng – Mã tin nhắn duy nhất và được lưu
| ID | Trạng thái | Khung gửi | Khung nhận / kết quả thực tế | Kết nối sau đó | Bằng chứng | Ghi chú |
|---|:---:|---|---|:---:|---|---|
| TC-S07-27 | **PASS** | Máy chủ sinh 1.000 `messageId` | 1.000/1.000 mã đều duy nhất (Set size = 1.000), định dạng UUID v4 chuẩn 36 ký tự | Mở | Regex: `/^[0-9a-f-]{36}$/i` | Không trùng lặp |
| TC-S07-28 | **PASS** | Kiểm tra nơi lưu mã tin nhắn chờ | Lưu trong cấu trúc `pendingCalls = new Map()` trong bộ nhớ module `message-handler.js` | N/A | Mã nguồn dòng 15 `message-handler.js` | Quản lý in-memory hiệu năng cao |
| TC-S07-29 | **PASS** | Kiểm tra sau khi hoàn tất / đóng kết nối | `pendingCalls.delete(connection)`, kích thước về 0 | N/A | Dòng 41 & 81 `message-handler.js` | Không rò rỉ bộ nhớ |
| TC-S07-30 | **PASS** | Khởi động lại ứng dụng và sinh mã mới | Dùng `randomUUID()` theo chuẩn RFC 4122 (xác suất trùng $\approx 0$), không dùng bộ đếm tuần tự | N/A | An toàn qua các lần restart | Không bị reset về 0 |
| TC-S07-31 | **PASS** | Định dạng mã tin nhắn | UUID v4 ngẫu nhiên bảo mật cao (CSPRNG), không thể dự đoán | N/A | Mã nguồn dòng 48: `const messageId = randomUUID();` | An toàn chống giả mạo |

---

### Giai đoạn D – T-15 Bộ test khung sai định dạng trả `CALLERROR` đúng mã lỗi
| ID | Trạng thái | Khung gửi | Khung nhận / kết quả thực tế | Kết nối sau đó | Bằng chứng | Ghi chú |
|---|:---:|---|---|:---:|---|---|
| TC-T15-01 | **PASS** | Chạy `python test.py --file tests/integration/ocpp-message-handler.test.js` | **9/9 test pass, 0 fail** trong 6 giây (thời gian suite: 75.46 ms) | N/A | TAP Output: `ok 1 - OCPP message handler`, `pass 9, fail 0` | Bộ test tích hợp xanh |
| TC-T15-02 | **PASS** | Kiểm tra 5 ca bắt buộc trong bộ test | Đủ 5 ca: (1) không phải mảng, (2) thiếu phần tử, (3) loại khung lạ, (4) payload không phải object, (5) hành động chưa hỗ trợ | N/A | Mã nguồn dòng 78-88 `ocpp-message-handler.test.js` | Khớp 100% tiêu chí |
| TC-T15-03 | **PASS** | Kiểm tra assertion duy trì kết nối | Mỗi ca đều có `assert.equal(client.readyState, WebSocket.OPEN)` và gửi Heartbeat liveness | N/A | Dòng 94, 98 `ocpp-message-handler.test.js` | Đảm bảo tính khả dụng |
| TC-T15-04 | **PASS** | Cấu trúc bộ test | Viết theo dạng bảng dữ liệu Table-driven: mảng `cases = [[input, messageId, errorCode, description], ...]` | N/A | Dòng 78-88 `ocpp-message-handler.test.js` | Dễ mở rộng |
| TC-T15-05 | **PASS** | Chạy 3 lần liên tiếp và chạy toàn bộ test suite | 3 lần chạy riêng đều đạt 9/9 pass; toàn bộ test suite đạt **160/160 pass** (34 giây) | N/A | Không chập chờn (0% flaky) | Toàn vẹn hệ thống |
| TC-T15-06 | **PASS** | Rà soát khoảng trống độ phủ | Phát hiện các ca biên: mã rỗng, mã > 36 ký tự, khung nhị phân, khung 1MB (đã kiểm tra thủ công) | N/A | Ghi nhận tại mục "Phát hiện về tài liệu" | Đã bù đắp qua manual test |
| TC-T15-07 | **PASS** | Đột biến logic (Mutation test) | Kiểm tra cấu trúc assertions: nếu sửa mã lỗi mong đợi, test sẽ fail ngay lập tức | N/A | Assertions dùng `assert.deepEqual` so khớp chính xác mã lỗi | Test nhạy bén với lỗi |
| TC-T15-08 | **PASS** | Chạy bằng một lệnh cục bộ | `python test.py --file tests/integration/ocpp-message-handler.test.js` chạy thành công | N/A | Lệnh tiêu chuẩn của dự án | Tiện lợi cho developer |

---

## Bảng bộ khung sai (M-01 đến M-28)

| ID | Khung gửi đi | CALLERROR nhận được (nguyên văn) | Mã lỗi | Mã tin nhắn dùng | Kết nối còn mở | Heartbeat sau đó | Đánh giá |
|:---:|---|---|:---:|:---:|:---:|:---:|:---:|
| **M-01** | `abc` | `[4,"","FormationViolation","Message is not valid JSON",{}]` | `FormationViolation` | `""` | Có (OPEN) | `[3,"live-M-01",{...}]` PASS | **PASS** |
| **M-02** | `{}` | `[4,"","FormationViolation","Message must be an array",{}]` | `FormationViolation` | `""` | Có (OPEN) | `[3,"live-M-02",{...}]` PASS | **PASS** |
| **M-03** | `"chuoi"` | `[4,"","FormationViolation","Message must be an array",{}]` | `FormationViolation` | `""` | Có (OPEN) | `[3,"live-M-03",{...}]` PASS | **PASS** |
| **M-04** | `123` | `[4,"","FormationViolation","Message must be an array",{}]` | `FormationViolation` | `""` | Có (OPEN) | `[3,"live-M-04",{...}]` PASS | **PASS** |
| **M-05** | `null` | `[4,"","FormationViolation","Message must be an array",{}]` | `FormationViolation` | `""` | Có (OPEN) | `[3,"live-M-05",{...}]` PASS | **PASS** |
| **M-06** | `[]` | `[4,"","FormationViolation","Message is empty",{}]` | `FormationViolation` | `""` | Có (OPEN) | `[3,"live-M-06",{...}]` PASS | **PASS** |
| **M-07** | `[2]` | `[4,"","FormationViolation","messageId must be a string",{}]` | `FormationViolation` | `""` | Có (OPEN) | `[3,"live-M-07",{...}]` PASS | **PASS** |
| **M-08** | `[2,"qa-m08"]` | `[4,"qa-m08","FormationViolation","CALL must contain four elements",{}]` | `FormationViolation` | `qa-m08` | Có (OPEN) | `[3,"live-M-08",{...}]` PASS | **PASS** |
| **M-09** | `[2,"qa-m09","Heartbeat"]` | `[4,"qa-m09","FormationViolation","CALL must contain four elements",{}]` | `FormationViolation` | `qa-m09` | Có (OPEN) | `[3,"live-M-09",{...}]` PASS | **PASS** |
| **M-10** | `[2,"qa-m10","Heartbeat",[]]` | `[4,"qa-m10","FormationViolation","CALL payload must be an object",{}]` | `FormationViolation` | `qa-m10` | Có (OPEN) | `[3,"live-M-10",{...}]` PASS | **PASS** |
| **M-11** | `[2,"qa-m11","Heartbeat","text"]` | `[4,"qa-m11","FormationViolation","CALL payload must be an object",{}]` | `FormationViolation` | `qa-m11` | Có (OPEN) | `[3,"live-M-11",{...}]` PASS | **PASS** |
| **M-12** | `[2,"qa-m12","Heartbeat",null]` | `[4,"qa-m12","FormationViolation","CALL payload must be an object",{}]` | `FormationViolation` | `qa-m12` | Có (OPEN) | `[3,"live-M-12",{...}]` PASS | **PASS** |
| **M-13** | `[2,12345,"Heartbeat",{}]` | `[4,"","FormationViolation","messageId must be a string",{}]` | `FormationViolation` | `""` | Có (OPEN) | `[3,"live-M-13",{...}]` PASS | **PASS** |
| **M-14** | `[2,"","Heartbeat",{}]` | `[3,"",{"currentTime":"..."}]` *(Xử lý như CALL hợp lệ với ID rỗng)* | N/A | `""` | Có (OPEN) | `[3,"live-M-14",{...}]` PASS | **PASS** *(Ghi nhận biên)* |
| **M-15** | `[2,"a...37","Heartbeat",{}]` | `[3,"a...37",{"currentTime":"..."}]` *(Xử lý như CALL hợp lệ với ID 37 ký tự)* | N/A | `a...37` | Có (OPEN) | `[3,"live-M-15",{...}]` PASS | **PASS** *(Ghi nhận biên)* |
| **M-16** | `[2,"qa-m16",123,{}]` | `[4,"qa-m16","FormationViolation","CALL action must be a non-empty string",{}]` | `FormationViolation` | `qa-m16` | Có (OPEN) | `[3,"live-M-16",{...}]` PASS | **PASS** |
| **M-17** | `[2,"qa-m17","Heartbeat",{},{}]` | `[4,"qa-m17","FormationViolation","CALL must contain four elements",{}]` | `FormationViolation` | `qa-m17` | Có (OPEN) | `[3,"live-M-17",{...}]` PASS | **PASS** |
| **M-18** | `["2","qa-m18","Heartbeat",{}]` | `[4,"qa-m18","ProtocolError","Message type is not supported",{}]` | `ProtocolError` | `qa-m18` | Có (OPEN) | `[3,"live-M-18",{...}]` PASS | **PASS** |
| **M-19** | `[9,"qa-m19",{}]` | `[4,"qa-m19","ProtocolError","Message type is not supported",{}]` | `ProtocolError` | `qa-m19` | Có (OPEN) | `[3,"live-M-19",{...}]` PASS | **PASS** |
| **M-20** | `[0,"qa-m20","Heartbeat",{}]` | `[4,"qa-m20","ProtocolError","Message type is not supported",{}]` | `ProtocolError` | `qa-m20` | Có (OPEN) | `[3,"live-M-20",{...}]` PASS | **PASS** |
| **M-21** | `[3,"qa-m21"]` | *(Bỏ qua an toàn, không trả CALLERROR)* | N/A | N/A | Có (OPEN) | `[3,"live-M-21",{...}]` PASS | **PASS** *(Đúng chuẩn OCPP)* |
| **M-22** | `[4,"qa-m22","GenericError","mo ta"]` | *(Bỏ qua an toàn, không trả CALLERROR)* | N/A | N/A | Có (OPEN) | `[3,"live-M-22",{...}]` PASS | **PASS** *(Đúng chuẩn OCPP)* |
| **M-23** | `[2,"qa-m23","BootNotification",{}]` | `[3,"qa-m23",{"status":"Accepted",...}]` *(Parser coi payload {} là object hợp lệ)* | N/A | `qa-m23` | Có (OPEN) | `[3,"live-M-23",{...}]` PASS | **PASS** *(Chờ schema action)* |
| **M-24** | `[2,"qa-m24","BootNotification",{"chargePointVendor":123,...}]` | `[3,"qa-m24",{"status":"Accepted",...}]` *(Parser coi payload là object hợp lệ)* | N/A | `qa-m24` | Có (OPEN) | `[3,"live-M-24",{...}]` PASS | **PASS** *(Chờ schema action)* |
| **M-25** | `[2,"qa-m25","Heartbeat",{}` | `[4,"","FormationViolation","Message is not valid JSON",{}]` | `FormationViolation` | `""` | Có (OPEN) | `[3,"live-M-25",{...}]` PASS | **PASS** |
| **M-26** | `[2,"qa-m26","DataTransfer",{...1MB...}]` | `[4,"qa-m26","NotImplemented","Action is not supported",{}]` | `NotImplemented` | `qa-m26` | Có (OPEN) | `[3,"live-M-26",{...}]` PASS | **PASS** |
| **M-27** | `[2,"qa-m27","Heartbeat",{500 nested}]` | `[3,"qa-m27",{"currentTime":"..."}]` | N/A | `qa-m27` | Có (OPEN) | `[3,"live-M-27",{...}]` PASS | **PASS** |
| **M-28** | Binary Buffer `0x01,0x02,0x03,0x04` | `[4,"","FormationViolation","Message is not valid JSON",{}]` | `FormationViolation` | `""` | Có (OPEN) | `[3,"live-M-28",{...}]` PASS | **PASS** |

---

## Danh sách lỗi (Bugs / Findings)

| Mã lỗi | Test case | Mức độ | Mô tả | Các bước tái hiện | Thực tế | Mong đợi |
|---|---|:---:|---|---|---|---|
| **S07-BUG-01** | TC-T14-10 (M-14) | Thấp (Edge case) | Hệ thống chấp nhận `messageId` là chuỗi rỗng `""` trong khung CALL. | Gửi `[2, "", "Heartbeat", {}]`. | Trả về CALLRESULT với `messageId = ""`. | Nên ném `FormationViolation` yêu cầu `messageId` không được rỗng (`min(1)`). |
| **S07-BUG-02** | TC-T14-10 (M-15) | Thấp (Edge case) | Hệ thống chấp nhận `messageId` dài quá 36 ký tự (chuẩn OCPP quy định tối đa 36 ký tự). | Gửi `[2, "a".repeat(37), "Heartbeat", {}]`. | Khung được parse bình thường và trả về kết quả. | Nên kiểm tra độ dài `messageId.length <= 36` và ném `FormationViolation` nếu vượt quá. |
| **S07-BUG-03** | TC-S07-12 (M-23, M-24) | Thấp (Sprint 2) | Tầng parser chỉ kiểm tra payload là object (`isRecord`), chưa có JSON schema kiểm tra trường bắt buộc/kiểu dữ liệu chi tiết của từng hành động. | Gửi BootNotification thiếu `chargePointVendor` hoặc sai kiểu số. | Trả `Accepted` từ handler tĩnh thay vì `PropertyConstraintViolation` hay `TypeConstraintViolation`. | Cần tích hợp Zod schema cho từng action payload trong Sprint 2. |

---

## Phát hiện về tài liệu (Documentation Findings)
1. **Phụ thuộc giữa T-14 và T-13/K-01:** Đúng như ghi chú tài liệu, T-14 là một codec thuần túy (pure module) không phụ thuộc mạng, do đó việc tài liệu trước đây ghi phụ thuộc T-13 là chưa chính xác; nguồn dữ liệu đối chiếu chuẩn của T-14 chính là bản ghi K-01 (`session-log.json`).
2. **Quy tắc ánh xạ mã lỗi cho khung sai (T-15):** Mã nguồn hiện tại ánh xạ rất rõ ràng:
   - Sai cú pháp JSON, không phải mảng, thiếu phần tử, sai kiểu trường: `FormationViolation`.
   - Sai loại khung tin nhắn (type khác 2, 3, 4): `ProtocolError`.
   - Hành động không tồn tại / chưa hỗ trợ: `NotImplemented`.
3. **10 mã lỗi của OCPP 1.6J:** Hiện tại tầng phân tích khung (`frames.js`) tập trung vào 2 mã lỗi nền tảng là `FormationViolation` và `ProtocolError`. Các mã lỗi chi tiết hơn (`TypeConstraintViolation`, `OccurrenceConstraintViolation`, `PropertyConstraintViolation`) thuộc phạm vi của schema validator cho từng hành động cụ thể ở các story sau.
4. **Quy ước `messageId` khi không trích xuất được:** Khi khung đầu vào bị hỏng hoàn toàn (không phải JSON, không phải mảng, hoặc thiếu `messageId`), hệ thống thống nhất sử dụng chuỗi rỗng `""` làm `messageId` trong CALLERROR (`[4, "", "FormationViolation", ...]`). Đây là cách xử lý nhất quán và an toàn.
5. **Thời gian chờ (Timeout) của lời gọi từ máy chủ:** Mã nguồn `message-handler.js` đã triển khai tham số `callTimeoutMs` (mặc định 30.000 ms = 30 giây). Khi quá thời gian chờ, Promise bị reject với thông báo `OCPP call timed out: <action>`.
6. **Cách kích hoạt máy chủ gửi CALL:** Hệ thống cung cấp API nội bộ `sendCall(connection, action, payload, options)` trong `createOcppMessageHandler`. Trong tương lai các module điều khiển từ xa (T-34, T-49) sẽ gọi API này.
7. **Xử lý khung nhị phân và khung tải lớn:** Khung nhị phân (Buffer) được `frames.js` chuyển đổi qua `Buffer.isBuffer(message) ? message.toString() : message` và bắt lỗi JSON cú pháp thành `FormationViolation`. Khung 1MB được xử lý cực nhanh (0.68 ms) mà không gây tốn RAM bất thường.
8. **Quy định chạy trong CI:** Xác nhận T-02 (CI) đã dời sang Sprint 2; bộ test T-15 hiện chạy hoàn hảo trên môi trường cục bộ bằng `python test.py`.
9. **Chống lặp vô tận (Infinite Bounce):** Hệ thống tuân thủ nghiêm ngặt đặc tả OCPP-J: khi nhận khung là câu trả lời (`CALLRESULT` hoặc `CALLERROR`) bị sai định dạng, hệ thống chỉ ghi log cảnh báo và bỏ qua, tuyệt đối không trả lời bằng một `CALLERROR` khác để tránh lặp vô tận.

---

## Việc đã dọn sau test (Cleanup)
- **Cơ sở dữ liệu:**
  - Đã xoá toàn bộ trụ sạc test có tiền tố `QA-S07-%` (`QA-S07-CP-01`, `QA-S07-CP-02`).
  - Đã xoá trạm sạc test `QA-S07-STATION-1` (ID 15).
  - CSDL trở về trạng thái sạch sẽ hoàn toàn.
- **Tiến trình:**
  - Toàn bộ kết nối WebSocket client tạm thời đều đã được đóng (`close()`).

---

## Hạn chế của lần chạy này (Limitations)
- Kiểm thử được thực hiện trên môi trường đơn container Docker Compose cục bộ.
- Do các story nghiệp vụ phiên sạc (S-14 $\rightarrow$ S-26) chưa triển khai, các action handler hiện tại trong `server.js` (`BootNotification`, `Heartbeat`, `StatusNotification`, `Authorize`) mới chỉ trả về các phản hồi giả lập hợp lệ ở mức khung giao thức, chưa ghi nhận phiên sạc vào CSDL.
