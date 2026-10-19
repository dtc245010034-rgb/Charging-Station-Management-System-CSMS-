# Hướng dẫn demo toàn dự án CSMS (Sprint 1–3 và Chặng 1–9, S-01 → S-66)

Tài liệu này mở rộng [`SPRINT2.md`](SPRINT2.md) và [`SPRINT3.md`](SPRINT3.md) cho **toàn bộ dự án**: từ lệnh khởi động, dữ liệu mẫu, từng vai trò, đến các chức năng sau Sprint 3 (biểu giá, ví, công suất, đặt chỗ, đối soát, gói thuê bao). Mọi bước đều có lệnh hoặc thao tác cụ thể và kết quả mong đợi. Các chi tiết trụ ảo tương tác, khung hỏng, kết nối trùng… đã có trong hai tài liệu Sprint 2 và Sprint 3, nên ở đây chỉ nhắc lệnh chính và dẫn mục.

Thời lượng: bản đầy đủ khoảng **75 phút**; bản rút gọn **20 phút** ở mục 3.0. Không cần trụ sạc thật.

## 0. Mức kiểm chứng của từng bước

Mỗi khối ở mục 4 ghi rõ nguồn của "kết quả mong đợi":

| Nhãn | Ý nghĩa |
|---|---|
| **[ĐÃ CHẠY 19/10]** | Chạy thật khi soạn tài liệu này (19/10/2026) trên backend Node 22 + PostgreSQL 16 cục bộ, **không dùng Docker**, dữ liệu do `npm run seed-demo` tạo, khung OCPP gửi qua WebSocket thật; riêng giao diện kiểm bằng Chromium (Playwright) |
| **[THEO SPRINT 2/3]** | Lấy từ `SPRINT2.md` / `SPRINT3.md`, đã chạy ngày 07/10 và 12/10/2026 bằng Docker; chưa chạy lại hôm nay |
| **[CHƯA CHẠY LẠI]** | Mô tả theo mã nguồn và test tự động, chưa chạy tay trên giao diện; xem bằng chứng test ở mục 7 |

Các lệnh bọc Docker (`python run.py …`) **chưa chạy lại** trong lần soạn này vì môi trường soạn không có Docker daemon; chúng lấy từ `run.py` và hai tài liệu Sprint trước.

## 1. Bản đồ giai đoạn → story → chức năng → mục demo

«Sprint 1–3» là ba sprint đầu (S-01 → S-27). «Chặng 1–9» là chín chặng cuối theo [`KE-HOACH-DEN-HET-DU-AN.md`](../project/KE-HOACH-DEN-HET-DU-AN.md) (S-28 → S-66).

| Giai đoạn | Story | Chức năng | Chứng minh bằng | Mục |
|---|---|---|---|---|
| Sprint 1 | S-01 → S-05 | Khung chạy được; đăng nhập + khoá tạm; mỗi vai trò chỉ thấy phần việc của mình; chủ trạm tạo/sửa trạm, thêm trụ và đầu nối (mã trụ duy nhất) | Đăng nhập 5 vai trò, `curl` 401/403, giao diện «Trạm sạc của tôi» | 4.1, 4.2 |
| Sprint 2 | S-06 → S-16 | Kết nối OCPP, Boot, Heartbeat, StatusNotification, màn hình thời gian thực, ngoại tuyến, kết nối trùng, tin trùng, `Authorize`, `Reset` | Trụ ảo tương tác | 4.3 |
| Sprint 3 | S-17 → S-27 | `StartTransaction`, `StopTransaction`, `MeterValues`, khôi phục khi nối lại, màn hình tài xế, RemoteStart/Stop, phiên bất thường, trụ ảo trong Compose/CI, nhật ký điều khiển | Trụ ảo + đội trụ ảo | 4.4 |
| Chặng 1 | S-28 → S-32 | Biểu giá theo kWh + phí chiếm trụ, nhiều khung giờ, phiên cắt qua khung/nửa đêm, bộ ca tính tay | Trang «Biểu giá» + phiên mẫu | 4.5 |
| Chặng 2 | S-33, S-34, S-64 | Hoá đơn diễn giải từng đoạn, đổi biểu giá không đổi tiền phiên cũ, lịch sử phiên của tài xế | Hoá đơn, «Lịch sử» | 4.5, 4.10 |
| Chặng 3 | S-36, S-37, S-38, S-40, S-41, S-56 | Nạp tay, tự trừ khi hết phiên, ngưỡng tối thiểu, lịch sử ví, sổ cái chỉ-chèn, nhật ký thao tác ví | Trang «Ví», «Ví tài xế» | 4.6, 4.10 |
| Chặng 4 | S-35, S-39, S-59, S-62 | Nạp qua cổng sandbox, webhook idempotent + HMAC, thông báo, sao lưu/khôi phục | Cổng sandbox, «Thông báo», `tools/backup-db.sh` | 4.6, 4.10 |
| Chặng 5 | S-52, S-53, S-55, S-57 | Doanh thu, đối soát, chốt kỳ, xoá dữ liệu cá nhân | Trang Kế toán/Admin | 4.9, 4.10 |
| Chặng 6 | S-42, S-43, S-44, S-60 | Hạn mức công suất trạm, chia công suất cho trụ đang sạc, chia lại khi xe vào/ra, đổi cấu hình trụ từ xa | Hai phiên đồng thời + `SetChargingProfile` | 4.7, 4.10 |
| Chặng 7 | S-47, S-48, S-49, S-66 | Tìm trạm gần, đặt chỗ, chống đặt trùng, đưa trạm vào hoạt động/tạm ngừng | Trang «Tìm trạm» + trụ ảo | 4.2, 4.8 |
| Chặng 8 | S-46, S-54, S-58, S-61, S-63 | Cảnh báo trụ, chia doanh thu đối tác, xuất CSV, quản lý tài khoản, sức khoẻ hệ thống | Các trang Kế toán/Admin | 4.1, 4.8, 4.9, 4.10 |
| Chặng 9 | S-45, S-50, S-51, S-65 | Hạn mức theo khung giờ, phí không đến, huỷ chỗ, gói thuê bao tháng | Trang «Ví», hoá đơn | 4.7, 4.8, 4.11 |
| Mục D | — | Trụ vật lý ESP32 | [`demo/THONG-SO-NOI-TRU-VAT-LY.md`](THONG-SO-NOI-TRU-VAT-LY.md) | 4.12 |

Trạng thái từng thẻ trên Jira nằm trong [`project/TONG-KET-DU-AN.md`](../project/TONG-KET-DU-AN.md) (S-45, S-50, S-51, S-65 đang ở **Review** ngày 19/10/2026).

## 2. Chuẩn bị (làm trước buổi demo, khoảng 15 phút)

### 2.1 Yêu cầu máy

| Cách chạy | Cần có |
|---|---|
| **Docker (khuyến nghị)** | Git, Docker, Python 3.8+ (không cần cài Node, Postgres hay tạo `.env`) |
| **Không Docker** | Node ≥ 22.7, PostgreSQL 16, Git |
| Công cụ trụ ảo (cả hai cách) | Node ≥ 18.3 và thư viện `ws` (`cd backend && npm ci` là có) |

### 2.2 Chạy bằng Docker

```bash
git clone https://github.com/dtc245010034-rgb/Charging-Station-Management-System-CSMS-.git
cd Charging-Station-Management-System-CSMS-
python run.py          # Windows: py run.py   |   Linux/macOS: python3 run.py
```

`run.py` tự build, tạo admin, nạp dữ liệu demo (cùng bộ seed ở mục 2.4) và mở `http://localhost:3000`. Khi cổng 3000 bận, nó đổi cổng và ghi vào `APP_PORT` trong `.env`.

| Việc | Lệnh |
|---|---|
| Xem cổng, địa chỉ, tài khoản | `python run.py status` |
| Xem log (Ctrl+C để thoát, app vẫn chạy) | `python run.py logs` |
| Dừng, **giữ** dữ liệu | `python run.py down` |
| Dừng và **xoá** dữ liệu (hỏi xác nhận) | `python run.py reset` |
| Lint + toàn bộ test trong Docker | `python run.py test` (hoặc `python test.py`) |

Đổi `.env` xong phải tạo lại container: `python run.py down` rồi `python run.py` (xem cảnh báo `ContainerConfig` ở [`SPRINT2.md`](SPRINT2.md) mục 2).

### 2.3 Chạy không Docker  [ĐÃ CHẠY 19/10]

```bash
cd backend
npm ci
cp .env.example .env     # điền DATABASE_URL, JWT_SECRET (>= 32 ký tự), APP_ORIGIN
npm run migrate
export ALLOW_DEMO_SEED=1 DEMO_PASSWORD='MatKhauDemoBaoMat2026!'    # >= 12 ký tự
npm run seed-demo
npm start                # mặc định cổng 3000
```

Tài khoản quản trị dùng riêng `admin@demo.csms.local` (do seed tạo, mật khẩu = `DEMO_PASSWORD`). Muốn tạo thêm `admin@csms.local`: `ADMIN_EMAIL=… ADMIN_PASSWORD=<>=12 ký tự> node scripts/create-admin.js`.

### 2.4 Bộ seed demo duy nhất

`npm run seed-demo` (`backend/scripts/seed-demo.js`) idempotent: chạy lại không nhân đôi, không ghi đè thay đổi của bạn. Tài khoản định nghĩa ở `backend/scripts/lib/demo-accounts.js`. Lần chạy đầu in:

```
Seed demo xong: 7 tài khoản mới, 7 trạm mới, 13 trụ mới, 4 thẻ demo mới.
Dữ liệu nền mới: 7 biểu giá, 1 khung công suất, 1 lần nạp ví, 1 gói thuê bao, 2 tỷ lệ chia sẻ doanh thu.
```

Lần chạy thứ hai phải in toàn số `0`. Với Docker làm tay:

```bash
docker compose exec -e ALLOW_DEMO_SEED=1 -e DEMO_PASSWORD='MatKhauDemoBaoMat2026!' app npm run seed-demo
```

### 2.5 Kiểm khói trước buổi demo (30 giây)  [ĐÃ CHẠY 19/10]

```bash
DEMO_PASSWORD='MatKhauDemoBaoMat2026!' node tools/demo-smoke.js
```

Kỳ vọng `KẾT QUẢ KIỂM KHÓI: 6/6 NHÓM ĐẠT (PASS)` (health + 5 vai trò); có nhóm lỗi thì thoát mã 1. Địa chỉ khác 3000: đặt `APP_BASE_URL=http://localhost:<cổng>`.

### 2.6 Tham số `.env` nên đặt cho buổi demo

| Biến | Giá trị demo | Để làm gì |
|---|---|---|
| `OCPP_HEARTBEAT_INTERVAL` | `2` | Trụ im quá 4 giây là ngoại tuyến (mặc định 60 giây quá chậm) |
| `OCPP_COMMAND_TIMEOUT_SECONDS` | `5` | Reset/ChangeConfiguration hết hạn sau 5 giây thay vì 30 |
| `SANDBOX_GATEWAY` | `1` | Bật cổng thanh toán giả lập (mục 4.6) |
| `PAYMENT_WEBHOOK_SECRET` | chuỗi ngẫu nhiên ≥ 32 ký tự | Bắt buộc khi bật sandbox |
| `INTERNAL_BASE_URL` | `http://127.0.0.1:3000` | Địa chỉ cổng giả lập gọi webhook (đổi nếu app chạy cổng khác) |
| `RESERVATION_HOLD_MIN` | `1` | Giữ chỗ quá hạn sau `arriveInMinutes` + 1 phút để demo phí không đến (mục 4.8); mặc định 15 |

Khi dùng Docker, các biến này nằm trong `.env` ở **thư mục gốc**; chạy không Docker thì ở `backend/.env`. Danh sách đầy đủ và mặc định: README, mục «Biến môi trường».

### 2.7 Tài khoản

| Tài khoản | Mật khẩu | Vai trò |
|---|---|---|
| `admin@csms.local` | `admin` | Quản trị (chỉ có khi chạy `python run.py` trên máy cá nhân) |
| `admin@demo.csms.local` | = mật khẩu demo | Quản trị (do seed tạo, dùng cho kiểm khói) |
| `owner@demo.csms.local` | = mật khẩu demo | Chủ trạm A (các trạm ST01–ST04 và Trạm Demo ESP32) |
| `owner2@demo.csms.local` | = mật khẩu demo | Chủ trạm B (ST05–ST06) |
| `operator@demo.csms.local` | = mật khẩu demo | Vận hành viên |
| `accountant@demo.csms.local` | = mật khẩu demo | Kế toán |
| `driver@demo.csms.local` | = mật khẩu demo | Tài xế (ví 1.000.000 đ, thẻ `TAG-DEMO-01`) |
| `multi@demo.csms.local` | = mật khẩu demo | Vận hành kiêm Chủ trạm (đổi workspace ở góc trên bên trái) |

Mật khẩu demo: `python run.py` cục bộ dùng `demo12345678` (cố định, **chỉ máy cá nhân**); ở chế độ công khai hoặc chạy tay thì là giá trị `DEMO_PASSWORD` bạn đặt. Hai tài khoản trên cùng một trình duyệt dùng chung cookie, nên dùng **cửa sổ ẩn danh** cho tài khoản thứ hai.

### 2.8 Dữ liệu mẫu

| Thứ | Giá trị |
|---|---|
| Trạm | `Trạm Cầu Giấy` (ST01, phí không đến 20.000 đ, hạn mức nền 30 kW, khung 17:00–20:00 hạ còn 15 kW, giá 3.850 đ/kWh), `Trạm Ba Đình` (ST02, 25.000 đ, 44 kW, 4.200 đ/kWh), `Trạm Đống Đa` (ST03, 20.000 đ, 60 kW, 3.500 đ/kWh), `Trạm Long Biên` (ST04, **bảo trì**), `Trạm ICTU Thái Nguyên` (ST05, 10.000 đ, 3.700 đ/kWh), `Trạm Sông Công` (ST06, **ngừng**), `Trạm Demo ESP32` (ST07) |
| Trụ | `DEMO-STxx-CP1/CP2` (2 đầu nối mỗi trụ; trạng thái đầu nối seed là **giả lập**, bị ghi đè khi trụ ảo Boot), `ESP32-DEMO-01` (1 đầu nối) |
| Thẻ RFID | `TAG-DEMO-01` (hợp lệ), `TAG-BLOCKED-01` (khoá), `TAG-EXPIRED-01` (quá hạn), `TAG-ESP32-01` (hợp lệ, cho trụ ESP32) |
| Gói thuê bao | `GOI_THANG_DEMO_3500` «Gói Tháng Tiết Kiệm 3.500»: 300.000 đ / 30 ngày, đồng giá 3.500 đ/kWh |
| Ví tài xế | 1.000.000 đ (một lần nạp `SEED-DEMO-TOPUP-DRIVER`) |
| Chia doanh thu | `owner@` 85 %, `owner2@` 90 % (từ ngày 01/01/2026) |

### 2.9 Phiên sạc mẫu bằng một lệnh  [ĐÃ CHẠY 19/10]

Trụ ảo tương tác (`start …`) **không gửi `MeterValues`**, nên kWh chốt là 0. Để có phiên có điện năng (hoá đơn, ví, báo cáo), dùng đoạn mã dưới đây, chạy **từ thư mục gốc repo**. Nó đóng vai một trụ: Boot → Status → Authorize → StartTransaction → MeterValues → StopTransaction.

Lưu thành `phien-sac-mau.js` (tệp tạm của bạn, không cần đưa vào repo):

```js
// node phien-sac-mau.js <MÃ_TRỤ> <idTag> <Wh> [giây=10] [cổng=3000]
const { WebSocket } = require('./backend/node_modules/ws');
const [code = 'DEMO-ST01-CP1', tag = 'TAG-DEMO-01', wh = '20000', seconds = '10', port = '3000'] = process.argv.slice(2);
const stop = Date.now();
const start = stop - Number(seconds) * 1000;
const iso = (t) => new Date(t).toISOString();
const ws = new WebSocket(`ws://localhost:${port}/ocpp/${code}`, 'ocpp1.6');
let n = 0; const waiting = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m[0] === 3) waiting.get(m[1])?.(m[2]); if (m[0] === 4) console.log('LỖI', JSON.stringify(m)); });
const call = (action, payload) => new Promise((resolve) => { const id = `m${++n}`; waiting.set(id, resolve); ws.send(JSON.stringify([2, id, action, payload])); });
ws.on('error', (e) => { console.error('Không nối được:', e.message); process.exit(1); });
ws.on('open', async () => {
  console.log('Boot      ', JSON.stringify(await call('BootNotification', { chargePointVendor: 'DemoVendor', chargePointModel: 'AC-22' })));
  await call('StatusNotification', { connectorId: 1, status: 'Available', errorCode: 'NoError', timestamp: iso(start - 1000) });
  console.log('Authorize ', JSON.stringify(await call('Authorize', { idTag: tag })));
  const started = await call('StartTransaction', { connectorId: 1, idTag: tag, meterStart: 0, timestamp: iso(start) });
  console.log('Start     ', JSON.stringify(started));
  await call('MeterValues', { connectorId: 1, transactionId: started.transactionId, meterValue: [{ timestamp: iso((start + stop) / 2), sampledValue: [{ value: String(Math.round(Number(wh) / 2)), measurand: 'Energy.Active.Import.Register', unit: 'Wh' }] }] });
  console.log('Stop      ', JSON.stringify(await call('StopTransaction', { transactionId: started.transactionId, meterStop: Number(wh), timestamp: iso(stop), idTag: tag })));
  ws.close();
});
```

```bash
node phien-sac-mau.js DEMO-ST01-CP1 TAG-DEMO-01 20000        # 20 kWh trong 10 giây, trạm ST01
```

Mong đợi: `Boot {"status":"Accepted",…}`, `Authorize {"idTagInfo":{"status":"Accepted"}}`, `Start {"transactionId":N,…}`, `Stop {}`. Job lập hoá đơn chạy mỗi **30 giây** (`BILLING_JOB_INTERVAL_MS`), nên chờ khoảng 30 giây rồi mới thấy hoá đơn.

Hai lưu ý đã đo thật:

- Thời điểm bắt đầu phiên phải **sau** thời điểm mua gói thì mới áp giá gói (mục 4.11); script dùng giờ hiện tại nên tự thoả.
- Thời điểm do trụ báo lệch giờ máy chủ quá 24 giờ thì phiên bị gắn `NEEDS_REVIEW` (`CLOCK_SKEW`) và **không** lập hoá đơn; vì vậy không thể "lùi ngày" để tạo dữ liệu tháng trước (xem 4.9).

### 2.10 Cửa sổ làm việc

| Cửa sổ | Dùng để |
|---|---|
| Trình duyệt 1 | Admin hoặc Vận hành |
| Trình duyệt 2 (ẩn danh, thu hẹp ~400 px như điện thoại) | Tài xế |
| Trình duyệt 3 (ẩn danh khác) | Chủ trạm hoặc Kế toán |
| Terminal A | Trụ ảo tương tác: `node tools/demo-charge-point.js DEMO-ST01-CP1` |
| Terminal B | Log: `python run.py logs` (hoặc log của `npm start`) |
| Terminal C | `curl` và `psql` (mục 6) |

Giữ tab đang trình diễn luôn hiển thị: trình duyệt ngừng tải khi tab bị ẩn; lỡ ẩn thì bấm **Làm mới**.

## 3. Lộ trình

### 3.0 Bản rút gọn 20 phút

| Phút | Việc | Mục |
|---|---|---|
| 0–2 | Kiểm khói 6/6, đăng nhập Admin | 2.5, 4.1 |
| 2–6 | Trụ ảo Boot, màn «Trạng thái trụ» đổi tức thời, ngoại tuyến | 4.3 |
| 6–10 | Phiên sạc mẫu → hoá đơn → ví tự trừ → thông báo | 2.9, 4.5, 4.6 |
| 10–13 | Mua gói thuê bao, phiên kế tiếp tính giá gói (77.000 → 70.000 đ) | 4.11 |
| 13–16 | Hai phiên đồng thời, công suất chia 15 kW mỗi đầu nối | 4.7 |
| 16–18 | Tài xế đặt chỗ rồi huỷ | 4.8 |
| 18–20 | Đối soát 0 lỗi, CSV, nhật ký kiểm toán | 4.9, 4.10 |

### 3.1 Bản đầy đủ (khoảng 75 phút)

Đi theo mục 4.1 → 4.12. Thời lượng gợi ý: 4.1 (5), 4.2 (5), 4.3 (12), 4.4 (10), 4.5 (6), 4.6 (7), 4.7 (5), 4.8 (7), 4.9 (6), 4.10 (5), 4.11 (5), 4.12 (2).

## 4. Kịch bản theo thứ tự

Quy ước: `→` là khung trụ gửi, `←` là máy chủ trả. Lệnh gõ trong dấu nhắc `DEMO-ST01-CP1>` của trụ ảo (gõ `help` xem hết).

### 4.1 Sprint 1 và Chặng 8: đăng nhập, phân quyền, tài khoản (S-01 → S-03, S-61)  [ĐÃ CHẠY 19/10]

1. `curl -s http://localhost:3000/api/health` → `{"ok":true,"service":"csms-backend","database":"postgresql",…}`.
2. Mở `http://localhost:3000`, đăng nhập `admin@demo.csms.local` (hoặc `admin@csms.local`). Hệ thống chuyển tới workspace theo vai trò (`/app.html#/admin/…`). Mỗi vai trò thấy **menu khác nhau**: Admin, Chủ trạm, Vận hành, Kế toán (desk), Tài xế (giao diện điện thoại).
3. Chứng minh phân quyền mặc định từ chối:

   ```bash
   B=http://localhost:3000; MK='MatKhauDemoBaoMat2026!'
   curl -s -c driver.ck -X POST $B/api/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"driver@demo.csms.local\",\"password\":\"$MK\"}" > /dev/null
   curl -s -o /dev/null -w '%{http_code}\n' $B/api/stations                       # 401 (chưa đăng nhập)
   curl -s -o /dev/null -w '%{http_code}\n' -b driver.ck $B/api/admin/users        # 403 (tài xế không quản lý tài khoản)
   curl -s -o /dev/null -w '%{http_code}\n' -b driver.ck -X PATCH $B/api/stations/1 -H 'Content-Type: application/json' -d '{"name":"x"}'   # 403
   ```

   Chủ trạm B xem trạm của chủ trạm A (`GET /api/stations/1` bằng cookie `owner2@`) → **403**: lọc theo sở hữu ngay ở tầng truy vấn.
4. Đăng nhập sai nhiều lần → khoá tạm (S-02). Ghi chú: ngưỡng khoá IP là `LOGIN_IP_MAX_FAILURES` (20 lần/15 phút), nên đừng thử trên máy dùng chung.
5. **Quản lý tài khoản (S-61)**: Admin → **Tạo tài khoản**. Tạo một tài khoản mới (tên, email, mật khẩu tạm ≥ 8 ký tự, vai trò). Danh sách bên dưới có **ô tìm theo tên/email**, chọn **số dòng mỗi trang** (10/20/50/100), nút **Trang trước/Trang sau** và dòng «Hiện 1–20 / N · Trang 1 / M». Đổi vai trò, **Khóa** / **Mở khóa** từng tài khoản. Không tự khoá chính mình, không khoá Admin cuối cùng (API trả 409).
6. Đăng ký công khai (tài xế): `POST /api/auth/register` chỉ tạo `DRIVER`; gửi kèm `role` → 400.

### 4.2 Sprint 1 và Chặng 7: trạm, trụ, đầu nối (S-04, S-05, S-66)  [CHƯA CHẠY LẠI trên giao diện; có test `S-04`, `S-05`, `S-66`]

Đăng nhập `owner@demo.csms.local` → **Trạm sạc của tôi**.

1. **Thêm trạm**: tên, địa chỉ, toạ độ, hạn mức công suất (kW, tuỳ chọn), phí không đến (đồng, 0 → 1.000.000) → **Lưu trạm**. Trạm mới luôn ở trạng thái **chưa hoạt động** (không chỉ định `status` khi tạo); form sinh khoá `Idempotency-Key` một lần nên bấm lưu hai lần không tạo trạm thứ hai.
2. Mở trạm vừa tạo (ngăn bên phải) → **Thêm trụ**: nhập mã (hoặc **Tạo mã gợi ý**), hãng, mẫu, công suất, số đầu nối. Nhập mã trùng → báo ngay tại ô nhập; mã chỉ gồm chữ HOA, số, `_`, `-`, tối đa 50 ký tự.
3. **Đưa vào hoạt động** / **Tạm ngừng** (S-66). Trạm chưa hoạt động vẫn nhận kết nối OCPP nhưng `Authorize` trả `Blocked` (xem 4.3).
4. Chủ trạm **không** thấy trạm của chủ trạm khác; Vận hành chỉ xem, không sửa.

### 4.3 Sprint 2: OCPP, thời gian thực (S-06 → S-16)  [THEO SPRINT 2/3 — đã chạy 07/10 và 12/10]

Đủ 11 story, từng bước và bảng kết quả nằm ở [`SPRINT2.md`](SPRINT2.md) mục 3. Bản tóm tắt để trình diễn nhanh (Admin mở **Trạng thái trụ**):

| Việc | Lệnh | Mong đợi |
|---|---|---|
| Bắt tay (S-06) | `node tools/demo-charge-point.js probe DEMO-ST01-CP1` | 5 dòng ĐẠT: 101 / 403 / 400 / 400 / 400 |
| Boot + màn hình tức thời (S-08, S-11) | `node tools/demo-charge-point.js DEMO-ST01-CP1` | `Boot Accepted`, trụ **Trực tuyến**, đầu nối **Rảnh**, không cần tải lại trang |
| Heartbeat, lệch giờ trụ (S-09) | `skew 5` rồi `hb`; `select last_seen_at, now() from charge_points where code='DEMO-ST01-CP1';` | Hai giá trị chênh dưới 2 giây (giờ máy chủ, không tin giờ trụ) |
| Trạng thái đầu nối, lỗi (S-10) | `status 1 Charging`, `status 1 Faulted OverCurrentFailure`, `status 0 Faulted GroundFailure` | Đầu nối đổi màu; thẻ đỏ «Lỗi mức trụ» |
| Khung hỏng (S-07) | `badframe all` | 6 dòng ĐẠT, **kết nối vẫn mở** |
| Tin trùng (S-14) | `dup` | Hai câu trả lời giống hệt, log «Duplicate CALL» |
| Kiểm thẻ (S-15) | `auth-all` | `Accepted` / `Blocked` / `Expired` / `Invalid` / CALLERROR |
| Reset từ xa (S-16) | Nút **Khởi động lại** (Admin/Vận hành) + `reset-mode accept\|reject\|silent\|error` | 200 / 422 / 504 / 409 |
| Ngoại tuyến (S-12) | `silence`, chờ > 4 giây (2 × nhịp tim 2 giây), **Làm mới** | Thẻ **Ngoại tuyến**, «Liên lạc cuối: …»; `resume` để trở lại |
| Kết nối trùng (S-13) | `twin` | Kết nối cũ đóng mã 1000 |
| Khoá trạm (S-08) | Admin: **Trạm sạc** → trạm → **Khoá trạm**; trụ gõ `connect` | `Boot bị Rejected` cho tới khi **Mở khoá trạm** |

**S-11 đúng phạm vi chủ trạm**: đăng nhập `owner@` và `owner2@` ở hai cửa sổ — mỗi người chỉ thấy trụ của mình, cập nhật cùng lúc khi gõ lệnh ở trụ ảo.

### 4.4 Sprint 3: phiên sạc (S-17 → S-27)  [THEO SPRINT 2/3 — đã chạy 12/10; 4.4.5 ĐÃ CHẠY 19/10]

Chi tiết: [`SPRINT3.md`](SPRINT3.md) mục 3. Tóm tắt:

1. **Bắt đầu phiên (S-17)**: `start 1 TAG-DEMO-01 2000` → `transactionId` mới, `Accepted`; trang **Phiên sạc** (Vận hành) hiện phiên `CHARGING`. `start 1 TAG-DEMO-01 3000` khi phiên chưa kết thúc → phiên cũ thành **Phiên bất thường** («Bị thay bằng phiên mới trên cùng đầu nối»). `start 2 TAG-BLOCKED-01 500` → thẻ khoá vẫn cấp `transactionId` nhưng đánh dấu «Cần xem xét».
2. **Mất kết nối giữa phiên (S-21)**: `start 1 TAG-DEMO-01 7000`, `drop` (hoặc `kill`), phiên **không** bị đóng; `connect` → phiên vẫn `CHARGING`.
3. **kWh thời gian thực và bắt đầu từ ứng dụng (S-19, S-22, S-24)** — cần đội trụ ảo trong Docker Compose:

   ```bash
   ADMIN_PASSWORD=<mật khẩu admin> VCP_COUNT=2 VCP_HEARTBEAT_INTERVAL=10 docker-compose up -d --no-deps vcp
   ```

   Tài xế → **Bắt đầu sạc** → chọn trụ `VCP-…` → **Bắt đầu sạc**: trang chuyển sang **Phiên sạc trực tiếp** với điện năng, công suất, dòng điện, SoC cập nhật mỗi vài giây. Mỗi tài xế **một phiên** (bấm thêm → 409).
4. **Dừng từ xa (S-23)**: Vận hành → **Phiên sạc** → **Dừng phiên** → xác nhận. Phiên **chỉ đóng khi `StopTransaction` thật đến**. Ba kết cục: `remote-stop-mode accept` / `reject`+`error` (422) / `silent` (504 sau thời gian chờ).
5. **Chốt kWh (S-18)  [ĐÃ CHẠY 19/10]**: kWh = (số đo cuối − số đo đầu) / 1000; gửi `StopTransaction` lần hai không đổi gì. Chạy mục 2.9, rồi:

   ```sql
   select id, status, meter_start, meter_stop, stop_reason, needs_review, billing_status from charging_sessions order by id desc limit 3;
   ```

   Mong đợi phiên `COMPLETED`, `meter_start = 0`, `meter_stop = 20000`, `billing_status = FINAL` sau khoảng 30 giây.
6. **Phiên bất thường (S-25)**: **Phiên bất thường** → nhập lý do → **Đóng phiên** (Vận hành/Admin; Kế toán chỉ xem, API trả 403). Phiên chưa có số đo năng lượng phải tích «xác nhận đóng với 0 kWh».
7. **Nhật ký điều khiển (S-27)**: Admin → **Nhật ký điều khiển**: mỗi lệnh dừng có hai dòng («Đã chấp nhận» rồi «Đã dừng») kèm người thực hiện, trụ, IP. Bảng chỉ-chèn: `UPDATE/DELETE/TRUNCATE` bị CSDL từ chối.
8. **Trụ ảo trong Compose/CI (S-26)**: dịch vụ `vcp`; job CI `session-scenario`. Kịch bản đầy đủ: `node tools/test-s21-reconnect-fleet.js --count 20 --runs 3` (cần quyền admin và `STAGING_DATABASE_URL`).

### 4.5 Chặng 1–2: biểu giá và hoá đơn (S-28 → S-34)  [ĐÃ CHẠY 19/10]

1. Chủ trạm (`owner@`) → **Biểu giá** (hoặc **Biểu giá trạm sạc**). Chọn «Trạm Cầu Giấy»: biểu giá hiện hành 3.850 đ/kWh cả ngày, ghi chú `ACTIVE`.
2. **Khai báo biểu giá mới**: ngày hiệu lực (giờ trạm), các khung giờ (**phải phủ đủ 24 giờ**, không chồng lấn; `Từ` / `Đến` / `Đơn giá` / `Nhãn`), **Thời gian ân hạn** (0–240 phút) và **Phí chiếm trụ** (đ/phút, tính sau ân hạn) → **Lưu biểu giá**. Biểu giá cũ **không bị sửa** (chỉ thêm phiên bản mới, S-34). Bằng API:

   ```bash
   curl -s -b owner.ck -X POST $B/api/stations/2/tariffs -H 'Content-Type: application/json' \
     -d '{"effectiveFrom":"2026-12-01","periods":[{"from":"00:00","to":"06:00","pricePerKwh":2500,"label":"Đêm"},{"from":"06:00","to":"24:00","pricePerKwh":4200,"label":"Ngày"}],"idle":{"graceMin":10,"perMinDong":1000}}'
   ```

   Mong đợi `version: 2`, hai khung `0–360` (2.500 đ) và `360–1440` (4.200 đ), `idle_grace_min 10`, `idle_per_min_dong "1000"`. Khung không phủ kín 24 giờ → 400.
3. Chạy phiên mẫu (mục 2.9) 20 kWh trên `DEMO-ST01-CP1`, đợi ~30 giây. Tài xế (`driver@`, cửa sổ ẩn danh) → **Lịch sử** → mở hoá đơn phiên: **77.000 đ** = 20 × 3.850, làm tròn `PER_SEGMENT_HALF_UP`, diễn giải từng đoạn giá. Bằng API: `GET /api/sessions/<id>/invoice`.
4. Điểm nói: tiền là số nguyên đồng; múi giờ theo trạm (`Asia/Ho_Chi_Minh`); phiên cắt qua khung giờ hoặc qua nửa đêm được chia đoạn, mỗi đoạn tính đúng giá của khung (S-30, S-31); bộ ca tính tay: `python test.py --file tests/acceptance/S-32.hand-cases.test.js` (S-32).
5. Đổi biểu giá **không** làm đổi tiền của phiên đã kết thúc: hoá đơn lưu ảnh chụp biểu giá (`tariffSnapshot`) (S-34).

### 4.6 Chặng 3–4: ví và thanh toán sandbox (S-35 → S-41)  [ĐÃ CHẠY 19/10, riêng cổng sandbox: CHƯA CHẠY LẠI]

1. **Số dư và sổ cái (S-40, S-41)**: tài xế → **Ví**: số dư (1.000.000 đ sau seed), «Ngưỡng bắt đầu sạc» và danh sách giao dịch: `TOPUP_MANUAL`, `SUBSCRIPTION_FEE`, `SESSION_DEBIT`, … Mỗi dòng ghi số dư sau giao dịch; nhấp «Xem hoá đơn» ở dòng trừ tiền sạc.
2. **Tự trừ khi hết phiên (S-37)**: sau phiên mẫu (4.5), ví giảm 77.000 đ (một dòng `SESSION_DEBIT`); xem thêm **Thông báo** của tài xế: «phiên kết thúc» kèm `wh` và số tiền ước tính (S-59).
3. **Ngưỡng tối thiểu (S-38)**: ví dưới ngưỡng thì trụ từ chối bắt đầu phiên mới. Mặc định ngưỡng = 5 kWh × giá cao nhất đang hiệu lực (seed: 21.000 đ); đặt cứng bằng `WALLET_MIN_BALANCE_DONG`.
4. **Nạp tay (S-36)**: Admin → **Ví tài xế** → **Tìm tài xế** → **Nạp tiền thủ công** (số tiền, mã phiếu thu, ghi chú). Bằng API:

   ```bash
   curl -s -b admin.ck -X POST $B/api/admin/wallets/<id tài xế>/manual-topups -H 'Content-Type: application/json' \
     -d '{"amountDong":200000,"receiptCode":"PT-DEMO-0001","note":"Nạp tiền mặt tại quầy"}'
   ```

   Mong đợi `{"balanceDong":"…"}` tăng 200.000; gửi lại **cùng `receiptCode`** → `409 RECEIPT_ALREADY_USED`, ví không đổi. Admin còn có **Điều chỉnh số dư** (lý do ≥ 10 ký tự) và **Mở khóa ví**; mọi thao tác ghi `audit_logs` (S-56).
5. **Nạp qua cổng sandbox (S-35, S-39)**: bật `SANDBOX_GATEWAY=1` và `PAYMENT_WEBHOOK_SECRET` (mục 2.6), khởi động lại. Tài xế → **Ví** → nhập số tiền (10.000–5.000.000 đ) hoặc chọn nhanh → **Nạp tiền vào ví**. Trang cổng giả lập `/sandbox-gateway/pay` có các nút: **Thanh toán thành công**, **Thất bại**, **Huỷ**, **Quay về ngay, gửi webhook sau 10 giây**, **Gửi webhook 5 lần**, **Gửi webhook sai số tiền**, **Gửi webhook sai chữ ký**. Mong đợi: thành công → số dư tăng; gửi 5 lần → chỉ ghi nhận **một** lần; sai chữ ký hoặc sai số tiền → bị từ chối, số dư không đổi. Bằng chứng tự động: `S-35.wallet-topup`, `S-39.webhook-idempotency`, `payment-hmac`.
6. **Sổ cái chỉ-chèn (S-41)**: `update wallet_ledger set amount_dong = 0;` → lỗi `wallet_ledger is append-only`. Job kiểm định số dư ví và sổ cái chạy mỗi `WALLET_AUDIT_INTERVAL_MS` (5 phút); lệch thì khoá ví.

### 4.7 Chặng 6 và 9: hạn mức công suất (S-42 → S-45)  [ĐÃ CHẠY 19/10]

Mục tiêu: **tổng công suất cấp cho các trụ đang sạc không vượt hạn mức trạm**.

1. Chủ trạm → **Trạm sạc của tôi** → «Trạm Cầu Giấy»: ngăn bên phải hiện **Hạn mức công suất 30 kW**.
2. Terminal A: `node tools/demo-charge-point.js DEMO-ST01-CP1`, rồi:

   ```
   start 1 TAG-DEMO-01 0
   start 2 TAG-DEMO-01 0
   ```

   Mong đợi sau khoảng 2 giây kể từ phiên thứ hai, máy chủ gọi **xuống** trụ cho từng phiên:

   ```
   ⇦ Máy chủ gửi lệnh SetChargingProfile {"connectorId":1,"csChargingProfiles":{… "chargingSchedulePeriod":[{"startPeriod":0,"limit":15000}]}}
   ⇦ Máy chủ gửi lệnh SetChargingProfile {"connectorId":2,"csChargingProfiles":{… "limit":15000}}
   ```

   30 kW chia đều thành **15.000 W** cho mỗi phiên (cửa sổ gộp sự kiện: `POWER_REBALANCE_MIN_INTERVAL_MS`, mặc định 2 giây). Một phiên rời đi → công suất được chia lại (S-44). Chỉ gửi lại khi giới hạn thay đổi (`--profile-result Rejected|NotSupported` để thử trụ từ chối).
3. **Hạn mức theo khung giờ (S-45)**: ở ngăn bên phải mục **Hạn mức theo giờ**: seed có khung `17:00 – 20:00` hạ còn `15 kW`. **Thêm khung**: giờ bắt đầu, giờ kết thúc, kW. Khung trùng nhau bị chặn (409, ràng buộc `EXCLUDE` của PostgreSQL). Khung qua nửa đêm: API từ chối (400, "vui lòng tách thành 2 khung"); giao diện có nút **Qua nửa đêm**: nhập `22:00 – 06:00` thì tạo hai khung `22:00 – 24:00` và `00:00 – 06:00`. Job quét ranh giới giờ (`POWER_SCHEDULE_TICK_MS`, mặc định 15 giây) tự chia lại công suất khi qua mốc.
4. Hạn mức quá thấp: chia theo tỷ lệ công suất danh định, **không tự ngắt phiên** của tài xế.

### 4.8 Chặng 7–9: tìm trạm, đặt chỗ, phí không đến, cảnh báo (S-46 → S-51)  [ĐÃ CHẠY 19/10 (API + OCPP, trừ S-46 và S-49); giao diện: CHƯA CHẠY LẠI]

Chuẩn bị: trụ phải **online** để nhận lệnh `ReserveNow`. Terminal A: `node tools/demo-charge-point.js DEMO-ST01-CP1` (hoặc `--reservation-result Rejected|Faulted|Unavailable` để thử trụ từ chối).

1. **Tìm trạm (S-47)**: tài xế → **Tìm trạm** → gõ «Cầu Giấy» (2–100 ký tự) → **Tìm kiếm** (hoặc **Vị trí hiện tại**). Kết quả: tên, địa chỉ, khoảng cách (nếu có toạ độ), số đầu nối rảnh/tổng, **giá hiện hành 3.850 đ/kWh**, phí chiếm trụ. API: `POST /api/stations/search` với `{"q":"Cầu Giấy"}`.
2. **Đặt chỗ (S-48)**: chọn trạm → đầu nối → «Phí không đến: 20.000 đ» hiển thị rõ → **Xác nhận đặt chỗ**. Trụ ảo in `ReserveNow`; chỗ đặt ở trạng thái `ACCEPTED`, ghi `noShowFeeDong: 20000` (chụp tại lúc đặt). Bằng API:

   ```bash
   curl -s -b driver.ck -X POST $B/api/reservations -H 'Content-Type: application/json' -H "Idempotency-Key: demo-resv-$(date +%s)-0001" \
     -d '{"connectorId":"1","arriveInMinutes":30}'
   ```

3. **Huỷ chỗ (S-51)**: **Đặt chỗ của tôi** → **Huỷ đặt chỗ**. Mong đợi `CANCELLED`, trụ ảo nhận `CancelReservation`, đầu nối mở lại, **ví không bị trừ phí**, `audit_logs` có `RESERVATION_CREATED` rồi `RESERVATION_CANCELLED`.
4. **Chống đặt trùng (S-49)**: hai tài xế đặt cùng đầu nối cùng lúc → chỉ một thành công (khoá hàng `FOR UPDATE`); bằng chứng: `S-49.reservation-concurrency.test.js`.
5. **Quá hạn → phí không đến (S-50)**: đặt `RESERVATION_HOLD_MIN=1`, đặt chỗ với `arriveInMinutes: 1` và **không đến**: chỗ hết hạn sau 2 phút (`arriveInMinutes` + `RESERVATION_HOLD_MIN`); đã đo: `EXPIRED` sau khoảng 9 giây kể từ mốc hết hạn (job `RESERVATION_EXPIRY_JOB_MS`, 15 giây), `cancel_status = SENT` (trụ nhận `CancelReservation`) và một dòng sổ cái `RESERVATION_FEE` −20.000 đ (ví 725.000 → 705.000 đ). Ví được phép âm (nợ) cho khoản này. Trụ ngoại tuyến lúc hết hạn: CSDL vẫn `EXPIRED` và trừ phí, hệ thống thử gửi `CancelReservation` tối đa 5 lần. Bằng chứng tự động: `S-50.reservation-expiry.test.js`.
6. **Cảnh báo trụ (S-46)**: job quét mỗi 60 giây tạo cảnh báo khi trụ `OFFLINE` quá `ALERT_OFFLINE_THRESHOLD_MINUTES` (10 phút) hoặc có ≥ `ALERT_ERROR_THRESHOLD` (5) lỗi trong `ALERT_ERROR_WINDOW_MINUTES` (30 phút) trên trạm `ACTIVE`; gửi thông báo cho chủ trạm (**chưa chạy tay**; bằng chứng `S-46.charge-point-health.test.js`). Menu «Cảnh báo» trên giao diện **chưa bật** (`enabled:false` trong `frontend/app/workspace.js`); dùng API `GET /api/alerts` và `POST /api/alerts/:id/close`.

### 4.9 Chặng 5 và 8: doanh thu, đối soát, chia doanh thu, kỳ kế toán  [ĐÃ CHẠY 19/10 (API)]

Chạy ít nhất hai phiên mẫu (mục 2.9) trước khi trình diễn.

1. **Doanh thu (S-52)**: Chủ trạm hoặc Kế toán → **Doanh thu** → chọn `Từ ngày`, `Đến ngày` → **Xem doanh thu**: bảng theo trạm, trụ, đầu nối (số phiên, Wh, tiền điện, phí chiếm trụ, tổng) và dòng **Tổng**. Ví dụ 2 phiên 20 kWh giá gói: `totalWh 40000`, `totalDong 140000`. API: `GET /api/reports/revenue?from=2026-10-01&to=2026-10-31`. Chủ trạm chỉ thấy trạm của mình.
2. **CSV (S-58)**: nút **Tải CSV**, chọn phân cách (dấu chấm phẩy `;` hoặc dấu phẩy `,`): `curl -s -b accountant.ck "$B/api/reports/revenue.csv?from=2026-10-01&to=2026-10-31&delimiter=semicolon"` → tệp UTF-8 có BOM, tiêu đề `Trạm;Mã trụ;Đầu nối;Số phiên;Điện năng (Wh);Tiền điện (đ);Phí chiếm trụ (đ);Tổng (đ)` và dòng `TỔNG`. Mỗi lần xuất ghi `REPORT_EXPORTED` vào nhật ký.
3. **Đối soát (S-53)**: Kế toán → **Đối soát** → chọn khoảng ngày: `sessionsChecked 2`, `issueCount 0`, `whMeter = whBilled`. Phiên lệch giữa điện đo và điện đã lập hoá đơn được liệt kê ở «Phiên cần xem xét»; ngưỡng bỏ qua chênh tiền `RECON_TOLERANCE_DONG` (mặc định 0). API: `GET /api/reports/reconciliation?from=…&to=…` (và `.csv`).
4. **Kỳ đối soát (S-55)**: Kế toán → **Kỳ đối soát** → «Tháng cần chốt». **Chỉ chốt được tháng đã kết thúc**: chốt tháng hiện tại trả `400 "Chỉ được chốt kỳ đã kết thúc"`. Kỳ đã chốt thì hoá đơn phát sinh cho tháng đó bị chặn (phiên gắn lỗi `PERIOD_CLOSED`); **Mở lại kỳ** cần lý do và chỉ **Admin** (`403` với Kế toán).
5. **Bảng kê chia doanh thu (S-54)**: Kế toán → **Bảng kê đối tác**: **Khai tỷ lệ chia** (điểm cơ bản 0–10000, ví dụ 8500 = 85 %, ngày hiệu lực, ghi chú, tuỳ chọn tính phí chiếm trụ vào nền chia) → **Lưu tỷ lệ**; **Lập bảng kê** cho tháng → **Xem bảng kê** (doanh thu, phần chủ trạm, phần nền tảng, theo từng đoạn tỷ lệ). **Chỉ lập được cho kỳ đã chốt** (chưa chốt → `409 PERIOD_NOT_CLOSED`, đã chạy 19/10).
6. **Giới hạn khi demo ngày 21/10/2026**: tháng 10 chưa kết thúc nên không thể chốt kỳ, và máy chủ **không cho lùi ngày** để tạo dữ liệu tháng trước (thời điểm trụ báo lệch quá 24 giờ bị gắn `CLOCK_SKEW`, 4.12). Hãy trình diễn hai điểm chặn ở các mục 4 và 5, và chạy bằng chứng đầy đủ của chốt kỳ + bảng kê: `python test.py --file tests/acceptance/S-55.periods.test.js` và `S-54.revenue-sharing.test.js`. Để có sẵn dữ liệu hoá đơn giả cho báo cáo/đối soát (ngày hôm nay, không phải tháng đã chốt): `DATABASE_URL=… node tools/seed-reconciliation-demo.js` (idempotent, chỉ tạo dữ liệu `@demo.invalid`).

### 4.10 Chặng 2–8: truy vết, quyền riêng tư, cấu hình, sức khoẻ, sao lưu, lịch sử (S-56 → S-64)

1. **Nhật ký truy vết (S-56)  [ĐÃ CHẠY 19/10]**: Admin → **Nhật ký điều khiển**: lọc theo trụ, người thực hiện, tài xế, khoảng ngày; thao tác ví (nạp tay, điều chỉnh, mở khoá) và đặt chỗ/gói đều có dòng. Metadata **không** chứa toạ độ GPS thô hay mật khẩu; mã thẻ bị che (log ứng dụng chỉ giữ 4 ký tự cuối).
2. **Xoá dữ liệu cá nhân (S-57)  [ĐÃ CHẠY 19/10 (tạo và liệt kê yêu cầu)]**: tài xế → **Tài khoản** → **Yêu cầu xóa dữ liệu** (`POST /api/me/erasure-requests` → `{"status":"REQUESTED"}`). Admin → **Yêu cầu xóa dữ liệu cá nhân** (`GET /api/admin/erasure-requests`) → **Duyệt** hoặc **Từ chối**. Duyệt thực hiện xoá/ẩn danh dữ liệu cá nhân theo quy trình S-57; **thao tác không hoàn tác, chỉ duyệt trên dữ liệu demo**. Phần Duyệt: **CHƯA CHẠY LẠI**, bằng chứng `S-57.data-erasure.test.js`.
3. **Thông báo (S-59)  [ĐÃ CHẠY 19/10]**: tài xế → **Thông báo**: mỗi phiên kết thúc có một thông báo `SESSION_ENDED`; `POST /api/me/notifications/<id>/read` đánh dấu đã đọc (`unreadCount` giảm). Thư điện tử hiện chỉ ghi ra log (`EMAIL_TRANSPORT=log`).
4. **Đổi cấu hình trụ từ xa (S-60)  [THEO SPRINT 2/3 + test, CHƯA CHẠY LẠI]**: Vận hành/Admin → **Trụ sạc** → trụ → **Cấu hình trụ**: chọn `HeartbeatInterval` hoặc `MeterValueSampleInterval`, nhập giá trị, **Áp dụng** → máy chủ gửi `ChangeConfiguration`, trụ ảo trả `Accepted`. Chỉ hai khoá này được phép. Bằng chứng: `S-60.change-configuration.test.js`.
5. **Sức khoẻ hệ thống (S-63)  [ĐÃ CHẠY 19/10]**: Admin/Vận hành → **Sức khỏe hệ thống**: số trụ trực tuyến, phiên đang chạy, lỗi 5 phút gần nhất, độ trễ trung bình. Bật trụ ảo, gọi `GET /api/health/overview` **ngay sau Boot** → `now.cpsOnline` đã tăng (không chờ snapshot 60 giây); `drop` thì về 0.
6. **Lịch sử phiên (S-64)  [ĐÃ CHẠY 19/10 (API)]**: tài xế → **Lịch sử**: danh sách phiên (trạm, trụ, kWh, trạng thái hoá đơn, nguồn giá `STATION`/`SUBSCRIPTION`); `GET /api/me/sessions/history`.
7. **Sao lưu và khôi phục (S-62)  [CHƯA CHẠY LẠI — cần Docker]**: `BACKUP_PASSPHRASE=<bí mật> bash tools/backup-db.sh` (mã hoá AES-256 bằng OpenSSL); `tools/restore-db.sh <tệp .sql.enc> <tên DB>` (từ chối khi DB đích đã có bảng); diễn tập: `tools/backup-restore-drill.sh`. Ba tệp `.sh` đều mode `100755`. Test: `python3 -m unittest discover -s tools -q`.

### 4.11 Chặng 9: gói thuê bao tháng (S-65)  [ĐÃ CHẠY 19/10 (API, OCPP và Chromium)]

Kịch bản có số liệu so sánh được. Bắt đầu từ DB vừa seed (ví tài xế 1.000.000 đ, chưa có gói).

1. **Phiên giá trạm**: chạy mục 2.9 (20 kWh, `DEMO-ST01-CP1`), đợi ~30 giây → hoá đơn **77.000 đ** (3.850 đ/kWh), ví **923.000 đ**.
2. **Mua gói**: tài xế → **Ví** → mục **Gói thuê bao tháng** → thẻ «Gói Tháng Tiết Kiệm 3.500» (300.000 đ, 30 ngày, `00:00 - 24:00: 3.500 đ/kWh`) → **Mua gói**. Mong đợi thẻ «Gói đang dùng: Gói Tháng Tiết Kiệm 3.500», nút đổi thành **Đã có gói**, ví trừ 300.000 đ (một dòng `SUBSCRIPTION_FEE`), `audit_logs` có `SUBSCRIPTION_PURCHASED`. Khi chưa có gói nào mở bán, mục này hiện «Hiện chưa có gói thuê bao nào được mở bán.».
3. **Phiên sau khi mua gói**: chạy lại mục 2.9 (gói chỉ áp cho phiên **bắt đầu sau** thời điểm mua) → hoá đơn **70.000 đ** (20 × 3.500), nhãn `Áp dụng gói: Gói Tháng Tiết Kiệm 3.500`, `tariffSource: SUBSCRIPTION`; API `GET /api/sessions/<id>/invoice` cho `tariffSnapshot.plan.code = GOI_THANG_DEMO_3500`.
4. **Đối soát**: Kế toán → **Đối soát** → `issueCount = 0` với phiên giá gói (Wh đo khớp Wh lập hoá đơn).
5. **Ràng buộc**: mua lần hai khi gói còn hạn → `409 SUBSCRIPTION_ACTIVE`; 10–30 yêu cầu mua song song cùng tài xế → đúng một `201`, còn lại 409, không có 5xx; ví không đủ → `409 INSUFFICIENT_BALANCE`; cùng `Idempotency-Key` khác gói → `409 CONFLICT`.
6. **Quản trị gói (chưa có màn hình admin)**: dùng API với Admin hoặc Kế toán (quyền `plans:manage`). `POST /api/subscription-plans` **bắt buộc** `Idempotency-Key` (8–128 ký tự `A-Za-z0-9._:-`):

   ```bash
   curl -s -c ke-toan.ck -X POST $B/api/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"accountant@demo.csms.local\",\"password\":\"$MK\"}" > /dev/null
   # Tạo gói mới (giờ theo phút hoặc "HH:MM"; đơn giá là số nguyên đồng)
   curl -s -b ke-toan.ck -X POST $B/api/subscription-plans -H 'Content-Type: application/json' -H "Idempotency-Key: demo-plan-$(date +%s)-0001" \
     -d '{"code":"GOI_THANG_MOI","name":"Gói Tháng Mới","priceDong":250000,"durationDays":30,
          "periods":[{"from":"00:00","to":"24:00","pricePerKwh":3600,"label":"Đồng giá cả ngày"}]}'
   # Ngừng bán một gói (gói không bị xoá, chỉ active=false)
   curl -s -b ke-toan.ck -X POST $B/api/subscription-plans/<ID>/retire -H 'Content-Type: application/json' -d '{}'
   ```

   Giá trị phải là số nguyên JSON trong cận: `priceDong` 1 → 100.000.000, `durationDays` 1 → 366, `idleGraceMin` 0 → 1440, `idlePerMinDong` 0 → 100.000, đơn giá 0 → 1.000.000 đ/kWh; chuỗi như `"1e3"` bị từ chối 400.

### 4.12 Mục D (tuỳ chọn, bỏ qua nếu thiếu thời gian): trụ vật lý ESP32 và dữ liệu cá nhân

Bảng thông số (URL `ws://<IP>:<cổng>/ocpp/ESP32-DEMO-01`, subprotocol `ocpp1.6`, đầu nối 1, thẻ `TAG-ESP32-01`, giới hạn bắt tay 5 lần/10 giây → 429): [`demo/THONG-SO-NOI-TRU-VAT-LY.md`](THONG-SO-NOI-TRU-VAT-LY.md). Khi chưa có thiết bị: `node tools/demo-charge-point.js ESP32-DEMO-01 --connectors 1`.

Điểm nói về dữ liệu cá nhân (Nghị định 13/2023): log ứng dụng chỉ giữ 4 ký tự cuối của thẻ; `audit_logs` không lưu toạ độ GPS thô hay mật khẩu; mật khẩu băm Argon2id; phiên bằng cookie `HttpOnly`; tài khoản `admin/admin` và mật khẩu demo cố định chỉ có ở máy cá nhân.

## 5. Bảng lệnh tổng hợp

| Nhóm | Lệnh | Việc |
|---|---|---|
| Chạy | `python run.py`, `python run.py status`, `python run.py logs`, `python run.py down`, `python run.py reset` | Khởi động, trạng thái, log, dừng giữ dữ liệu, xoá dữ liệu |
| Không Docker | `npm ci`, `npm run migrate`, `npm run seed-demo`, `npm start` (trong `backend/`) | Cài, tạo bảng, nạp demo, chạy |
| Kiểm | `python test.py`, `python test.py --only unit\|integration\|acceptance`, `python test.py --file tests/acceptance/S-65.subscription.test.js`, `python test.py --lint-only` | Cần Docker |
| Kiểm không Docker | `npm run lint`, `npm test` (trong `backend/`, cần `TEST_DATABASE_URL` trỏ DB tên kết thúc `_test`) | Lint, toàn bộ test |
| Khói | `DEMO_PASSWORD=… node tools/demo-smoke.js` | 6/6 nhóm |
| Trụ ảo tương tác | `node tools/demo-charge-point.js <MÃ_TRỤ> [--url … --connectors n --heartbeat s --reset … --remote-stop … --profile-result … --reservation-result … --no-boot --no-status]` | Lệnh trong dấu nhắc: xem bảng dưới |
| Thăm dò bắt tay | `node tools/demo-charge-point.js probe <MÃ_TRỤ>` | 5 ca S-06 |
| Đội trụ ảo | `docker-compose up -d --no-deps vcp` (cần `ADMIN_PASSWORD`, `VCP_COUNT`) | Tự gửi MeterValues, trả lời RemoteStart/Stop |
| Mô phỏng tải | `node tools/simulate-fleet.js --url http://localhost:3000 --count 50` | Chỉ trên DB `_test`/`_chk` (cần `ADMIN_EMAIL`, `ADMIN_PASSWORD`) |
| S-21 | `node tools/test-s21-reconnect-fleet.js --count 5 --drops 1-2 --runs 1 --seed 42` | Kịch bản ngắt–nối |
| Kiểm tài liệu | `node tools/check-docs.js` | Tên tệp test trong `TONG-KET-DU-AN.md` có thật |

Lệnh trong dấu nhắc trụ ảo:

| Nhóm | Lệnh |
|---|---|
| Kết nối | `connect [noboot]`, `twin`, `drop`, `kill`, `info`, `quit` |
| Boot, nhịp tim | `boot`, `hb`, `silence`, `resume`, `skew <giờ>` |
| Đầu nối | `status <id> <trạng thái> [errorCode] [vendorErrorCode]`, `all <trạng thái> [errorCode]`, `play [giây]` |
| Thẻ | `auth <thẻ>`, `auth-all`, `dup [thẻ] [thẻ-khác]` |
| Khung hỏng | `badframe [not-json\|not-array\|bad-type\|too-short\|bad-payload\|unknown-action\|all]` |
| Phiên | `start <connectorId> [idTag] [meterStartWh]` |
| Trả lời lệnh máy chủ | `reset-mode accept\|accept-only\|reject\|silent\|error`, `remote-stop-mode accept\|reject\|silent\|error` |
| Khác | `sleep <giây>`, `help` |

Trạng thái đầu nối hợp lệ: `Available`, `Preparing`, `Charging`, `SuspendedEV`, `SuspendedEVSE`, `Finishing`, `Reserved`, `Unavailable`, `Faulted`.

## 6. Kiểm chứng trong cơ sở dữ liệu

```bash
docker compose exec db psql -U csms -d csms        # Docker (máy chỉ có v1: docker-compose)
psql "$DATABASE_URL"                               # không Docker
```

```sql
-- Phiên sạc, trạng thái hoá đơn, số đo (S-17 → S-25, S-37)
select id, status, needs_review, review_reason, meter_start, meter_stop, billing_status from charging_sessions order by id desc limit 10;

-- Hoá đơn và dòng đoạn giá (S-28 → S-34, S-65)
select i.session_id, i.total_dong, i.tariff_source, l.kind, l.wh, l.price_per_kwh, l.amount_dong
  from session_invoices i join invoice_lines l on l.invoice_id = i.id order by i.id desc, l.seq limit 10;

-- Ví, sổ cái; Σ sổ cái phải bằng Σ ví (S-40, S-41)
select entry_type, amount_dong, balance_after_dong, created_at from wallet_ledger order by id desc limit 10;
select (select coalesce(sum(amount_dong),0) from wallet_ledger) as so_cai, (select coalesce(sum(balance_dong),0) from wallets) as vi;

-- Gói thuê bao (S-65)
select p.code, s.starts_at, s.ends_at, s.price_dong from subscriptions s join subscription_plans p on p.id = s.plan_id;

-- Đặt chỗ, phí không đến (S-48 → S-51)
select id, status, no_show_fee_dong, cancel_status, cancelled_at, expired_at from reservations order by id desc limit 5;

-- Nhật ký (S-27, S-56)
select id, action, result, user_id, created_at from audit_logs order by id desc limit 10;

-- Khung công suất (S-45), tin OCPP đã lưu (S-14), lỗi đầu nối (S-10)
select station_id, start_minute, end_minute, limit_w from station_power_windows where deleted_at is null;
select action, count(*) from ocpp_messages group by action order by action;
select id, connector_id, charge_point_id, error_code, occurred_at from connector_errors order by id desc limit 5;
```

## 7. Bằng chứng tự động

Ngày 19/10/2026, nhánh `fix/pre-main-lan37`, Node 22 + PostgreSQL 16 cục bộ:

| Hạng mục | Kết quả |
|---|---|
| `npm run lint` | 0 lỗi |
| `npm test` (`backend/`) | `# tests 1305 / # pass 1304 / # fail 1` |
| Test đỏ duy nhất | `ocpp-heartbeat-timezone` («S-09 T-19»): cần Docker, **CHƯA KIỂM** ở môi trường này |
| `npm audit --omit=dev` | `found 0 vulnerabilities` |
| `python3 -m unittest discover -s tools` | `Ran 31 tests … OK` |
| `node tools/demo-smoke.js` trên DB sạch (migrate → seed ×2 → server) | `6/6 NHÓM ĐẠT` |
| Axe (Playwright) 6 trang × 360/1280 px × sáng/tối | 0 vi phạm serious/critical, không tràn ngang |
| `python test.py` (toàn bộ như CI) | **CHƯA KIỂM**: cần Docker |

Mỗi story có file test tương ứng, liệt kê trong [`project/TONG-KET-DU-AN.md`](../project/TONG-KET-DU-AN.md). Ví dụ chạy riêng một story: `python test.py --file tests/acceptance/S-45.power-windows.test.js` (hoặc, không Docker, `cd backend && node --test --test-concurrency=1 tests/acceptance/S-45.power-windows.test.js`).

## 8. Câu hỏi mentor hay hỏi và giới hạn cần nói thật

| Câu hỏi | Trả lời trung thực |
|---|---|
| Trụ nào cũng kết nối được nếu biết mã? | **Đúng, rủi ro B5**: chưa xác thực trụ (chưa có khoá/mật khẩu trụ). Có đề xuất ở [`B5-xac-thuc-tru-de-xuat-thiet-ke.md`](../guides/B5-XAC-THUC-TRU-DE-XUAT-THIET-KE.md), chờ PO chọn. Giảm thiểu: giới hạn bắt tay 5 lần/10 giây theo (IP, mã trụ). |
| Thanh toán có thật không? | **Không**: chỉ cổng sandbox giả lập, không nối VNPay/MoMo. |
| Chạy nổi 50 trụ chưa? | **Chưa kiểm** trên máy chủ nhóm; công cụ `simulate-fleet.js` có nhưng chưa chạy ở quy mô đó. Registry kết nối nằm trong bộ nhớ nên chỉ đúng khi chạy **một tiến trình**. |
| Chạy với trụ thật chưa? | Chưa. Trụ ảo gửi khung OCPP 1.6J viết tay qua `ws` (không dùng lại khung của backend); chỗ cắm cho ESP32 đã sẵn (mục 4.12). |
| Màn hình admin quản lý gói đâu? | Chưa có (đang chờ quyết định của PO); gói demo có sẵn từ seed, tạo/ngừng bằng API (mục 4.11). |
| Sao chốt kỳ/lập bảng kê không chạy được ngay? | Chỉ chốt được **tháng đã kết thúc**; máy chủ không cho trụ báo lệch giờ quá 24 giờ để tạo dữ liệu tháng trước (4.9). |
| Menu «Cảnh báo» đâu? | Backend có (job + API), giao diện chưa bật. |
| Giờ trụ lệch thì sao? | Hệ thống không tin đồng hồ trụ: `last_seen_at` luôn là giờ máy chủ (S-09); thời điểm phiên lệch > 24 giờ bị gắn cần xem xét. |
| Tile bản đồ thật? | Bản đồ dùng Leaflet đóng gói sẵn, nạp tile từ `*.tile.openstreetmap.org`; **cần Internet** khi demo (CSP đã cho phép đúng host này). Không có Internet thì bản đồ trống nhưng danh sách trạm vẫn dùng được. |

## 9. Sự cố khi demo

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `connect ECONNREFUSED` | Máy chủ chưa chạy hoặc ở cổng khác | `python run.py status`; chỉ cổng bằng `--url ws://localhost:<cổng>` |
| Bắt tay `HTTP 403` | Mã trụ chưa đăng ký | Dùng mã đã seed (`DEMO-STxx-CPy`, `ESP32-DEMO-01`) hoặc tạo trụ trong giao diện |
| Bắt tay `HTTP 429` | Quá 5 lần/10 giây cùng (IP, mã trụ) | Chờ 10 giây |
| Bắt tay `HTTP 400` | Thiếu subprotocol `ocpp1.6` hoặc mã sai định dạng | Bỏ `--protocol`; mã chỉ gồm chữ HOA, số, `_`, `-` |
| `Boot bị Rejected` | Trạm đang bị khoá | Admin **Mở khoá trạm** rồi gõ `boot` |
| Phiên sạc không có hoá đơn sau khi chạy script | Job lập hoá đơn chạy mỗi 30 giây; hoặc thời điểm phiên lệch > 24 giờ (`CLOCK_SKEW`) | Chờ 30–40 giây; dùng script ở 2.9 (giờ hiện tại) |
| Phiên sau khi mua gói vẫn tính giá trạm | Phiên bắt đầu **trước** thời điểm mua gói | Chạy phiên mới sau khi mua |
| Đặt chỗ báo lỗi | Trụ chưa online hoặc trả `Rejected/Faulted/Unavailable` cho `ReserveNow` | Bật trụ ảo mặc định (`Accepted`) |
| Nạp ví báo lỗi / không có trang cổng | Chưa bật `SANDBOX_GATEWAY=1` hoặc thiếu `PAYMENT_WEBHOOK_SECRET` | Đặt `.env`, tạo lại container |
| Màn hình không tự đổi | Tab bị ẩn, mất luồng SSE | Đưa tab lên trước, bấm **Làm mới** |
| Không thấy «Ngoại tuyến» sau `silence` | Nhịp tim còn 60 giây | Đặt `OCPP_HEARTBEAT_INTERVAL=2` và tạo lại container; gõ `info` xem nhịp tim |
| `429` khi đăng nhập | Quá `LOGIN_IP_MAX_FAILURES` | Chờ hết 15 phút hoặc `python run.py reset` |
| `smoke` báo `0/6` | Sai mật khẩu hoặc server chưa chạy | Đặt đúng `DEMO_PASSWORD` (≥ 12 ký tự), kiểm `APP_BASE_URL` |
| `Chưa có thư viện ws` | Chưa cài `backend/node_modules` | `cd backend && npm ci` |

## 10. Dọn dẹp và làm lại

| Muốn | Lệnh |
|---|---|
| Dừng, giữ dữ liệu | `python run.py down` |
| Xoá sạch và làm lại từ đầu | `python run.py reset` rồi `python run.py` |
| Seed lại (không nhân đôi) | `npm run seed-demo` (trong `backend/`, cần `ALLOW_DEMO_SEED=1`, `DEMO_PASSWORD`) |
| Đặt lại ví/gói về trạng thái ban đầu | Sổ cái và đăng ký gói là bảng **chỉ-chèn**, không xoá được: dùng `reset` để quay về dữ liệu sạch |
| Chuẩn bị 30 phút trước demo | [`demo/CHECKLIST-TRUOC-DEMO.md`](CHECKLIST-TRUOC-DEMO.md) |
| Kịch bản 5 vai trò rút gọn (Chặng 9) | [`demo/KICH-BAN-DEMO.md`](KICH-BAN-DEMO.md) |
