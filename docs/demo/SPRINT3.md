# Hướng dẫn demo Sprint 3 (S-17 → S-27) cho mentor

Mục tiêu: trong khoảng **25–30 phút**, chứng minh bằng chạy thật mục tiêu Sprint 3: **một phiên sạc chạy trọn vẹn từ lúc cắm tới lúc rút với số kWh đúng, dù trụ có mất kết nối giữa chừng.** Gồm 11 story: phiên sạc bắt đầu/kết thúc (S-17, S-18), số đo điện (S-19, S-20), khôi phục khi trụ nối lại (S-21), màn hình tài xế (S-22, S-24), vận hành dừng từ xa (S-23), phiên bất thường (S-25), trụ ảo trong compose/CI (S-26) và nhật ký điều khiển (S-27).

Công cụ dùng: trụ sạc ảo tương tác [`tools/demo-charge-point.js`](../tools/demo-charge-point.js) (mở phiên, ngắt/nối) và đội trụ ảo [`tools/vcp-fleet.js`](../tools/vcp-fleet.js) chạy trong `docker-compose` (tự gửi `MeterValues`, tự trả lời `RemoteStart/RemoteStop`).

> **Trạng thái đã đo (12/10/2026, trên `main` + nhánh sửa lỗi rà soát):** xem mục 7. Mọi kết quả "mong đợi" trong tài liệu này lấy từ lần chạy thật ngày 12/10/2026 trên backend + PostgreSQL trong Docker, trừ chỗ ghi **CHƯA KIỂM**.

## 1. Bản đồ story → chức năng → cách chứng minh

| Story | Chức năng | Chứng minh bằng | Mục |
|---|---|---|---|
| **S-17** | `StartTransaction` mở phiên `CHARGING`, cấp `transactionId`; thẻ khoá vẫn nhận nhưng đánh dấu cần xem xét; đầu nối đã có phiên thì phiên cũ thành `ABNORMAL`; đầu nối chưa khai báo bị từ chối | Trụ ảo: `start` ba kiểu (mục 3.1) | 3.1 |
| **S-18** | `StopTransaction` chốt kWh = (số đo cuối − số đo đầu) / 1000; gửi hai lần không đổi gì | Dừng từ xa rồi xem kWh chốt; SQL mục 5 | 3.4, 3.5 |
| **S-19** | `MeterValues` ghi liên tục (Energy, Power, Current, SoC) gắn đúng phiên | Đội trụ ảo `vcp`: kWh trên màn tài xế nhích theo thời gian | 3.3 |
| **S-20** | Số đo cũ/trùng bị bỏ, số đo Energy lùi thì lưu và bật cần xem xét | Bộ test tự động (mục 6); trụ ảo tương tác **không** có lệnh gửi `MeterValues` tay | 6 |
| **S-21** | Trụ mất kết nối giữa phiên rồi nối lại: phiên không bị đóng tự động, số đo xả hàng đợi không bị cắt, `StopTransaction` đến muộn vẫn chốt đúng | `drop` rồi `connect` (mục 3.2) + bảng số đã đo (mục 7) | 3.2 |
| **S-22** | Tài xế xem phiên đang sạc thời gian thực (kWh, công suất, SoC, thời gian) | Trình duyệt di động, tài khoản Tài xế | 3.3 |
| **S-23** | Vận hành/Quản trị dừng phiên từ xa, ba kết cục có thông báo riêng | Nút "Dừng phiên" + `remote-stop-mode` | 3.5 |
| **S-24** | Tài xế bắt đầu phiên từ ứng dụng bằng `RemoteStartTransaction`, chờ tối đa 60 giây; **mỗi tài xế một phiên** | Trang "Bắt đầu sạc" + đội trụ ảo | 3.3 |
| **S-25** | Phiên quá lâu không có tin kết thúc bị đánh dấu `ABNORMAL`, vận hành đóng tay có lý do | Trang "Phiên bất thường" | 3.6 |
| **S-26** | Đội trụ ảo chạy trong `docker-compose` và kịch bản ngắt–nối chạy trong CI (`session-scenario`) | `docker-compose up -d --no-deps vcp`; job CI | 3.8 |
| **S-27** | Mọi lệnh điều khiển từ xa ghi nhật ký kèm người thực hiện; bảng chỉ-chèn | Trang "Nhật ký điều khiển" (chỉ Quản trị) | 3.7 |

## 2. Chuẩn bị (làm trước buổi demo, khoảng 5 phút)

1. `python run.py` (tự build, tạo admin và dữ liệu demo). Xem cổng thật bằng `python run.py status`; các ví dụ dưới đây dùng 3000.
2. Sau khi sửa code cần chạy lại ứng dụng: `python run.py down` rồi `python run.py`. **Đừng** chạy `docker-compose up app` trực tiếp (xem mục 8: nó đặt lại mật khẩu admin).
3. Cần Node ≥ 18.3 và thư viện `ws` trên máy chạy trụ ảo (có sẵn khi đã `cd backend && npm ci`). Máy không có Node 22 có thể chạy trụ ảo trong container ứng dụng:

   ```
   docker run --rm -i --network host -v "$PWD/tools:/app/tools:ro" csms_app:latest \
     node /app/tools/demo-charge-point.js DEMO-ST05-CP1 --url ws://localhost:3000
   ```

   (Cho cổng khác 3000 thì đổi `--url`. Có thể đưa lệnh qua `printf '...' |` để chạy tự động.)
4. Chuẩn bị các cửa sổ:

   | Cửa sổ | Dùng để | Tài khoản |
   |---|---|---|
   | Trình duyệt 1 | **Admin / Vận hành** (Phiên sạc, Phiên bất thường, Nhật ký điều khiển) | `admin@csms.local` hoặc `operator@demo.csms.local` |
   | Trình duyệt 2 (ẩn danh, thu hẹp rộng khoảng 400 px như điện thoại) | **Tài xế** | `driver@demo.csms.local` |
   | Terminal A | Trụ ảo tương tác | — |
   | Terminal B | Đội trụ ảo `vcp` | — |

   Mật khẩu demo và admin: xem README, mục "Tài khoản có sẵn" (mật khẩu demo dùng chung cho các tài khoản `@demo.csms.local`). Dùng cửa sổ ẩn danh cho tài khoản thứ hai vì hai tài khoản chung cookie.
5. Giữ tab đang demo luôn hiển thị: trình duyệt ngừng tải dữ liệu khi tab bị ẩn.

### Dữ liệu dùng trong demo

| Thứ | Giá trị | Ghi chú |
|---|---|---|
| Thẻ hợp lệ | `TAG-DEMO-01` | Gắn với tài xế demo; phiên mở bằng thẻ này hiện ở màn Tài xế |
| Thẻ bị khoá | `TAG-BLOCKED-01` | `StartTransaction` trả `Blocked` |
| Trụ chính | `DEMO-ST05-CP1`, `DEMO-ST05-CP2` | Trạm ICTU Thái Nguyên, `ACTIVE` |
| Trụ trạm không `ACTIVE` | `DEMO-ST06-CP1/2` (ngừng), `DEMO-ST04-CP1/2` (bảo trì) | Thẻ hợp lệ vẫn bị `Blocked` khi mở phiên (đúng S-15) |

> Trạng thái đầu nối trong dữ liệu seed là **giả lập** (nhiều trụ ngoại tuyến vẫn hiện "Đang sạc"). Khi trụ ảo gửi Boot/StatusNotification thì dữ liệu được ghi đè bằng OCPP thật. Hãy nói điều này với mentor trước khi bật trụ ảo.

## 3. Kịch bản demo theo thứ tự

Gõ lệnh vào dấu nhắc `DEMO-ST05-CP1>` của trụ ảo (`help` để xem hết). Mũi tên `→` là khung trụ gửi, `←` là máy chủ trả.

### 3.1 S-17: `StartTransaction` (4 phút)

Mở trụ ảo: `node tools/demo-charge-point.js DEMO-ST05-CP1`. Trình duyệt 1 (Vận hành) mở **Phiên sạc**.

| Gõ | Mong đợi | Ý nghĩa |
|---|---|---|
| `start 1 TAG-DEMO-01 2000` | `transactionId` mới, `idTagInfo: Accepted`; trang **Phiên sạc** hiện phiên mới | Phiên `CHARGING`, `meter_start = 2000` |
| `start 1 TAG-DEMO-01 3000` (cùng đầu nối, khi phiên trên chưa kết thúc) | `transactionId` mới, `Accepted`; phiên cũ chuyển sang **Phiên bất thường** với lý do "Bị thay bằng phiên mới trên cùng đầu nối" | Mỗi đầu nối chỉ một phiên `CHARGING` |
| `start 2 TAG-BLOCKED-01 500` | Trụ in `StartTransaction không được chấp nhận: Blocked`, nhưng máy chủ **vẫn** cấp `transactionId` và phiên có dòng "Cần xem xét · Thẻ sạc không hợp lệ (trạng thái: Blocked)" | Backlog: thẻ khoá vẫn ghi phiên để không mất dữ liệu |

Điểm nói: log ứng dụng chỉ giữ 4 ký tự cuối của thẻ; `transactionId` do cơ sở dữ liệu cấp, không dựa vào giờ; gửi lại cùng `messageId` (S-14) hoặc cùng nội dung nhưng khác `messageId` đều trả cùng `transactionId`, không sinh phiên thứ hai (test `S-17.start-transaction-server.test.js`, ca AC4 và D4).

Đầu nối chưa khai báo (tuỳ chọn): chạy trụ với `--connectors 8` rồi `start 7` → máy chủ trả `CALLERROR PropertyConstraintViolation` ("Connector 7 is undeclared"), không tạo phiên, ghi `orphan_messages` với lý do `Undeclared connectorId: 7` (đã chạy thật 12/10, kiểm bằng SQL mục 5).

### 3.2 S-21: mất kết nối giữa phiên (4 phút)

1. `start 1 TAG-DEMO-01 7000` trên trụ có trạm `ACTIVE` (ví dụ `DEMO-ST05-CP1`).
2. `drop` (đóng êm) hoặc `kill` (cắt đột ngột như rút điện). Trụ về "Chưa rõ/Ngoại tuyến" trên **Trạng thái trụ**, nhưng trang **Phiên sạc** **vẫn còn phiên**: hệ thống **không đóng phiên chỉ vì trụ ngoại tuyến**.
3. `connect`. Trụ Boot lại; phiên vẫn `CHARGING`. Nếu trụ báo đầu nối `Available` trong lúc phiên còn mở, phiên được gắn cờ cần xem xét (lý do "Trụ báo đầu nối rảnh nhưng phiên vẫn đang mở"), **không tự đóng, không đoán kWh**.
4. Nói thêm (đã đo, mục 7): trụ nối lại có thể xả hàng trăm `MeterValues` dồn mà không bị đóng kết nối (bộ giới hạn token bucket, burst 400), rồi gửi `StopTransaction` muộn: hệ thống nhận theo `transactionId` và chốt đúng kWh; gửi `StopTransaction` lần hai không đổi gì.

Giới hạn: lệnh `start` của trụ ảo tương tác **không gửi `MeterValues`**, nên kWh chốt của phiên mở bằng lệnh này là 0. Muốn thấy kWh tăng, dùng đội trụ ảo (mục 3.3) hoặc kịch bản tự động của S-21 (mục 3.8).

### 3.3 S-19, S-22, S-24: kWh thời gian thực và bắt đầu từ ứng dụng (6 phút)

1. Bật đội trụ ảo (Terminal B). Mật khẩu admin cần truyền qua biến môi trường vì mặc định của compose khác mật khẩu cục bộ của `run.py`:

   ```
   ADMIN_PASSWORD=<mật khẩu admin cục bộ> VCP_COUNT=2 VCP_HEARTBEAT_INTERVAL=10 \
     docker-compose up -d --no-deps vcp
   ```

   Đội trụ tự tạo trạm `VCP-STATION-1` và trụ `VCP-001`, `VCP-002` qua API, kết nối OCPP, gửi Boot/Heartbeat/Status và trả lời `RemoteStart/RemoteStop`. Đã chạy thật ngày 12/10/2026: log `Toàn bộ 2 trụ ảo đã trực tuyến và gửi Heartbeat định kỳ`. Nếu sai mật khẩu admin, dịch vụ tự khởi động lại và thử đăng nhập liên tục nên **bị khoá tạm (HTTP 429)**; khi đó `docker stop` dịch vụ, chờ hết khoá, truyền đúng mật khẩu rồi bật lại (mục 8).
2. Trình duyệt 2 (Tài xế) → **Bắt đầu sạc**: chọn trụ `VCP-…` → đầu nối 1 → **Bắt đầu sạc**. Đã kiểm với chính dịch vụ `vcp`: trụ nhận `RemoteStartTransaction` với thẻ ảo của tài xế, gửi `StartTransaction`, trang tự chuyển sang **Phiên sạc trực tiếp**; sau khoảng 14 giây trang hiện 0,1 kWh, 7,2 kW, 32 A, SoC 21 %. Mã thẻ hiển thị dạng `***************D0D8` (thẻ ảo, chỉ 4 ký tự cuối).
3. Trang Phiên sạc trực tiếp hiện **Điện năng đã nạp (kWh)**, thời gian sạc, công suất, dòng điện, pin xe (SoC), thông tin trạm; số liệu đổi mỗi vài giây (SSE).
4. Thử nút khi đầu nối chưa sẵn sàng: chọn trụ ngoại tuyến → nút **Bắt đầu sạc** bị vô hiệu, di chuột hiện lý do.
5. **Mỗi tài xế một phiên:** khi tài xế đang có phiên `CHARGING`, bấm bắt đầu thêm một đầu nối khác trả lỗi 409 "Bạn đang có một phiên sạc…", và **không** có lệnh nào gửi xuống trụ (test `S-24.remote-start.test.js`).

### 3.4 S-18: kết thúc và chốt kWh (2 phút)

Dừng phiên ở mục 3.5, hoặc trên trụ ảo tương tác dừng bằng lệnh từ xa. Kiểm DB (mục 5): `meter_stop`, `stop_reason` (= `Remote` hoặc `Local`), `status = COMPLETED`. kWh = `(meter_stop − meter_start) / 1000`, không cộng dồn từng lần báo. Số đo cuối nhỏ hơn số đo đầu thì phiên hoàn tất nhưng bật cần xem xét, **không** ghi số âm.

### 3.5 S-23: vận hành dừng phiên từ xa (4 phút)

Trình duyệt 1 (Vận hành hoặc Admin) → **Phiên sạc** → **Dừng phiên** → xác nhận. Trạng thái "Trụ đã chấp nhận yêu cầu dừng. Đang chờ xác nhận kết thúc phiên · còn mm:ss" (tối đa `REMOTE_STOP_WAIT_SECONDS`, mặc định 120 giây). Phiên **chỉ đóng khi `StopTransaction` thật đến** (lý do `Remote`), không đóng khi trụ mới nói `Accepted`.

Ba kết cục khác nhau (đổi bằng lệnh trụ ảo tương tác):

| Chuẩn bị ở trụ ảo | Kết cục trên giao diện |
|---|---|
| `remote-stop-mode accept` (mặc định) | "Phiên #N đã kết thúc theo xác nhận từ trụ" |
| `remote-stop-mode reject` hoặc `error` | "Trụ sạc từ chối yêu cầu dừng phiên. Phiên vẫn đang hoạt động." (422) |
| `remote-stop-mode silent` | Sau thời gian chờ: "Chưa nhận được phản hồi từ trụ…" (504), phiên được gắn cần xem xét |
| `drop` rồi bấm dừng | "Không thể dừng phiên vì trụ sạc đang ngoại tuyến." (409) |

Chặn bấm hai lần: khi đã có lệnh dừng chờ, nút đổi thành "Đang chờ trụ". Sau khi demo: `remote-stop-mode accept`.

### 3.6 S-25: phiên bất thường và đóng tay (3 phút)

Dùng phiên bị thay ở mục 3.1 (hoặc bất kỳ phiên `ABNORMAL`). Trình duyệt 1 → **Phiên bất thường**:

- Vận hành/Quản trị thấy ô **Lý do đóng** và nút **Đóng phiên**; **Kế toán chỉ xem** (API trả 403 khi cố đóng).
- Phiên có số đo Energy: nhập lý do → **Đóng phiên** → hiện "số điện năng chốt X kWh" theo **số đo Energy cuối cùng đã có**.
- Phiên **chưa có số đo năng lượng nào** (ví dụ phiên bị thay thế ngay khi vừa mở): giao diện hiện thêm ô tích **"Phiên chưa có số đo năng lượng: xác nhận đóng với 0 kWh"**. Phải tích ô này mới đóng được; kết quả "số điện năng chốt 0 kWh". (Bản trước ngày 12/10 không có ô này nên phiên loại này **không thể đóng** từ giao diện.)
- Phiên bất thường nhận `StopTransaction` muộn thì tự đóng bình thường và rời danh sách.

Điểm nói: job quét phiên bất thường chạy mỗi phút, chỉ đổi `status = ABNORMAL`, **không đóng phiên**, chạy hai lần không có tác dụng phụ; ngưỡng `SESSION_ABNORMAL_AFTER_SECONDS` mặc định 6 giờ (không có biến trong `docker-compose.yml`, nên khó rút ngắn khi demo; vì vậy demo bằng phiên bị thay).

### 3.7 S-27: nhật ký điều khiển (2 phút)

Đăng nhập **Admin** → **Nhật ký điều khiển**. Có hai dòng cho mỗi lệnh dừng: "DỪNG SẠC TỪ XA · Đã chấp nhận" (lúc gửi lệnh) và "Đã dừng" (lúc trụ xác nhận), kèm người thực hiện, trụ, địa chỉ IP. Lọc theo trụ, người thực hiện, khoảng ngày; nút **Xem JSON** hiện dữ liệu kèm (không chứa mã thẻ). Lệnh bắt đầu từ xa (`REMOTE_START`) và đóng tay cũng ghi vào đây.

Vai trò: **chỉ Admin** đọc nhật ký (Vận hành/Kế toán/Chủ trạm bị chặn 403). Bảng `audit_logs` chỉ-chèn: `UPDATE`, `DELETE`, `TRUNCATE` bị cơ sở dữ liệu từ chối (trigger, migration 029 và 031); `PUT/PATCH/DELETE /api/audit-logs/:id` trả 405.

### 3.8 S-26: trụ ảo trong compose và CI (2 phút)

- Compose: dịch vụ `vcp` (mục 3.3).
- CI: job `session-scenario` trong `.github/workflows/ci.yml` (cần `lint-and-test`, giới hạn 5 phút, chạy kịch bản ngắt–nối trên CSMS + PostgreSQL tạm). Kết quả các lần chạy trên GitHub **CHƯA kiểm** trong buổi chuẩn bị này; hãy mở tab Actions của PR gần nhất trước demo.
- Kịch bản đầy đủ 20 trụ: `node tools/test-s21-reconnect-fleet.js --count 20 --runs 3` (cần quyền admin staging và `STAGING_DATABASE_URL` chỉ đọc). **CHƯA chạy** ở quy mô 20 trụ trên staging vì chưa có URL staging; hồ sơ S-21 ghi bản chạy 5 trụ khớp.

## 4. Bảng lệnh trụ ảo (phần mới của Sprint 3)

| Lệnh | Việc |
|---|---|
| `start <connectorId> [idTag] [meterStartWh]` | Gửi `StartTransaction` (mặc định `TAG-DEMO-01`, `meterStart` 10000) |
| `remote-stop-mode accept\|reject\|silent\|error` | Cách trả lời `RemoteStopTransaction` (S-23); `accept` gửi `StopTransaction` lý do `Remote` |
| `drop`, `kill`, `connect` | Ngắt êm, cắt đột ngột, nối lại (S-21) |

Các lệnh Sprint 2 (`boot`, `hb`, `status`, `auth`, `dup`, `badframe`, `reset-mode`…) xem [`DEMO_SPRINT2.md`](DEMO_SPRINT2.md) mục 4.

## 5. Kiểm chứng trong cơ sở dữ liệu

```
docker-compose exec db psql -U csms -d csms
```

```sql
-- S-17, S-18, S-21, S-25: phiên, trạng thái, cờ xem xét, số đo đầu/cuối
select id, status, needs_review, review_reason, meter_start, meter_stop, stop_reason, remote_stop_status
  from charging_sessions order by id desc limit 10;

-- S-19, S-20: số đo đã ghi cho một phiên (thay 7 bằng mã phiên)
select measurand, value, unit, sampled_at from meter_values where session_id = 7 order by sampled_at desc limit 10;

-- S-17: tin bị từ chối được giữ lại để điều tra (idTag đã che)
select action, reason, received_at from orphan_messages order by id desc limit 5;

-- S-27: nhật ký điều khiển
select id, action, result, user_id, created_at from audit_logs order by id desc limit 10;
```

## 6. Bằng chứng tự động đã chạy

| Hạng mục | Kết quả |
|---|---|
| `python test.py` (lint + unit + integration + acceptance), 12/10/2026 trên `main`, trước khi sửa lỗi rà soát | **ĐẠT, 710 test pass, 0 fail, 358 giây** |
| `python test.py` sau khi sửa lỗi rà soát (nhánh `loc/GYM-51-ra-soat-sprint3`), 12/10/2026 | **ĐẠT, 723 test pass, 0 fail, 332 giây** (+13 test mới) |
| `python3 -m unittest discover -s tools -q` | 21 test, OK |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |
| Số đo (S-20): cũ, trùng, lùi, mẫu đến lệch thứ tự | `backend/tests/unit/meter-rules.test.js`, `ocpp-meter-values.test.js`; hồ sơ [`kiem-thu-S-20.md`](testing/stories/S/kiem-thu-S-20.md) |
| Khôi phục khi nối lại (S-21) | `ocpp-presence-lifecycle.test.js`, `ocpp-stop-transaction-server.test.js`, `ws-connection-rate-limit.test.js`; hồ sơ [`kiem-thu-S-21.md`](testing/stories/S/kiem-thu-S-21.md) |
| Dừng từ xa (S-23), bắt đầu từ xa (S-24) | `S-23.remote-stop.test.js`, `S-24.remote-start.test.js` |

## 7. Số liệu đo thật ngày 12/10/2026 (script tạm, không nằm trong repo)

Phiên sạc 1 đầu nối: mở phiên (meter_start 0) → 1 `MeterValues` → **ngắt kết nối đột ngột** → nối lại sau 3 giây → Boot → **xả 200 `MeterValues` liên tục** → `StopTransaction` (meter_stop 3000) → gửi `StopTransaction` lần hai với meter_stop 9999.

| Kiểm tra | Kết quả |
|---|---|
| Kết nối có bị đóng khi xả 200 tin dồn không | Không (token bucket) |
| Trạng thái phiên cuối | `COMPLETED`, `meter_stop = 3000` (3 kWh), lý do `Local` |
| `StopTransaction` lần hai (9999) | Trả lời `{}`, **không** đổi `meter_stop` |
| Số dòng `meter_values` của phiên | 201 |

Luồng giao diện đã duyệt bằng Chrome: Admin dừng phiên từ xa → hai dòng nhật ký; Tài xế xem phiên trực tiếp (kWh, công suất, SoC) và bắt đầu từ xa; Vận hành đóng phiên bất thường; Chủ trạm chỉ thấy phiên trạm của mình; Kế toán chỉ xem.

## 8. Sự cố khi demo

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `KeyError: 'ContainerConfig'` khi `docker-compose up` | docker-compose 1.x với Docker mới (như trong `DEMO_SPRINT2.md`); container `app` bị dừng và đổi tên thành `<mã>_…_app_1` | `docker rm` container đã dừng đó rồi `python run.py` (hoặc `python run.py down` rồi `python run.py`) |
| Đăng nhập admin báo sai mật khẩu sau khi chạy `docker-compose up app` | Script tạo admin của compose đặt lại mật khẩu về mặc định của compose | Chạy lại `python run.py` (nó đặt lại mật khẩu cục bộ). Luôn dùng `run.py` để khởi động ứng dụng |
| `vcp` báo `HTTP 401` rồi `HTTP 429` | `ADMIN_PASSWORD` truyền cho `vcp` khác mật khẩu admin thật; dịch vụ tự khởi động lại và thử tiếp nên tài khoản bị khoá tạm (15 phút, lưu trong bảng `login_throttle`, **không** mất khi khởi động lại ứng dụng) | `docker stop` dịch vụ `vcp`, chờ hết khoá, truyền đúng mật khẩu rồi bật lại. Trên máy cục bộ có thể `delete from login_throttle;` |
| `HTTP 429` khi trụ ảo kết nối | Quá 5 lần bắt tay / 10 giây với cùng mã | Chờ 10 giây |
| Trang Tổng quan hiện "—" mãi, danh sách trụ không tự cập nhật | Trình duyệt ngừng tải khi tab bị ẩn (`document.hidden`; đã gặp với trình duyệt tự động hoá) | Đưa tab lên trước hoặc tải lại trang |
| Bấm "Dừng phiên" mà trình duyệt tự động bị treo | Nút dùng hộp thoại xác nhận của trình duyệt | Bấm OK thủ công (công cụ tự động phải bỏ qua hộp thoại) |

## 9. Câu hỏi mentor hay hỏi và giới hạn cần nói thật

| Câu hỏi | Trả lời trung thực |
|---|---|
| Trụ nào cũng kết nối được nếu biết mã? | **Còn đúng (B5):** trụ chưa xác thực. Đã có kiểm chứng cùng trụ khi gửi `StopTransaction`/`MeterValues` (chỉ trụ sở hữu phiên mới sửa được số đo, D12), nhưng chưa có khoá/mật khẩu trụ. Phải chốt **trước khi tính tiền** (Sprint 4). Xem [`B5-xac-thuc-tru-de-xuat-thiet-ke.md`](B5-xac-thuc-tru-de-xuat-thiet-ke.md). |
| Một tài xế có thể sạc hai xe cùng lúc không? | **Không qua ứng dụng:** bắt đầu từ xa bị chặn khi tài xế đang có phiên `CHARGING` (409). Nhưng **trụ vẫn có thể gửi `StartTransaction` với thẻ của tài xế** trên đầu nối khác (thẻ vật lý cắm tại trụ): hệ thống ghi cả hai phiên, màn hình Tài xế chỉ hiển thị một. Đây là quy tắc nghiệp vụ cần PO chốt. |
| Phiên mở bằng thẻ bị khoá thì sao? | Máy chủ trả `Blocked` nhưng **vẫn tạo phiên** `CHARGING` có cờ cần xem xét (theo AC của S-17); phiên đó hiện ở **Phiên sạc**, không hiện ở **Phiên bất thường** (vì chưa `ABNORMAL`). Cần PO xác nhận trụ có tiếp tục cấp điện hay không (trụ thật tự quyết theo `idTagInfo`). |
| Chủ trạm và Kế toán có xem được phiên sạc không? | API cho Chủ trạm xem phiên của trạm mình (và trả cả `driver_id`, **dữ liệu cá nhân theo NĐ 13**, cần PO xác nhận có che không), nhưng **giao diện chưa có menu "Phiên sạc"** cho Chủ trạm và Kế toán (Sprint 3 chưa cam kết màn này cho hai vai trò). Kế toán chỉ có "Phiên bất thường". |
| Chạy nổi 20/50 trụ chưa? | Kịch bản 20 trụ ngắt–nối **chưa chạy trên staging** (chưa có URL staging); đã có bản 5 trụ trong CI. Registry kết nối nằm trong bộ nhớ, đúng khi chạy **một tiến trình**; SSE cũng vậy. |
| Trụ thật có chạy được không? | Chưa thử với trụ thật; trụ ảo viết tay qua `ws`, độc lập với khung của backend. |
| Đồng hồ trụ lệch thì sao? | Mốc thời gian trong tin chỉ được tin trong ±24 giờ; ngoài đó dùng giờ máy chủ và bật cần xem xét (D6). |
| Tính tiền ở đâu? | **Chưa có**; kWh là số nguyên Wh trong DB, tính kWh không làm tròn (D2), để Sprint 4 dùng. |
| Trạng thái Jira? | **Chưa đối chiếu bằng API** trong buổi chuẩn bị này. |

### Lỗi giao diện đã sửa trong đợt rà soát 12/10 (để mentor không thấy lỗi cũ)

- Phiên bất thường không có số đo không thể đóng → thêm ô tích "đóng với 0 kWh" (S-25).
- Lý do cần xem xét hiện tiếng Anh → dịch sang tiếng Việt.
- Trang "Bắt đầu sạc": nút bấm được cả khi trụ ngoại tuyến và báo sai "đã đặt chỗ"; lộ chữ `StartTransaction`; chữ dính "Đầu nối 1TYPE_2"; không tự cập nhật trạng thái trụ (nay làm mới mỗi 10 giây).
- Hiển thị "kWh —" đổi thành "— kWh"; mã thẻ không còn bị che hai lần; bỏ thông báo dừng phiên bị lặp.
- Tài xế đang có phiên không mở thêm được phiên thứ hai từ ứng dụng (409 `DRIVER_HAS_ACTIVE_SESSION`).
