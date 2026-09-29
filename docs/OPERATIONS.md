# Vận hành CSMS — build, chạy, dừng, khởi động lại, dữ liệu, staging

> Cập nhật: 28/9/2026. Đây là sổ tay **vận hành**. Hướng dẫn chạy lần đầu từng bước nằm ở [`README.md`](../README.md); tình trạng dự án ở [`SPRINT_STATUS.md`](./SPRINT_STATUS.md).
> Ký hiệu: `$` = macOS/Linux/Git Bash. Trên Windows PowerShell dùng `curl.exe` thay `curl`, và Docker Compose v1 thì đổi `docker compose` → `docker-compose`.

## 1. Thành phần và cổng

| Thành phần | Cổng | Chạy bằng | Dữ liệu |
|---|---|---|---|
| App (API + giao diện + WebSocket OCPP) | 3000 (`APP_PORT`) | Docker service `app` hoặc `npm run dev` | — |
| PostgreSQL dev | 5432 (`POSTGRES_PORT`) | Docker service `db` | volume `postgres_data` (giữ khi `down`) |
| PostgreSQL test | 5433 | Docker service `db_test` | **trong RAM**, mất khi tắt |

Không có bước build cho giao diện: `frontend/` là HTML/CSS/JS thuần, Express phục vụ trực tiếp. Sửa file xong chỉ cần tải lại trang (Ctrl+F5 nếu trình duyệt giữ cache).

## 2. Yêu cầu

Git · Docker Desktop (hoặc Docker Engine + Compose) · Node.js **≥ 22.7** (chỉ khi chạy test hoặc chạy app ngoài Docker; không có thì chạy `npm` trong container, xem README mục 3).

## 3. Build

```
$ docker compose build app              # dựng image (node:22-bookworm-slim, npm ci --omit=dev, chạy bằng user node)
$ docker compose build --no-cache app   # dựng lại từ đầu khi nghi ngờ cache
```

Image chứa: `backend/src`, `backend/migrations`, `backend/scripts`, `frontend/`. Có `HEALTHCHECK` gọi `/api/health`.

## 4. Khởi động

**Cách A — tất cả bằng Docker (dùng để demo):**
```
$ docker compose up -d --build app      # bật app + db, chạy nền; app tự migrate trước khi mở cổng
$ docker compose ps                     # phải thấy db "healthy", app "Up"
$ curl http://localhost:3000/api/health # {"ok":true,...}
$ docker compose exec -e ADMIN_EMAIL=admin@csms.local -e ADMIN_PASSWORD=<>=12-ky-tu> app npm run create-admin   # lần đầu
```
Đừng gõ `docker compose up` trần: nó bật cả `db_test` (cổng 5433) và báo lỗi nếu cổng đang bận.

**Cách B — app chạy trên máy, DB trong Docker (khi sửa backend):**
```
$ docker compose up -d db
$ cd backend && npm ci
$ cp .env.example .env    # điền DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
$ npm run migrate && npm run create-admin
$ npm run dev             # tự khởi động lại khi sửa code
```

**Dữ liệu demo (tuỳ chọn, để cả nhóm thử giao diện):**
```
$ docker compose exec -e ALLOW_DEMO_SEED=1 -e DEMO_PASSWORD=<mat-khau-demo> app npm run seed-demo
```
Tạo 6 tài khoản (`owner@`, `owner2@`, `operator@`, `accountant@`, `driver@`, `multi@` + `demo.csms.local`), 6 trạm, 12 trụ `DEMO-…`. Chạy lại an toàn. Trạng thái trụ trong seed là **giả lập**, chỉ dùng demo.

## 5. Dừng, khởi động lại

| Muốn | Lệnh | Dữ liệu |
|---|---|---|
| Tạm dừng, bật lại nhanh | `docker compose stop` → `docker compose start` | giữ |
| Dừng và gỡ container | `docker compose down` | **giữ** (volume còn) |
| Dừng và **xoá sạch dữ liệu** | `docker compose down -v` | **MẤT** — làm lại từ đầu |
| Khởi động lại app thôi | `docker compose restart app` | giữ |
| Áp dụng `.env` gốc mới | `docker compose up -d --force-recreate app` | giữ |
| Dừng app chạy bằng Node | `Ctrl+C` trong terminal đang chạy `npm run dev` | giữ |

Cổng 3000 còn bị chiếm sau khi tắt (process mồ côi):
```
$ lsof -i :3000            # macOS/Linux → kill <PID>
> netstat -ano | findstr :3000     # Windows → taskkill /PID <PID> /F
```
`docker compose down` **không** xoá `.env`; nó chỉ xoá container. Chỉ `down -v` mới xoá dữ liệu Postgres.

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
$ docker compose up -d db_test
$ cd backend && npm ci && npm run lint && npm test         # 138 test, phải "fail 0"
$ node --test tests/acceptance/S-04.station-management.test.js   # chạy riêng một file
```
Trạng thái hiện tại (28/9/2026): **lint sạch, 138/138 test pass** (12 file acceptance, 4 integration, 10 unit). Test chỉ chạy trên DB có tên kết thúc `_test`. Nếu `backend/.env` tồn tại vẫn chạy đúng (test tự tắt nạp `.env` bằng `CSMS_SKIP_DOTENV=1`).

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
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | cho `create-admin` | Khi tạo admin | mật khẩu ≥ 12 ký tự, tránh ký tự `#` |
| `ALLOW_DEMO_SEED`, `DEMO_PASSWORD`, `DEMO_EMAIL_DOMAIN`, `DEMO_STATUSES` | cho `seed-demo` | Khi seed | `=1` xác nhận; mật khẩu ≥ 8; miền mặc định `demo.csms.local`; `DEMO_STATUSES=0` để trụ ở trạng thái chưa rõ |
| `CSMS_SKIP_DOTENV` | chỉ test | Không | `=1` bỏ nạp `backend/.env` |

Có **hai** file `.env` độc lập (gốc cho Compose, `backend/.env` cho Node chạy trực tiếp); cả hai không được commit.

## 11. Chạy lại spike K-01 (mã thử vứt đi)

```
$ cd docs/spikes/k01 && npm install && node run-all.js
```
Ghi lại `session-log.json` và `findings.json` (phiên sạc đầy đủ, R-08, từ chối trụ lạ, tin nhắn trùng). Không ảnh hưởng backend.
