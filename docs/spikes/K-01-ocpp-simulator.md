# K-01 — Spike: trụ sạc ảo nối vào máy chủ WebSocket OCPP 1.6J

> **Jira**: `K-01` (2 SP) · **Dự án**: Charging-Station-Management-System-CSMS- · **Ngày chạy**: 27/9/2026
> **Snapshot**: nhánh `docs/GYM-12-k01-spike`, dựa trên `origin/main` (`3123dbd`)

## 0. Mục đích và giới hạn của spike

Theo mô tả K-01, tài liệu này chỉ cần trả lời 3 câu hỏi: dùng simulator nào và vì sao, chuỗi tin nhắn của
một phiên thật trông ra sao, và mỗi loại tin nhắn cần lưu những trường nào. Spike sinh ra **tri thức**,
không phải sản phẩm — code dùng để chạy thử (`k01-simulator.js`) là mã vứt đi, không thuộc `backend/src`
và không được lint/test cùng backend.

**Giới hạn quan trọng phải nói trước:** `backend/src/server.js` hiện tại chỉ xử lý 4 loại bản tin
(`BootNotification`, `Heartbeat`, `StatusNotification`, `Authorize`). `StartTransaction`, `MeterValues`,
`StopTransaction` — các bản tin tạo nên "một phiên sạc từ cắm tới rút" — đều trả `[4, id, "NotSupported", {}]`
vì thuộc phạm vi Sprint 3 (theo `README.md`, roadmap). Vì vậy tài liệu này **không có** bản ghi một phiên
sạc trọn vẹn có kWh, vì hệ thống chưa làm được việc đó. Phần dưới ghi lại đúng những gì máy chủ hiện tại
làm được, và liệt kê rõ ràng phần chưa làm được để không ai nhầm là "đã xong".

## 1. Simulator đã chọn và lý do

**Chọn**: một script Node dùng một lần (`docs/spikes/k01-simulator.js`), viết bằng thư viện `ws` —
thư viện `server.js` cũng đang dùng để chạy WebSocket server (`backend/package.json`, không thêm phụ thuộc mới).

**Lý do không dùng một simulator OCPP có sẵn** (ví dụ SteVe test client, ocpp-eliftech, các simulator OCPP-J công khai):

1. `server.js` gửi một bản tin chào ngoài chuẩn OCPP-J ngay sau khi kết nối
   (`[3, "welcome-<timestamp>", { chargePoint, status: "Connected" }]` — `server.js:16`). Một simulator
   tuân thủ chuẩn OCPP thật sự có thể coi đây là `CALLRESULT` không khớp bất kỳ `CALL` nào nó gửi trước đó
   và từ chối hoặc log lỗi giao thức, làm sai lệch kết quả đo.
2. `server.js` không hỗ trợ bất kỳ hành động nào ngoài 4 hành động kể trên; một simulator đầy đủ theo
   chuẩn OCPP 1.6 sẽ tự động thử cả `StartTransaction`, `MeterValues`, `StopTransaction`, `Heartbeat`
   theo chu kỳ... — nhiều luồng đó không cần thiết cho mục tiêu spike (chỉ cần bản ghi thô của một lượt
   trao đổi), gây tốn thời gian cấu hình hơn giá trị nó mang lại trong 1 tuần Sprint 1.
3. Mục tiêu là đo hành vi CHÍNH XÁC của mã hiện tại, không phải kiểm định tuân thủ chuẩn OCPP — script tự
   viết cho phép kiểm soát chính xác thứ tự gửi và ghi lại timestamp từng chiều, việc mà phải chỉnh sửa
   simulator có sẵn mới làm được.

Script giữ lại trong repo (`docs/spikes/`) thay vì xoá sau khi chạy, để mentor/người chấm chạy lại kiểm
chứng bản ghi bên dưới là thật, không phải bịa.

## 2. Cách chạy lại

```bash
# 1) Postgres test rỗng, migrate
node -e "require('./tests/helpers/db').resetSchema().then(()=>process.exit(0))"
node src/db/migrate.js

# 2) Đăng ký một trụ thật qua SQL trực tiếp (nhanh hơn đi qua toàn bộ luồng đăng nhập/API cho việc này)
#    — trạm "Trạm spike K-01", trụ mã K01-SIM-01

# 3) Chạy server, rồi chạy simulator nhắm vào trụ đã đăng ký
DATABASE_URL=... JWT_SECRET=... APP_ORIGIN=... PORT=3057 node src/server.js &
node ../docs/spikes/k01-simulator.js ws://127.0.0.1:3057/ocpp/K01-SIM-01 ../docs/spikes/k01-session-log.json
```

Bản ghi thật của lần chạy 27/9/2026 nằm ở [`k01-session-log.json`](./k01-session-log.json) (11 bản tin,
có timestamp ISO cho từng chiều gửi/nhận). Mã trụ `K01-SIM-01` là mã đã đăng ký thật qua bảng
`charge_points` trước khi kết nối, để phản ánh đúng tình huống dùng thật (không lẫn với lỗ hổng ở mục 5).

## 3. Chuỗi tin nhắn của phiên đã chạy được (Boot → Heartbeat → StatusNotification → Authorize)

| # | Chiều | Loại | Nội dung chính |
|---|---|---|---|
| 1 | Trụ → CSMS | `CALL BootNotification` | `chargePointVendor: "SpikeSim"`, `chargePointModel: "K-01-Virtual"` |
| 2 | CSMS → Trụ | *(ngoài chuẩn)* bản tin chào | `{ chargePoint: "K01-SIM-01", status: "Connected" }` — không phải `CALLRESULT` OCPP chuẩn |
| 3 | Trụ → CSMS | `CALL Heartbeat` | `{}` |
| 4 | CSMS → Trụ | `CALLRESULT BootNotification` | `{ status: "Accepted", currentTime, interval: 60 }` |
| 5 | Trụ → CSMS | `CALL StatusNotification` | `connectorId: 1, status: "Available", errorCode: "NoError"` |
| 6 | CSMS → Trụ | `CALLRESULT Heartbeat` | `{ currentTime }` |
| 7 | Trụ → CSMS | `CALL Authorize` | `idTag: "DEMO-TAG-001"` |
| 8 | CSMS → Trụ | `CALLRESULT StatusNotification` | `{}` |
| 9 | Trụ → CSMS | `CALL StartTransaction` *(thử vượt phạm vi)* | `connectorId: 1, idTag, meterStart: 0, timestamp` |
| 10 | CSMS → Trụ | `CALLRESULT Authorize` | `{ idTagInfo: { status: "Accepted" } }` |
| 11 | CSMS → Trụ | `CALLERROR StartTransaction` | `[4, "sim-5", "NotSupported", {}]` — **ranh giới thật của Sprint 1** |

Ghi chú thứ tự: máy chủ xử lý tuần tự nên phản hồi luôn đến sau khi trụ đã gửi bản tin kế tiếp (không chờ
round-trip) — đây là cách `server.js` hoạt động thật, không phải lỗi ghi log.

**Điều đã xác nhận bằng bản ghi thật**: 4 loại bản tin đầu được `Accepted`/phản hồi hợp lệ.
`StartTransaction` — bản tin đầu tiên của một "phiên sạc" theo đúng nghĩa AC — bị từ chối bằng
`NotSupported`. Không có bản ghi nào cho `MeterValues`/`StopTransaction` vì không có `transactionId` để
dùng (StartTransaction chưa từng thành công ở bất kỳ lần chạy nào).

## 4. Trường dữ liệu mỗi loại bản tin cần lưu

**Hiện trạng cần nói rõ trước bảng dưới**: `server.js` hiện **không ghi bất kỳ trường nào vào CSDL** khi
nhận bản tin — chỉ trả lời tĩnh trong bộ nhớ. Bảng dưới là đề xuất cho việc lưu trữ thật (Sprint 2 trở đi),
không phải mô tả code hiện tại.

### Đã có bản tin thật để đối chiếu (mục 3)

| Bản tin | Trường | Vì sao cần lưu |
|---|---|---|
| `BootNotification` | `chargePointVendor`, `chargePointModel`, `chargePointSerialNumber` (nếu có), `firmwareVersion` (nếu có) | Nhận diện phần cứng trụ, phục vụ bảo trì/thống kê thiết bị |
| `BootNotification` | thời điểm nhận, mã trụ (từ URL kết nối) | Biết trụ nào boot lúc nào — nền cho giám sát trạng thái kết nối |
| `Heartbeat` | thời điểm nhận | Phát hiện trụ mất kết nối (so với `interval` đã cấp ở BootNotification) |
| `StatusNotification` | `connectorId`, `status`, `errorCode`, `info` (nếu có), `timestamp` (nếu có, hoặc giờ nhận) | Đây là nguồn duy nhất cập nhật trạng thái đầu nối theo thời gian thực — mục tiêu chính của Sprint 2 |
| `Authorize` | `idTag`, kết quả `idTagInfo.status`, thời điểm | Vết kiểm tra thẻ để đối chiếu khi có tranh chấp phiên sạc |

### Chưa chạy được, đề xuất trước cho Sprint 3 (dựa trên chuẩn OCPP 1.6J, không phải đã kiểm chứng bằng bản ghi thật)

| Bản tin | Trường | Vì sao cần lưu |
|---|---|---|
| `StartTransaction` | `connectorId`, `idTag`, `meterStart` (Wh), `timestamp`, `reservationId` (nếu có), `transactionId` do CSMS cấp trong phản hồi | `transactionId` là khoá nối toàn bộ phiên; `meterStart` là mốc để tính kWh cuối cùng |
| `MeterValues` | `connectorId`, `transactionId`, từng `sampledValue`: `value`, `measurand` (vd. `Energy.Active.Import.Register`), `unit`, `timestamp`, `context` | Đây là dữ liệu tính tiền — Product Goal của dự án yêu cầu "tính đúng tiền" nên không được thiếu trường nào trong nhóm này |
| `StopTransaction` | `transactionId`, `meterStop` (Wh), `timestamp`, `reason` (nếu có), `idTag` (nếu có) | `meterStop - meterStart` là số kWh cuối; `reason` (vd. mất điện, rút thẻ) phục vụ đối soát doanh thu (Product Goal) |

## 5. Ghi chú lỗ hổng đã biết (không thuộc phạm vi K-01, không khai thác)

Xác nhận lại bằng bản ghi thật (không nằm trong log chính, chạy riêng để đối chiếu): kết nối tới
`ws://.../ocpp/KHONG-TON-TAI` — mã trụ **không tồn tại** trong bảng `charge_points` — vẫn được máy chủ
chấp nhận và trả lời `welcome`. Đây là lỗ hổng đã ghi nhận trong đánh giá S-04/S-05 trước đó, thuộc phạm
vi S-06 (xác thực trụ), không phải lỗi của Sprint 1. Nêu lại ở đây để không ai đọc tài liệu K-01 rồi nhầm
là "kết nối trụ đã có kiểm soát".

## 6. Việc còn lại (đề xuất, không nằm trong AC của K-01)

- S-06 (Sprint 2): trụ phải xác thực được trước khi máy chủ chấp nhận kết nối WebSocket.
- Sprint 3: cài `StartTransaction`/`MeterValues`/`StopTransaction` thật, cùng bảng lưu phiên sạc (hiện
  DB chưa có bảng nào cho việc này — xem thêm ghi chú S-05 AC3 trong đánh giá trước, cùng nguyên nhân).
