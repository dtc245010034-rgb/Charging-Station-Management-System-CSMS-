# Vận hành CSMS — build, chạy, dừng, khởi động lại, dữ liệu, staging

> Cập nhật: 28/9/2026. Đây là sổ tay **vận hành**. Hướng dẫn chạy lần đầu từng bước nằm ở [`README.md`](../README.md); tình trạng dự án ở [`SPRINT_STATUS.md`](./SPRINT_STATUS.md).
> Ký hiệu: `$` = shell của Linux/Git Bash. Windows dùng `py run.py` nếu không có lệnh `python`; `curl.exe` thay `curl` trong PowerShell.

## 1. Thành phần và cổng

| Thành phần | Cổng | Chạy bằng | Dữ liệu |
|---|---|---|---|
| App (API + giao diện + WebSocket OCPP) | 3000 (`APP_PORT`) | Docker service `app` hoặc `npm run dev` | — |
| PostgreSQL dev | 5432 (`POSTGRES_PORT`; bận thì `run.py` chọn cổng khác) | Docker service `db` | volume `postgres_data` (giữ khi `down`) |
| PostgreSQL test | 5433 | Docker service `db_test` | **trong RAM**, mất khi tắt |

Không có bước build cho giao diện: `frontend/` là HTML/CSS/JS thuần, Express phục vụ trực tiếp. Sửa file xong chỉ cần tải lại trang (Ctrl+F5 nếu trình duyệt giữ cache).

## 2. Yêu cầu

Git · **Docker** (Docker Desktop trên Windows 10/11; Docker Engine + plugin compose trên Linux) · **Python 3.8+**. Không cần Node hay Postgres trên máy: build, chạy và test đều trong Docker. Node ≥ 22.7 chỉ cần khi bạn chạy thủ công (mục 12).

## 3. Chạy: một lệnh, tự build

```
$ python run.py           # Windows: python run.py hoặc py run.py   |   Linux: python3 run.py
```
Script (`run.py`, chỉ dùng thư viện chuẩn của Python) làm theo thứ tự, dừng và báo cách sửa nếu bước nào hỏng:
1. Kiểm tra Docker đã cài, đang chạy, có quyền dùng; nhận Compose v2 (`docker compose`) hoặc v1 (`docker-compose`).
2. Tạo `.env` gốc với `POSTGRES_PASSWORD`, `JWT_SECRET` ngẫu nhiên nếu chưa có (không ghi đè; chỉ bổ sung khoá còn thiếu). Nếu đã có volume dữ liệu Postgres mà mất `.env` thì **hỏi xác nhận** (gõ `xoa`; hoặc `--yes`) rồi xoá volume cũ và tạo `.env` mới, vì mật khẩu cũ không khôi phục được. `down`/`reset`/`logs` vẫn chạy được khi mất `.env` (script tự điền giá trị tạm cho compose).
3. Chọn cổng: `APP_PORT` (mặc định 3000), `POSTGRES_PORT` (mặc định 5432, tránh 5433 của db test). Bận thì lấy cổng trống kế tiếp và ghi lại `APP_PORT`, `POSTGRES_PORT`, `APP_ORIGIN` vào `.env`. Nếu chính stack này đang chạy thì giữ nguyên cổng.
4. `docker compose up -d --build db app` (chỉ db + app, không bật db_test); mỗi lần đều build, có cache nên nhanh từ lần hai. `--rebuild` để bỏ cache.
5. Đợi `/api/health` (tối đa 120 giây); lỗi thì in 40 dòng log cuối.
6. Tạo admin và dữ liệu demo (idempotent), in địa chỉ và tài khoản, mở trình duyệt.

Tuỳ chọn: `--port N`, `--no-open`, `--no-demo`, `--rebuild`. Máy chưa build gì chạy đúng lệnh này là đủ.

### Tài khoản trên máy cá nhân
`admin@csms.local` / `admin`; demo `owner@`, `owner2@`, `operator@`, `accountant@`, `driver@`, `multi@` + `demo.csms.local` / `demo12345`.

**Chốt chặn an toàn:**
- Chỉ tạo mật khẩu yếu khi `BIND_HOST` là `127.0.0.1` (mặc định của `docker-compose.yml`, cổng chỉ mở cho máy này). Đặt `BIND_HOST=0.0.0.0` trong `.env` để máy khác truy cập thì admin dùng **mật khẩu ngẫu nhiên** in ra một lần.
- `backend/scripts/create-admin.js` chỉ chấp nhận mật khẩu ngắn khi có `ALLOW_WEAK_ADMIN_PASSWORD=1` **và** `NODE_ENV` khác `production`; ngược lại từ chối và thoát mã 1 (có test). Biến này không có trong Docker image, `render.yaml` hay `start:staging`.
- Chữ `admin` chỉ nằm trong `run.py`, không nằm trong `backend/`, để giữ test `no-backdoor`.
- Admin đã tồn tại thì giữ nguyên mật khẩu hiện có. Quên mật khẩu → `python run.py reset` (xoá dữ liệu).

### Staging công khai qua tunnel (ngrok…): `--public-url`
Dùng cho máy chủ nhóm (laptop chạy 24/7) để PO/mentor/người ở xa truy cập. Tunnel chạy **trên cùng máy**, trỏ vào cổng ứng dụng (mặc định 3000).

```
python run.py --public-url https://<tên-của-bạn>.ngrok-free.app
# rồi mở tunnel trỏ vào cổng 3000 (xem hướng dẫn hiện hành của ngrok; tên miền tĩnh miễn phí lấy ở trang quản lý ngrok)
python run.py --local        # quay về chế độ chạy trên máy này
```
Địa chỉ được lưu vào `.env` (`PUBLIC_URL`), nên các lần `python run.py` sau vẫn ở chế độ công khai đến khi dùng `--local`.

Chế độ này tự áp các chốt chặn (đã kiểm chứng bằng docker giả, chưa thử với ngrok thật):
- `APP_ORIGIN` = địa chỉ công khai (không bị ghi đè về `localhost`). Chỉ nhận `https://` gốc, không nhận `localhost`, đường dẫn hay tài khoản trong URL.
- **Không bao giờ** dùng mật khẩu `admin`/`admin` hay `demo12345`: mật khẩu admin và demo là ngẫu nhiên (in một lần; mật khẩu demo lưu trong `.env`, chmod 600).
- **Từ chối chạy** nếu database còn tài khoản mật khẩu mặc định từ lần chạy local trước (đăng nhập thử `admin@csms.local`/`admin` và các tài khoản demo); app bị dừng, rồi chạy `python run.py reset --yes` và chạy lại.
- `NODE_ENV=production` (cookie đăng nhập có cờ `Secure`; truy cập bằng địa chỉ HTTPS công khai) và `TRUST_PROXY=1` (giới hạn đăng nhập theo IP thật, không dồn về IP của tunnel).
- `BIND_HOST` bị ép về `127.0.0.1`: cổng ứng dụng và Postgres chỉ mở cho máy này, ra Internet chỉ qua tunnel.

Lưu ý gói ngrok miễn phí: khoảng 20.000 yêu cầu HTTP và 1 GB băng thông mỗi tháng; có trang cảnh báo ở lần vào đầu của trình duyệt. Trụ ảo và kiểm thử tự động nên chạy trên chính máy chủ (gọi `localhost`), không đi qua tunnel. Chi tiết: `docs/SPRINT_2_PLAN.md` mục 6 (Q4).

## 4. Dừng, khởi động lại

| Muốn | Lệnh | Dữ liệu |
|---|---|---|
| Dừng | `python run.py down` | **giữ** |
| Chạy lại (build lại nếu code đổi) | `python run.py` | giữ |
| Dừng và **xoá sạch dữ liệu** | `python run.py reset` (hỏi xác nhận; `--yes` để bỏ hỏi) | **MẤT** |
| Xem log | `python run.py logs` (hoặc `logs db`) | — |
| Xem trạng thái | `python run.py status` | — |

**Quy trình sửa code:** `python run.py down` → sửa → `python run.py`. Container chạy ảnh đã build (giống staging) nên không tự tải lại code.

Cổng vẫn bị chiếm sau khi tắt (process mồ côi): `lsof -i :3000` (Linux) hoặc `netstat -ano | findstr :3000` (Windows) rồi kết thúc process. `down` không xoá `.env`; chỉ `reset` xoá dữ liệu Postgres.

## 5. Lệnh Docker tương đương (khi cần làm tay)

```
$ docker compose up -d --build db app     # = python run.py (không tạo tài khoản, không chọn cổng)
$ docker compose --profile tools down     # = python run.py down
$ docker compose --profile tools down -v  # = python run.py reset (không hỏi)
$ docker compose logs -f app              # = python run.py logs
```
Đừng gõ `docker compose up` trần: nó bật cả `db_test` (cổng 5433).

## 6. Xem log và kiểm tra sức khoẻ

```
$ docker compose logs -f app          # theo dõi log app (Ctrl+C để thoát, app vẫn chạy)
$ docker compose logs --tail 100 db
$ curl http://localhost:3000/api/health
```
Log không chứa mật khẩu, token hay mã thẻ. Lỗi 5xx được in đầy đủ ở log; phản hồi cho client chỉ là “Lỗi hệ thống”.

## 7. Cơ sở dữ liệu

```
$ docker compose exec db psql -U csms -d csms                        # vào psql
$ docker compose exec app npm run migrate                            # áp migration còn thiếu (app cũng tự làm lúc khởi động)
$ docker compose exec app npm run migrate:down                       # lùi MỘT migration cuối
$ docker compose exec -T db pg_dump -U csms csms > backup.sql        # sao lưu
$ docker compose exec -T db psql -U csms -d csms < backup.sql        # khôi phục vào DB trống
```
- Quy ước: migration đã merge thì **không sửa**, muốn đổi thì thêm file mới (`NNN_ten.sql` + `NNN_ten.down.sql`).
- DB dev cũ từ trước `001_baseline` hoặc `003_stations_owner` lỗi khi migrate → `docker compose down -v` một lần. Chi tiết: `backend/README.md`.
- `backup.sql` chứa dữ liệu cá nhân → **không commit, không gửi công khai** (file `*.sql` nên nằm ngoài repo).

## 8. Kiểm thử

```
$ python test.py                       # lint + TẤT CẢ test (unit, integration, acceptance) + tự kiểm run.py
$ python test.py --only unit           # unit | integration | acceptance
$ python test.py --file tests/acceptance/S-04.station-management.test.js
$ python test.py --lint-only
$ python test.py --verbose
```
(`python run.py test` là cùng một lệnh.) Chạy trong container Node 22 với Postgres test riêng (cổng 5433, trong RAM, dừng lại sau khi xong), `node_modules` nằm trong volume Docker riêng nên không lẫn với máy. Mã thoát 0 = đạt; log đầy đủ ở `.run/test-output.log`.

Trạng thái hiện tại: **lint sạch, 200+ test backend pass** + 20 test của `run.py` (`tools/`). Test chỉ chạy trên DB có tên kết thúc `_test`. `backend/.env` không ảnh hưởng (test tự tắt nạp `.env` bằng `CSMS_SKIP_DOTENV=1`). CI chạy lint, quét phụ thuộc, test backend và test của `tools/`.

## 9. Staging (Render)

Cấu hình trong `render.yaml`; hướng dẫn bật từng bước ở README mục “Staging”.

- **Triển khai:** merge vào `main` → Render chờ CI xanh (`autoDeployTrigger: checksPass`) → build Docker → `npm run start:staging` (migrate → tạo admin → seed demo nếu bật → mở cổng).
- **Biến môi trường trên Render:** `NODE_ENV=production`, `TRUST_PROXY=2`, `APP_ORIGIN` (đúng URL Render), `JWT_SECRET` (tự sinh), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DATABASE_URL` (tự nối DB), tuỳ chọn `ALLOW_DEMO_SEED` + `DEMO_PASSWORD`.
- **Quay lại bản trước:** Render dashboard → service `csms-staging` → Events/Deploys → chọn bản cũ → *Rollback*. Migration đã chạy không tự lùi; nếu cần, lùi tay bằng `npm run migrate:down` (Render shell) trước khi rollback.
- **Tạm dừng:** Render → Suspend service (gói free vẫn ngủ sau 15 phút không có request; **mở trang trước buổi demo 5 phút**).
- **Cần biết:** DB free bị xoá sau 30 ngày; trụ ảo giữ WebSocket lâu không chạy tốt khi service ngủ; `TRUST_PROXY=2` chưa kiểm chứng trên Render thật (cách kiểm: README mục Staging).

Kiểm tra nhanh sau mỗi lần deploy: `/api/health` → `"ok":true`; đăng nhập admin; đăng nhập `owner@` (nếu bật demo) thấy 4 trạm; `owner2@` thấy 2 trạm khác.

## 10. Biến môi trường

| Biến | Nơi đặt | Bắt buộc | Mặc định / ghi chú |
|---|---|---|---|
| `POSTGRES_PASSWORD`, `JWT_SECRET` | `.env` gốc (Compose) | Có | `JWT_SECRET` ≥ 32 ký tự |
| `POSTGRES_DB/USER/PORT`, `APP_PORT` | `.env` gốc | Không | `csms` / `csms` / 5432 / 3000 |
| `APP_ORIGIN` | `.env` gốc, `backend/.env` | Có | Phải khớp địa chỉ mở trình duyệt, sai → mọi thao tác ghi bị 403 |
| `TRUST_PROXY` | cả hai | Không | `0`; đặt số proxy tin cậy khi có reverse proxy |
| `DATABASE_URL` | `backend/.env` | Có (chạy ngoài Docker) | Compose tự ráp khi chạy trong Docker |
| `LOGIN_IP_MAX_FAILURES` | `backend/.env` | Không | 20 lần sai/15 phút theo IP |
| `OCPP_HEARTBEAT_INTERVAL` | cả hai | Không | `60` giây; khoảng thời gian nhịp tim gửi cho trụ trong BootNotificationResponse |
| `OCPP_PING_INTERVAL` | cả hai | Không | `30` giây; chu kỳ gửi WebSocket Ping giữ kết nối OCPP (B9) |
| `OCPP_RATE_LIMIT_MAX` | cả hai | Không | `50` tin/giây; giới hạn tần suất tin nhắn cho mỗi kết nối OCPP (B3) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | cho `create-admin` | Khi tạo admin | mật khẩu ≥ 12 ký tự, tránh ký tự `#` |
| `ALLOW_DEMO_SEED`, `DEMO_PASSWORD`, `DEMO_EMAIL_DOMAIN`, `DEMO_STATUSES` | cho `seed-demo` | Khi seed | `=1` xác nhận; mật khẩu ≥ 8; miền mặc định `demo.csms.local`; `DEMO_STATUSES=0` để trụ ở trạng thái chưa rõ |
| `CSMS_SKIP_DOTENV` | chỉ test | Không | `=1` bỏ nạp `backend/.env` |
| `BIND_HOST` | `.env` gốc | Không | `127.0.0.1` (chỉ máy này). `0.0.0.0` để máy khác truy cập — khi đó `run.py` không tạo mật khẩu yếu |
| `ALLOW_WEAK_ADMIN_PASSWORD` | chỉ `run.py` | Không | `=1` hạ ngưỡng mật khẩu `create-admin` xuống 4 ký tự; bị từ chối khi `NODE_ENV=production` |

Có **hai** file `.env` độc lập (gốc cho Compose, `backend/.env` cho Node chạy trực tiếp); cả hai không được commit.

## 11. Chạy lại spike K-01 (mã thử vứt đi)

```
$ cd docs/spikes/k01 && npm install && node run-all.js
```
Ghi lại `session-log.json` và `findings.json` (phiên sạc đầy đủ, R-08, từ chối trụ lạ, tin nhắn trùng). Không ảnh hưởng backend.

## 12. Chạy thủ công không qua script (nâng cao)

Cần Node ≥ 22.7 và Docker cho Postgres. Tự tạo hai file `.env` (gốc cho Compose, `backend/.env` cho Node — xem `backend/.env.example`).
```
$ docker compose up -d db
$ cd backend && npm ci && npm run migrate && npm run create-admin && npm run dev
```
`create-admin` yêu cầu mật khẩu ≥ 12 ký tự (mật khẩu ngắn chỉ qua `run.py` trên máy cá nhân). Không khuyến nghị cho việc hằng ngày: dễ sai `.env`, cổng, `APP_ORIGIN`.
