# K-01 — Spike: trụ sạc ảo nối vào máy chủ WebSocket OCPP 1.6J (bản hoàn thiện)

> **Jira**: `K-01` (GYM-12) · **Ngày chạy lại**: 28/9/2026 · **Thay thế** bản 27/9 (chỉ có 4 tin nhắn, tự viết bằng `ws` thô, không có phiên sạc trọn vẹn, chưa kiểm R-08).
> **Mã thử** (vứt đi được, không thuộc `backend/src`): [`k01/`](./k01). **Bản ghi thật**: [`k01/session-log.json`](./k01/session-log.json) (mọi khung, có mốc thời gian, theo chiều Trụ↔CSMS) và [`k01/findings.json`](./k01/findings.json) (kết quả từng kịch bản).

## 0. Vì sao phải làm lại

Bản 27/9 đạt “văn bản” nhưng **chưa đạt AC của K-01** trong backlog:

| AC / yêu cầu của K-01 | Bản 27/9 | Bản này |
|---|---|---|
| Chạy thử một simulator, ghi lại chuỗi tin nhắn của **một phiên hoàn chỉnh** (cắm → sạc → rút) | Không: dừng ở `StartTransaction` bị `NotSupported` | Có: 8 tin nhắn + `SetChargingProfile` + `Reset`, có `transactionId`, `MeterValues`, `StopTransaction` |
| Danh sách trường của từng tin nhắn | Đề xuất theo trí nhớ | Lấy từ **JSON schema chính thức OCPP 1.6** (thư viện nạp sẵn), đối chiếu bằng khung thật |
| R-08: simulator có tôn trọng `SetChargingProfile`? | Không kiểm | Đã kiểm (mục 4) |
| Không tự chấm bài của mình | Mã client và server cùng do nhóm viết bằng `ws` thô → “đúng” theo chính nó | Client là thư viện bên thứ ba, kiểm schema ở **cả hai đầu** |

## 1. Simulator đã chọn và lý do

**Chọn:** trụ ảo viết trên [`ocpp-rpc`](https://www.npmjs.com/package/ocpp-rpc) 2.2.1 (npm, MIT, Node ≥ 17.3) ở `strictMode: true` — `k01/virtual-charge-point.js`. Máy chủ tham chiếu (`k01/reference-server.js`) dùng cùng thư viện để có một CSMS chuẩn làm đối chứng.

Lý do:
1. **Kiểm schema OCPP 1.6 chính thức ở cả hai đầu.** Khung sai (thiếu `errorCode`…) bị chặn với đúng mã lỗi OCPP (`OccurrenceConstraintViolation`), nên bản ghi không “đúng chỉ vì mã của mình tự thấy đúng”.
2. Cùng hệ Node/`ws` với backend → đưa vào `docker-compose` cho S-26 (T-55, 20 trụ ảo) không cần thêm runtime.
3. Có sẵn kết nối lại tự động, keep-alive, đóng kết nối đúng mã — đúng thứ E-04 cần thử.

**Giới hạn phải nói thẳng:**
- Đây là **thư viện giao thức, không phải simulator “chạy sẵn”**: hành vi của trụ (nối lại rồi làm gì, có tôn trọng profile không) do **chúng ta** viết trong `virtual-charge-point.js`. Nó chứng minh *hợp đồng tin nhắn* đúng, **không** chứng minh một trụ thật sẽ làm y hệt.
- Chưa thử bất kỳ trụ thật hoặc simulator thương mại nào. Rủi ro “trụ thật khác spec” vẫn còn (xem mục 6).

## 2. Cách chạy lại

```bash
cd docs/spikes/k01
npm install
node run-all.js     # ghi lại session-log.json + findings.json, in kết quả
```

## 3. Phiên sạc trọn vẹn đã ghi (trụ `K01-SIM-01`, 22 kW)

| # | Chiều | Tin nhắn | Điểm cần nhớ |
|---|---|---|---|
| 1 | Trụ→CSMS | `BootNotification` | vendor/model/serial/firmware → trả `Accepted`, `interval: 300` |
| 2 | Trụ→CSMS | `Heartbeat {}` | trả `currentTime` (giờ **máy chủ**) |
| 3 | Trụ→CSMS | `StatusNotification` `Available` (conn 1) | có `errorCode: NoError`, `timestamp` |
| 4 | Trụ→CSMS | `Authorize` `idTag` | trả `idTagInfo.status` |
| 5 | Trụ→CSMS | `StatusNotification` `Preparing` | cắm súng trước khi bắt đầu |
| 6 | Trụ→CSMS | `StartTransaction` | `meterStart: 0` (Wh) → CSMS cấp **`transactionId` (số nguyên)** |
| 7 | Trụ→CSMS | `StatusNotification` `Charging` | |
| 8 | Trụ→CSMS | `MeterValues` ×4 | `Energy.Active.Import.Register` (Wh), `Power.Active.Import` (W), `Current.Import` (A) |
| 9 | CSMS→Trụ | `SetChargingProfile` (7 kW) | trụ trả `Accepted`; hai mẫu sau đó ≤ 7 000 W |
| 10 | Trụ→CSMS | `StopTransaction` | `meterStop: 160`, `reason: Local` → kWh = (meterStop − meterStart)/1000 |
| 11 | Trụ→CSMS | `StatusNotification` `Finishing` → `Available` | |
| 12 | CSMS→Trụ | `Reset {type: Soft}` | trụ trả `Accepted` |

## 4. Kết quả các kịch bản (`findings.json`)

| Kịch bản | Kết quả | Hệ quả cho story |
|---|---|---|
| **R-08** `SetChargingProfile` giữa phiên | Trụ nhận (`Accepted`) và công suất giảm 22 → 7 kW ở mẫu kế tiếp | Với **trụ ảo do nhóm viết**, E-08 kiểm được bằng công suất thật. R-08 hạ từ “không kiểm được” xuống “phải tự cài xử lý profile trong trụ ảo (≈ 10 dòng)”. Không suy ra được cho trụ thật |
| Mã trụ lạ (`/ocpp/KHONG-TON-TAI`) | Bị từ chối **HTTP 404 ngay lúc bắt tay**, không mở WebSocket; ghi được mã + IP | Đúng AC 2 của S-06 (T-13) |
| Subprotocol sai (`ocpp2.0.1`) hoặc **không khai** | **Mặc định thư viện vẫn chấp nhận nâng cấp**, chỉ không chọn subprotocol nào. Phải tự chặn trong `auth` (`handshake.protocols`) → HTTP 400 | S-06 AC 3: **bắt buộc code kiểm `ocpp1.6` tường minh**, đừng tin mặc định |
| Khung sai schema (thiếu `errorCode`) gửi thẳng | Máy chủ trả `CALLERROR OccurrenceConstraintViolation` kèm chi tiết, **không đóng kết nối** | Đúng AC 2 của S-07 |
| Rớt mạng giữa phiên (terminate socket) | Thư viện **tự nối lại** cùng identity; máy chủ vẫn giữ `transactionId`; phiên tiếp tục với cùng `transactionId` sau khi trụ tự báo lại `Charging` + gửi tiếp `MeterValues` | Chỉ đúng nếu trụ làm thế. **Thư viện không tự khôi phục phiên**, đó là việc của trụ và của S-21: đừng đóng phiên chỉ vì mất kết nối |
| **Cùng `messageId` gửi hai lần** (`StartTransaction`) | Thư viện **chạy lại handler và cấp `transactionId` thứ hai (1002 rồi 1003)** | **Bằng chứng cho S-14**: không có chống trùng thì gửi lại = hai phiên = tính tiền đôi. Chống trùng phải ở DB (R-03), không trông vào thư viện |

## 5. Trường dữ liệu phải lưu (theo schema OCPP 1.6 đã kiểm bằng khung thật)

| Tin nhắn | Bắt buộc | Tuỳ chọn (schema) | Ghi chú thiết kế bảng |
|---|---|---|---|
| `BootNotification` req | `chargePointVendor`, `chargePointModel` | `chargePointSerialNumber`, `firmwareVersion`, `iccid`, `imsi`, `meterType`, `meterSerialNumber`, `chargeBoxSerialNumber` | Lưu vendor/model/serial/firmware (T-16). resp: `status`, `currentTime`, `interval` |
| `Heartbeat` | — | — | resp `currentTime`; cập nhật `last_seen_at` |
| `StatusNotification` | `connectorId`, `errorCode`, `status` | `info`, `timestamp`, `vendorId`, `vendorErrorCode` | `connectorId` **0 = cả trụ**, ≥ 1 = đầu nối. `timestamp` **có thể vắng** → dùng giờ nhận |
| `Authorize` | `idTag` (**CiString20: tối đa 20 ký tự**) | — | Cột `id_tags.tag` cần ≥ 20; resp `idTagInfo.status`. Log chỉ 4 ký tự cuối |
| `StartTransaction` | `connectorId`, `idTag`, `meterStart`, `timestamp` | `reservationId` | resp **`transactionId` do CSMS cấp (int)** + `idTagInfo` |
| `MeterValues` | `connectorId`, `meterValue[]` | **`transactionId`** | ⚠️ `transactionId` là **tuỳ chọn**: số đo có thể tới không kèm phiên → bảng `orphan_messages` (T-41) là **bắt buộc**, không phải dự phòng. Mỗi `sampledValue`: `value` (chuỗi), `measurand`, `unit`, `context` |
| `StopTransaction` | `transactionId`, `timestamp`, `meterStop` | `idTag`, `reason`, `transactionData` | Thiếu `idTag` là hợp lệ. `reason` (`Local`, `EVDisconnected`, `PowerLoss`…) để đối soát |
| `Reset` (CSMS→trụ) | `type` (`Soft`/`Hard`) | — | resp `status` |
| `SetChargingProfile` (CSMS→trụ) | `connectorId`, `csChargingProfiles` | — | resp `status` |

## 6. Điều spike này KHÔNG chứng minh (đừng coi là đã xong)

1. Trụ thật/simulator thương mại có thể: gửi `Heartbeat` khác chu kỳ, không gửi `timestamp`, gửi `MeterValues` trước `StartTransaction` trả lời, dùng `transactionData` khi dừng, hoặc **không nối lại y như trụ ảo của mình**. S-21 phải được thử lại với ít nhất một thiết bị/simulator không do nhóm viết.
2. Chưa đo tải: T-12 yêu cầu ≥ 50 kết nối đồng thời trên staging; spike chỉ chạy 3 trụ.
3. Chưa thử OCPP Security profile (mật khẩu Basic Auth trong bắt tay) — hiện xác thực trụ chỉ bằng “mã có trong bảng” (đúng phạm vi S-06, nhưng ai biết mã là nối được).
4. `interval: 300` của `BootNotification` chỉ là gợi ý; chu kỳ thực do trụ quyết định — S-12 phải tính “quá hạn” theo giá trị đã cấp, không hằng số.

## 7. Khuyến nghị cho Sprint 2 (cần trưởng nhóm kỹ thuật quyết)

1. **Cân nhắc dùng `ocpp-rpc` ngay trong backend cho S-06/S-07** thay vì tự viết khung `CALL/CALLRESULT/CALLERROR` (T-14/T-15): có sẵn kiểm schema, mã lỗi chuẩn, khớp `CALLRESULT` theo mã, đóng kết nối đúng chuẩn, nối lại. Đánh đổi: thêm một phụ thuộc (MIT, có bảo trì). Nếu chọn tự viết thì dùng `session-log.json` làm dữ liệu test như backlog đã nêu.
2. `backend/src/server.js` hiện tại **phải thay hoàn toàn** (bản tin “welcome” ngoài chuẩn, nhận mọi mã trụ, không kiểm subprotocol, registry chỉ đếm). Không vá.
3. Đưa `k01/virtual-charge-point.js` thành nền của bộ trụ ảo S-26 (T-55) và bổ sung xử lý `RemoteStartTransaction`/`RemoteStopTransaction` khi tới Sprint 3.
