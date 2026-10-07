# Hướng dẫn demo Sprint 2 (S-06 → S-16) cho mentor

Mục tiêu: trong khoảng **20–25 phút**, chứng minh bằng chạy thật cả 11 story của Sprint 2 (kết nối OCPP, nhịp tim, trạng thái đầu nối, màn hình realtime, ngoại tuyến, chống trùng, kiểm thẻ, Reset từ xa), không cần trụ sạc thật. Công cụ dùng: **trụ sạc ảo tương tác** [`tools/demo-charge-point.js`](../tools/demo-charge-point.js).

Mọi kết quả "mong đợi" bên dưới đã được chạy thật trên backend + Postgres ngày 07/10/2026 (nhịp tim 5 giây và thời gian chờ lệnh 5 giây; riêng nhịp tim 2 giây đã kiểm lại ngày 07/10/2026 trên chính cấu hình dưới đây).

## 1. Bản đồ story → chức năng → cách chứng minh

| Story | Chức năng | Chứng minh bằng | Mục |
|---|---|---|---|
| **S-06** | Trụ đã đăng ký kết nối được, trụ lạ bị từ chối | `probe`: 5 ca bắt tay (101 / 403 / 400 / 400 / 400) | 3.1 |
| **S-07** | Đọc/ghi đúng ba loại khung CALL / CALLRESULT / CALLERROR | `badframe all`: 6 khung hỏng → CALLERROR đúng mã, **kết nối vẫn mở** | 3.4 |
| **S-08** | `BootNotification`, khoá trạm | Trụ khởi động `Accepted` + `interval`; tin trước Boot → `SecurityError`; Admin khoá → `Rejected` | 3.2, 3.9 |
| **S-09** | Heartbeat, `last_seen_at` theo giờ máy chủ | `hb`, `skew 5` rồi so với DB | 3.2 |
| **S-10** | `StatusNotification` từng đầu nối, lỗi mức đầu nối và mức trụ | `status`, `play`: đầu nối đổi màu; bảng `connector_errors` | 3.3 |
| **S-11** | Màn hình Trạng thái trụ tự cập nhật, đúng phạm vi chủ trạm | Hai cửa sổ trình duyệt (Admin / Chủ trạm) | 3.2, 3.10 |
| **S-12** | Quá hạn nhịp tim → ngoại tuyến, nối lại → trực tuyến | `silence`, `drop`, `connect` | 3.7 |
| **S-13** | Cùng mã trụ mở hai kết nối thì kết nối cũ bị đóng | `twin`: kết nối cũ đóng với mã 1000 | 3.8 |
| **S-14** | Tin trùng `messageId` nhận lại đúng câu trả lời cũ | `dup`: hai lần gửi, một câu trả lời + dòng log "Duplicate CALL" | 3.5 |
| **S-15** | Kiểm thẻ qua `Authorize` | `auth-all`: 5 ca; trạm bảo trì → `Blocked` | 3.6 |
| **S-16** | Reset từ xa (Vận hành/Quản trị) | Nút "Khởi động lại" + 4 kết cục: 200 / 422 / 504 / 409 | 3.7 |

## 2. Chuẩn bị (làm trước buổi demo, khoảng 5 phút)

1. **Bật hai tham số demo** trong file `.env` ở thư mục gốc (nếu chưa có file, chạy `python run.py` một lần để tạo), rồi chạy lại:

   ```
   OCPP_HEARTBEAT_INTERVAL=2
   OCPP_COMMAND_TIMEOUT_SECONDS=5
   ```

   Mặc định nhịp tim là 60 giây (trụ ngoại tuyến sau ≥ 2 phút) và Reset chờ 30 giây, quá chậm để demo trực tiếp. Với nhịp tim 2 giây, trụ im lặng quá **4 giây** (2 × 2) là bị coi ngoại tuyến. Có thể dùng 5 nếu thấy 2 giây dồn dập quá (khi đó là 10 giây).

   > Đổi `.env` xong cần **tạo lại container `app`**. Máy dùng `docker-compose` 1.x với Docker mới thì `python run.py` hoặc `docker-compose up -d app` có thể lỗi `KeyError: 'ContainerConfig'` và để lại container `<mã>_…_app_1` đã dừng. Cách an toàn: `python run.py down` rồi `python run.py` (hoặc `docker rm` container đã dừng đó rồi `docker-compose up -d app`).
2. `python run.py` (tự build, tạo admin và dữ liệu demo). `run.py` **tự đổi cổng khi 3000 đang bận** và ghi vào `APP_PORT` trong `.env`; xem cổng thật bằng `python run.py status` rồi mở `http://localhost:<cổng>`. Trụ ảo tự đọc `APP_PORT` từ `.env`, nên thường không cần `--url`. Nếu trụ báo `ECONNREFUSED` nghĩa là máy chủ chưa chạy hoặc sai cổng. Các ví dụ dưới đây dùng 3000, hãy thay bằng cổng của bạn.
3. Cần Node ≥ 18.3 trên máy chạy công cụ và thư viện `ws` (có sẵn khi đã `cd backend && npm ci`).
4. Chuẩn bị **4 cửa sổ**:

   | Cửa sổ | Dùng để | Lệnh / địa chỉ |
   |---|---|---|
   | Trình duyệt 1 | **Admin** (trang Trạng thái trụ) | `admin@csms.local` / `admin` |
   | Trình duyệt 2 (ẩn danh) | **Chủ trạm 2** | `owner2@demo.csms.local` / `demo12345` |
   | Terminal A | Trụ ảo | `node tools/demo-charge-point.js DEMO-ST05-CP1` |
   | Terminal B | Log ứng dụng | `python run.py logs` |

   Dùng cửa sổ ẩn danh cho tài khoản thứ hai vì hai tài khoản trên cùng một trình duyệt dùng chung cookie đăng nhập.
5. **Giữ tab "Trạng thái trụ" luôn hiển thị**: trình duyệt ngừng tải khi tab bị ẩn. Nếu lỡ ẩn, bấm **Làm mới**.
6. Tuỳ chọn: terminal C mở psql (mục 5) để cho mentor xem dữ liệu gốc.

### Tài khoản và mã trụ dùng trong demo

| Tài khoản | Mật khẩu | Thấy gì |
|---|---|---|
| `admin@csms.local` | `admin` | Tất cả; **khoá/mở khoá trạm**; Reset |
| `operator@demo.csms.local` | `demo12345` | Tất cả trạm; Reset |
| `owner@demo.csms.local` | `demo12345` | 4 trạm ST01–ST04; **không** có nút Reset |
| `owner2@demo.csms.local` | `demo12345` | 2 trạm ST05–ST06 |

| Mã trụ | Trạm | Trạng thái trạm | Dùng cho |
|---|---|---|---|
| `DEMO-ST05-CP1` | ICTU Thái Nguyên (owner2) | ACTIVE | **Trụ chính của buổi demo** |
| `DEMO-ST01-CP1` | Cầu Giấy (owner) | ACTIVE | Thử trụ thứ hai, so sánh phạm vi |
| `DEMO-ST04-CP1` | Long Biên (owner) | MAINTENANCE | S-15: trạm bảo trì |
| `DEMO-ST06-CP1` | Sông Công (owner2) | INACTIVE | S-15: trạm ngừng |

Thẻ demo: `TAG-DEMO-01` (hợp lệ), `TAG-BLOCKED-01` (bị khoá), `TAG-EXPIRED-01` (quá hạn từ 01/01/2025).

> Trạng thái đầu nối trong dữ liệu seed là **giả lập**. Ngay khi trụ ảo gửi Boot, công cụ báo tất cả đầu nối `Available` nên chúng được ghi đè bằng dữ liệu OCPP thật. Hãy nói điều này với mentor trước khi bật trụ ảo.

## 3. Kịch bản demo theo thứ tự

Gõ lệnh vào dấu nhắc `DEMO-ST05-CP1>` của trụ ảo (gõ `help` để xem hết). Mũi tên `→` là khung trụ gửi, `←` là máy chủ trả.

### 3.1 S-06: bắt tay (1 phút)

Thoát trụ ảo nếu đang chạy, rồi ở terminal bất kỳ:

```
node tools/demo-charge-point.js probe DEMO-ST05-CP1
```

Mong đợi, 5 dòng **ĐẠT**:

| Ca | Kết quả |
|---|---|
| Mã đã đăng ký + `ocpp1.6` | 101, mở kết nối |
| Mã chưa đăng ký | **403** |
| Sai subprotocol (`ocpp1.5`) | 400 |
| Không có subprotocol | 400 |
| Mã sai định dạng | 400 |

Terminal B hiện đúng một dòng cảnh báo: `[SECURITY_WARN] Unauthorized WebSocket attempt | IP: … | ChargePointCode: "ZZ-KHONG-TON-TAI"` (mã + IP, không log header).
Điểm nói: **trạm bảo trì/ngừng hoạt động vẫn được kết nối** (AC 4), chỉ không được bắt đầu phiên sạc (Sprint 3). Thử: `node tools/demo-charge-point.js DEMO-ST04-CP1` → vẫn `Boot Accepted`.

> Giới hạn bắt tay là 5 lần / 10 giây / (IP, mã trụ). Đừng gõ `connect` liên tục.

### 3.2 S-08, S-09, S-11: Boot, nhịp tim, màn hình realtime (3 phút)

1. Trình duyệt 1 (Admin) → **Trạng thái trụ**. Quan sát `DEMO-ST05-CP1` đang là dữ liệu seed.
2. Terminal A: `node tools/demo-charge-point.js DEMO-ST05-CP1`. Mong đợi:
   - `Boot Accepted. Nhịp tim 2s` (khoảng nhịp tim lấy từ cấu hình máy chủ, `interval` trong câu trả lời).
   - Trụ chuyển **Trực tuyến**, cả hai đầu nối **Rảnh**, không cần tải lại trang (S-11: SSE).
3. Heartbeat tự chạy mỗi 2 giây (dòng mờ `♥ Heartbeat OK`). Gõ `hb` để gửi tay.
4. **S-09, đồng hồ trụ lệch 5 giờ:** gõ `skew 5` rồi `hb`. Trụ giờ nói giờ lệch nhưng "liên lạc cuối" vẫn là giờ máy chủ:

   ```
   select last_seen_at, now() from charge_points where code = 'DEMO-ST05-CP1';
   ```

   Chênh nhau dưới 2 giây.
5. **S-08, tin trước Boot:** mở terminal khác `node tools/demo-charge-point.js DEMO-ST01-CP1 --no-boot`, gõ `auth TAG-DEMO-01` → `CALLERROR SecurityError: Charge point is not accepted yet`. Gõ `boot` thì tin kế tiếp mới được nhận.

### 3.3 S-10: trạng thái đầu nối, lỗi mức đầu nối và mức trụ (3 phút)

| Gõ | Trên màn hình | Ghi chú |
|---|---|---|
| `status 1 Charging` | Đầu nối 1 → **Bận** trong < 1 giây | OCPP `Charging` gom về nhóm "Bận" |
| `status 1 Faulted OverCurrentFailure` | Đầu nối 1 → **Lỗi** | Ghi một dòng `connector_errors` |
| `status 0 Faulted GroundFailure` | Thẻ đỏ **"Lỗi mức trụ: GroundFailure"** | `connectorId 0` = cả trụ |
| `status 1 Available` | Đầu nối 1 → Rảnh | **Không xoá** dòng lỗi cũ (lịch sử) |
| `status 9 Available` | Không đổi | `connectorId` không tồn tại: bỏ qua, trả `{}` |

Terminal B có dòng cảnh báo, gom theo trụ (tối đa 1 lần / phút), không tạo đầu nối mới:
`[OCPP] StatusNotification: Không tìm thấy đầu nối của trụ "DEMO-ST05-CP1" | connectorId: 9`.

Có thể thay chuỗi trên bằng `play 3` (đầu nối 1 chạy Preparing → Charging → SuspendedEV → Faulted → Available, mỗi bước 3 giây).

Kiểm DB (mục 5): `select * from connector_errors order by id desc limit 5;`

### 3.4 S-07: khung hỏng (1 phút)

Gõ `badframe all`. Mong đợi 6 dòng **ĐẠT**, sau đó dòng xanh "Kết nối VẪN MỞ":

| Khung gửi | CALLERROR nhận được |
|---|---|
| Không phải JSON | `FormationViolation` |
| JSON nhưng không phải mảng | `FormationViolation` |
| Loại khung lạ (`[9,…]`) | `ProtocolError` |
| CALL thiếu phần tử | `FormationViolation` |
| Tải không phải đối tượng | `FormationViolation` |
| Hành động chưa hỗ trợ (`FooBar`) | `NotImplemented` |

Điểm nói: máy chủ **không đóng kết nối** khi gặp khung sai, chỉ trả lỗi chuẩn OCPP.

### 3.5 S-14: tin trùng (1 phút)

Gõ `dup` (mặc định gửi `Authorize TAG-DEMO-01` hai lần **cùng `messageId`**). Mong đợi:

- Hai câu trả lời giống hệt, dòng xanh "máy chủ phát lại câu đã lưu".
- Terminal B: `[OCPP] Duplicate CALL, replaying stored response | messageId: "…" | action: "Authorize"`.

Biến thể (quy tắc F8): `dup TAG-DEMO-01 TAG-BLOCKED-01` gửi **cùng `messageId` nhưng nội dung khác** → lần hai được xử lý như tin mới (`Accepted` rồi `Blocked`), không bị phát lại câu cũ sai.
Điểm nói: bản ghi nằm ở bảng `ocpp_messages` nên khởi động lại máy chủ vẫn nhận ra tin trùng; Heartbeat và Boot được loại khỏi cơ chế này.

### 3.6 S-15: kiểm thẻ (2 phút)

Gõ `auth-all` trên `DEMO-ST05-CP1` (trạm ACTIVE):

| Thẻ | Kết quả |
|---|---|
| `TAG-DEMO-01` | `Accepted` |
| `TAG-BLOCKED-01` | `Blocked` |
| `TAG-EXPIRED-01` | `Expired` |
| `TAG-KHONG-TON-TAI` | `Invalid` |
| Thẻ dài hơn 20 ký tự | CALLERROR `FormationViolation` |

Ca thứ 5 của AC (**trạm tạm ngừng**): chạy `node tools/demo-charge-point.js DEMO-ST04-CP1` rồi `auth TAG-DEMO-01` → **`Blocked`** dù thẻ hợp lệ (làm tương tự với `DEMO-ST06-CP1`).
Điểm nói: log ứng dụng chỉ giữ **4 ký tự cuối** của thẻ (`idTag: *******O-01 -> Accepted`), và ngoài bốn trạng thái chuẩn không lộ lý do.

### 3.7 S-16 và S-12: Reset từ xa, ngoại tuyến (5 phút)

**Reset (S-16).** Trình duyệt 1 → **Trạng thái trụ** → nút **Khởi động lại** trên thẻ `DEMO-ST05-CP1` → chọn Mềm hoặc Cứng.

| Chuẩn bị ở trụ ảo | Kết cục trên giao diện | HTTP |
|---|---|---|
| `reset-mode accept` (mặc định) | Thông báo đã gửi lệnh; trụ ảo in `⇦ Máy chủ gửi lệnh Reset`, tự ngắt, chờ 3 giây rồi Boot lại, trụ về Trực tuyến | 200 |
| `reset-mode reject` | Lỗi "Trụ sạc từ chối Reset" | 422 |
| `reset-mode error` | Lỗi "Trụ sạc từ chối Reset: …" (trụ trả CALLERROR) | 422 |
| `reset-mode silent` | Sau **5 giây** (đã cấu hình): "Trụ sạc không phản hồi kịp thời" | 504 |
| `drop` (đóng kết nối) | **Ngay lập tức**: "Trụ sạc không có kết nối OCPP" | 409 |

Điểm nói: lệnh này là lần đầu máy chủ gọi **xuống** trụ; cơ chế chờ theo `messageId` sẽ dùng lại cho S-23/S-24. Nút Reset chỉ hiện với **Admin và Vận hành**; đăng nhập chủ trạm sẽ không thấy nút, và API cũng chặn ở backend.
Sau khi demo xong: `reset-mode accept`, `connect`.

**Ngoại tuyến (S-12).**

1. Gõ `silence`: trụ **ngừng Heartbeat nhưng giữ kết nối** (giả lập trụ treo).
2. Chờ hơn **4 giây** (2 × nhịp tim 2 giây), bấm **Làm mới**: thẻ chuyển **Ngoại tuyến**, hiện **"Liên lạc cuối: …"** (đã đo: im lặng ~3 giây vẫn Trực tuyến, ~6 giây thì Ngoại tuyến).
3. Các đầu nối chỉ về "Chưa rõ" khi trạng thái trong DB được job quét mỗi **60 giây** đồng bộ, chậm nhất khoảng 70 giây (đo thực tế: 29 giây). Cờ ngoại tuyến trên giao diện lại **suy ra từ `last_seen_at` ngay lúc truy vấn**, nên không phải chờ job và khởi động lại máy chủ vẫn đúng.
4. Gõ `resume`: trụ trở lại **Trực tuyến**.

Biến thể "mất kết nối thật": `drop` (đóng êm) hoặc `kill` (cắt đột ngột như rút điện) → trụ về **"Chưa rõ"** ngay lập tức vì máy chủ biết socket đã đóng; `connect` để nối lại.

> Lưu ý đúng với thực tế: Reset chỉ báo 409 khi **không còn socket OCPP**. Trụ bị đánh dấu Ngoại tuyến nhưng socket còn mở (như sau `silence`) vẫn nhận lệnh Reset bình thường.

### 3.8 S-13: kết nối trùng (1 phút)

Khi `DEMO-ST05-CP1` đang trực tuyến, gõ `twin`. Mong đợi: `Mở kết nối thứ hai cùng mã` → `Kết nối #N đã đóng (mã 1000)` cho kết nối cũ, kết nối mới Boot `Accepted` và thành kết nối đang dùng. Không có thời gian chờ cho kết nối "chết ngầm".

### 3.9 S-08: khoá trạm (3 phút)

1. Trình duyệt 1 (Admin) → **Trạm sạc** → bấm trạm **ICTU Thái Nguyên** → ngăn bên phải, mục **"Khoá trạm (Quản trị)"** → **Khoá trạm** → xác nhận.
2. Terminal A: `Kết nối đã đóng (mã 1008 "Station locked")`; trụ về "Chưa rõ" trên màn hình.
3. Gõ `connect`: `Boot bị Rejected`. Gõ `auth TAG-DEMO-01`: `SecurityError` (trụ chưa được chấp nhận).
4. Admin bấm **Mở khoá trạm**. Gõ `boot`: **`Accepted`**; trụ trực tuyến trở lại.

Chỉ **Admin** có nút này (quyền `stations:lock`); thao tác ghi `LOCK`/`UNLOCK` vào `audit_logs`.

### 3.10 S-11: đúng phạm vi chủ trạm (1 phút)

Trình duyệt 2 (ẩn danh, `owner2@`) → **Trạng thái trụ**: thấy ST05 và ST06, cập nhật cùng lúc khi gõ lệnh ở trụ ảo.
Đăng nhập `owner@` (ST01–ST04) thì **không** thấy `DEMO-ST05-CP1`: dữ liệu và luồng SSE đều lọc theo chủ trạm.

## 4. Bảng lệnh của trụ ảo

| Nhóm | Lệnh | Việc |
|---|---|---|
| Kết nối | `connect [noboot]`, `twin`, `drop`, `kill`, `info`, `quit` | Nối lại, kết nối thứ hai cùng mã, đóng êm, cắt đột ngột |
| Boot | `boot` | Gửi `BootNotification` (S-08) |
| Nhịp tim | `hb`, `silence`, `resume`, `skew <giờ>` | Heartbeat tay, ngừng/tiếp tục, lệch đồng hồ trụ (S-09, S-12) |
| Đầu nối | `status <id> <trạng thái> [errorCode] [vendorErrorCode]`, `all <trạng thái> [errorCode]`, `play [giây]` | S-10; `id 0` = cả trụ |
| Thẻ | `auth <thẻ>`, `auth-all`, `dup [thẻ] [thẻ-khác]` | S-15, S-14 |
| Khung hỏng | `badframe [not-json\|not-array\|bad-type\|too-short\|bad-payload\|unknown-action\|all]` | S-07 |
| Reset | `reset-mode accept\|accept-only\|reject\|silent\|error` | Cách trụ trả lời lệnh Reset (S-16) |
| Khác | `sleep <giây>`, `help` | |

Trạng thái hợp lệ: `Available`, `Preparing`, `Charging`, `SuspendedEV`, `SuspendedEVSE`, `Finishing`, `Reserved`, `Unavailable`, `Faulted`.

Tuỳ chọn khởi động: `--url`, `--connectors <n>`, `--heartbeat <giây>`, `--reset <chế độ>`, `--protocol`, `--skew-hours`, `--no-boot`, `--no-status`; `--help` để xem đầy đủ. Địa chỉ máy chủ mặc định lấy từ `APP_PORT` trong `.env` (không có thì `ws://localhost:3000`); với staging dùng `--url https://<tên>.onrender.com` (tự đổi sang `wss`). Có thể đưa lệnh qua stdin để chạy tự động: `printf '%s\n' auth-all quit | node tools/demo-charge-point.js DEMO-ST05-CP1`.

Công cụ **không tự nối lại** khi mất kết nối (để cho mentor thấy trạng thái "Chưa rõ"/Ngoại tuyến). Cần nối lại thì gõ `connect`.

## 5. Kiểm chứng trong cơ sở dữ liệu

```
docker compose exec db psql -U csms -d csms
```

(Máy chỉ có `docker-compose` v1 thì dùng `docker-compose exec …`.)

```sql
-- S-08, S-09, S-12: trạng thái, nhịp tim, liên lạc cuối của trụ
select code, status, ocpp_status, last_error_code, heartbeat_interval, last_seen_at
  from charge_points where code = 'DEMO-ST05-CP1';

-- S-10: trạng thái từng đầu nối (nguyên văn OCPP trong ocpp_status)
select connector_no, status, ocpp_status from connectors
 where charge_point_id = (select id from charge_points where code = 'DEMO-ST05-CP1')
 order by connector_no;

-- S-10: lịch sử lỗi (connector_id có giá trị = lỗi đầu nối; charge_point_id có giá trị = lỗi mức trụ)
select id, connector_id, charge_point_id, error_code, vendor_error_code, occurred_at
  from connector_errors order by id desc limit 5;

-- S-14: tin đã lưu để nhận ra tin trùng (Boot/Heartbeat không lưu)
select action, count(*) from ocpp_messages group by action order by action;

-- S-15: thẻ demo
select * from id_tags;

-- S-08: nhật ký khoá/mở khoá trạm
select action, created_at from audit_logs order by id desc limit 5;
```

## 6. Câu hỏi mentor hay hỏi và giới hạn cần nói thật

| Câu hỏi | Trả lời trung thực |
|---|---|
| Trụ nào cũng kết nối được nếu biết mã? | **Đúng, đây là rủi ro B5**: trụ chưa xác thực (chưa có khoá/mật khẩu trụ). Đã có đề xuất thiết kế ở [`B5-xac-thuc-tru-de-xuat-thiet-ke.md`](B5-xac-thuc-tru-de-xuat-thiet-ke.md), chờ PO chọn. |
| Reset có ghi vết ai bấm không? | **Chưa vào `audit_logs`** (đã kiểm: bảng không có dòng nào sau khi Reset), mới ghi log ứng dụng. `SPRINT_STATUS.md` ghi S-16 **chưa Done** vì NFR "ghi vết ai bấm" và vì commit `6e74180` chưa qua PR. Khoá/mở khoá trạm thì đã ghi `audit_logs`. |
| Chạy nổi 50 trụ chưa? | **Chưa kiểm**: `SPRINT_STATUS.md` ghi "staging chạy thật được kiểm với 50 trụ ảo" là việc còn thiếu. Công cụ này chỉ mô phỏng **một** trụ mỗi lần chạy. Registry kết nối nằm trong bộ nhớ, đúng khi chạy **một tiến trình**. |
| Trụ thật có chạy được không? | Chưa thử với trụ thật. Trụ ảo ở đây gửi khung OCPP 1.6J viết tay qua thư viện `ws` (không dùng lại khung của backend), nên là phép thử độc lập; ngoài ra còn bộ test tự động (`python run.py test`). |
| Giờ trụ lệch thì sao? | Hệ thống không tin đồng hồ trụ: `last_seen_at` luôn là giờ máy chủ (S-09). |
| Sau Boot, sao đầu nối chưa có trạng thái? | OCPP 1.6 không bắt Boot kèm trạng thái đầu nối; chỉ khi trụ gửi `StatusNotification` thì mới có. Trụ ảo cố ý gửi ngay sau Boot. Trước đó đầu nối "Chưa rõ" (nhóm ngoại tuyến). |
| Staging trên Render? | Gói miễn phí tự ngủ sau một thời gian không dùng; khởi động lại trước buổi demo và chạy `probe` để làm nóng. |

### README đang lệch so với hành vi thật (đã đối chiếu khi demo)

- README, mục "Thử trụ sạc ảo", ghi mã lạ bị từ chối bằng **HTTP 404**; thực tế là **403**.
- README ghi trạm không `ACTIVE` hoặc bị khoá thì Boot `Rejected`; thực tế **chỉ trạm bị khoá** bị `Rejected`. Trạm `MAINTENANCE`/`INACTIVE` vẫn Boot `Accepted` (đúng AC của S-06 và S-08), còn `Authorize` trả `Blocked`.
- README ghi Reset trụ ngoại tuyến → 409; thực tế **409 khi không còn kết nối OCPP**, kể cả trụ bị đánh dấu "Ngoại tuyến" nhưng socket còn mở vẫn nhận Reset.

## 7. Gặp sự cố khi demo

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `connect ECONNREFUSED` | Máy chủ chưa chạy, hoặc chạy ở cổng khác (3000 bận nên `run.py` chuyển sang cổng khác) | `python run.py`, xem `APP_PORT` trong `.env`; chỉ cổng bằng `--url ws://localhost:<cổng>` |
| `Máy chủ từ chối bắt tay: HTTP 403` | Mã trụ chưa có trong hệ thống | Dùng mã `DEMO-STxx-CPy` đã seed, hoặc tạo trụ trong giao diện |
| `HTTP 429` | Quá 5 lần bắt tay / 10 giây với cùng mã | Chờ 10 giây rồi thử lại |
| `HTTP 400` | Sai subprotocol (đã gõ `--protocol`) hoặc mã trụ sai định dạng | Bỏ `--protocol`; mã chỉ gồm **chữ HOA** A-Z, chữ số, `_`, `-`, tối đa 50 ký tự (chữ thường là sai định dạng) |
| `Boot bị Rejected` | Trạm đang bị khoá | Admin mở khoá trạm rồi gõ `boot` |
| Màn hình không tự đổi | Tab bị ẩn, mất kết nối SSE | Đưa tab lên trước và bấm **Làm mới** |
| Không thấy "Ngoại tuyến" sau `silence` | Chưa qua 2 × nhịp tim (hoặc `.env` chưa đặt `OCPP_HEARTBEAT_INTERVAL=2` và chưa tạo lại container `app`) | Gõ `info` xem nhịp tim; mặc định là 60 giây |
| `Chưa rõ` sau khi vừa Boot | Trụ chưa gửi `StatusNotification` (đã dùng `--no-status`) | Gõ `all Available` |
| `Chưa có thư viện ws` | Chưa cài `backend/node_modules` | `cd backend && npm ci` |
| 504 khi bấm Reset ở trạng thái bình thường | Trụ ảo đang ở `reset-mode silent` | `reset-mode accept` |
