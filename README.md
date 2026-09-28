# CSMS · Nền tảng vận hành trạm sạc xe điện

Đồ án Thực tập cơ sở ICTU × CodeGym · nhóm **TTCS_T926_K8S4_N3** · PO: Mentor Lê Đình Tuấn · dự án 21/9 – 26/10/2026.

**Product Goal:** Đơn vị vận hành nắm được mọi phiên sạc theo thời gian thực qua OCPP 1.6J, tính đúng tiền theo biểu giá nhiều khung giờ, không để trạm vượt công suất, và đối soát doanh thu khớp với số kWh đã cấp.

> **Ràng buộc:** thanh toán chỉ chạy môi trường sandbox. Vị trí và lịch sử di chuyển của tài xế là dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP.

## Trạng thái nhanh (28/9/2026)

| | |
|---|---|
| Sprint 1 | **12/12 SP xong** (Jira): khung dự án, đăng nhập, phân quyền, trạm/trụ/đầu nối, spike OCPP. Demo Thứ Tư 30/9 |
| Sprint 2 | Kế hoạch 20 SP (kết nối OCPP có xác thực, trạng thái trụ), **chưa bắt đầu code** |
| Chất lượng | Lint sạch · **138/138 test pass** · giao diện mới đã chạy thử trên trình duyệt |
| Chạy được ngay | Đăng nhập, 5 workspace theo vai trò, quản lý trạm/trụ, bảng điều khiển Vận hành, dữ liệu demo |
| Chưa có | Phiên sạc thật, tính tiền, ví, phân bổ công suất, đặt chỗ, đối soát (Sprint 2–8) |

Chi tiết: mục 5 (tổng quan), [`docs/SPRINT_STATUS.md`](docs/SPRINT_STATUS.md) (từng story, rủi ro, DoD), [`docs/OPERATIONS.md`](docs/OPERATIONS.md) (build, chạy, dừng, dữ liệu, staging).
Muốn đóng góp code? Xem `CONTRIBUTING.md`. Còn không, bắt đầu ngay dưới đây.

---

## 1. Chạy dự án lần đầu

**Cần có:** Git, Docker Desktop, Node.js **22.7 trở lên** (chỉ cần khi chạy test hoặc chạy app ngoài Docker).

> **Máy chưa có Node 22.7?** Kiểm bằng `node -v`. Nếu thấp hơn (ví dụ Node 18 có sẵn theo mặc định trên nhiều máy), có 2 cách, không cần gỡ bản Node đang dùng cho việc khác:
> - **Cài thêm bằng nvm** (khuyến nghị, dùng được cho cả chạy app lẫn test): [nvm](https://github.com/nvm-sh/nvm) (macOS/Linux) hoặc [nvm-windows](https://github.com/coreybutler/nvm-windows), sau đó `nvm install 22 && nvm use 22`.
> - **Không muốn cài gì thêm:** chạy `npm`/`npm test`/`npm run lint` bên trong container Docker có sẵn Node 22 — xem mục 3 (Kiểm thử), cách này cũng dùng được để chạy `npm run migrate`, `npm run create-admin` mà không cần cài Node.
>
> **Lệnh `docker compose` báo "unknown command"?** Máy chỉ có Docker Compose bản cũ (v1, lệnh có gạch ngang). Thay mọi `docker compose ...` trong tài liệu này bằng `docker-compose ...` (cùng ý nghĩa, chỉ khác cú pháp). Kiểm bằng `docker compose version` hoặc `docker-compose version`.

### Cách A — chạy tất cả bằng Docker (khuyến nghị để dùng thử, demo)

1. Clone và vào thư mục dự án:
   ```
   git clone https://github.com/dtc245010034-rgb/Charging-Station-Management-System-CSMS-.git
   cd Charging-Station-Management-System-CSMS-
   ```
2. Tạo file `.env` **ở thư mục gốc** (file này chỉ dùng cho Docker Compose, không commit):
   ```
   POSTGRES_PASSWORD=<mat-khau-db-tu-dat>
   JWT_SECRET=<chuoi-ngau-nhien-it-nhat-32-ky-tu>
   ```
   Tạo chuỗi ngẫu nhiên: `openssl rand -hex 32` (Git Bash) hoặc
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

   > ⚠️ Đừng đặt mật khẩu chứa ký tự `#` trong file `.env`: phần sau dấu `#` bị coi là ghi chú và bị cắt mất. Nếu bắt buộc dùng, bọc cả giá trị trong nháy kép, ví dụ `ADMIN_PASSWORD="Mat#Khau12345"`.
3. Khởi động (app tự chạy migration trước khi mở cổng):
   ```
   docker compose up --build app
   ```
   Lệnh này chỉ bật `app` và `db`. Đừng bỏ chữ `app`: khi đó Docker bật thêm `db_test` (Postgres dành cho test, cổng 5433) và sẽ báo lỗi nếu cổng 5433 đang bị dùng.
4. Mở `http://localhost:3000`. Kiểm tra sức khoẻ: `http://localhost:3000/api/health`.
5. Tạo tài khoản Quản trị đầu tiên (hệ thống **không có tài khoản mặc định**):
   ```
   docker compose exec -e ADMIN_EMAIL=admin@csms.local -e ADMIN_PASSWORD=<it-nhat-12-ky-tu> app npm run create-admin
   ```

### Cách B — app chạy trên máy, database trong Docker (dùng khi code backend)

```
docker compose up -d db
cd backend
npm ci
copy .env.example .env      # macOS/Linux: cp .env.example .env
```
Điền `backend/.env`: `DATABASE_URL` (mật khẩu trùng `POSTGRES_PASSWORD` ở `.env` gốc), `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (không dùng ký tự `#`, xem cảnh báo ở Cách A). Sau đó:
```
npm run migrate
npm run create-admin
npm run dev                  # tự khởi động lại khi sửa code
```

> ⚠️ Có **hai** file `.env`: `.env` ở gốc cho Docker Compose, `backend/.env` cho app chạy trực tiếp bằng Node. Cả hai đều không được commit.

### Chi tiết file `.env`

Hai file **độc lập, không đọc lẫn nhau** — sửa nhầm file thường là lý do "đổi `.env` mà không thấy tác dụng":

- **`.env` ở thư mục gốc**: chỉ lệnh `docker compose` đọc, để điền vào `${...}` trong `docker-compose.yml`. Container `app` **không** đọc file này trực tiếp — mọi biến nó cần đã được `docker-compose.yml` truyền vào qua khối `environment:`.
- **`backend/.env`**: chỉ app đọc, và chỉ khi chạy trực tiếp bằng `node`/`npm` (Cách B, hoặc `npm test`). Container Docker (Cách A) không đụng tới file này.

**Biến trong `.env` ở gốc** (theo `docker-compose.yml`):

| Biến | Bắt buộc? | Mặc định nếu bỏ trống | Ghi chú |
|---|---|---|---|
| `POSTGRES_PASSWORD` | **Có** | — (Compose từ chối chạy nếu thiếu) | Mật khẩu Postgres, tự đặt |
| `JWT_SECRET` | **Có** | — (Compose từ chối chạy nếu thiếu) | ≥ 32 ký tự ngẫu nhiên |
| `POSTGRES_DB` | Không | `csms` | |
| `POSTGRES_USER` | Không | `csms` | |
| `POSTGRES_PORT` | Không | `5432` | Đổi khi cổng 5432 máy đã bị chiếm |
| `APP_PORT` | Không | `3000` | Đổi khi cổng 3000 máy đã bị chiếm |
| `APP_ORIGIN` | Không | `http://localhost:3000` | Phải khớp địa chỉ đang mở trình duyệt, nếu không mọi request ghi (POST/PATCH) bị 403 |
| `TRUST_PROXY` | Không | `0` | Chỉ đổi khi có reverse proxy đứng trước app |

> `DATABASE_URL` **không** khai trong `.env` gốc — Compose tự ráp từ `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` ở trên. Khai thêm `DATABASE_URL` vào file này không có tác dụng gì.

**Biến trong `backend/.env`**: xem đủ trong `backend/.env.example` (đã có chú thích từng dòng) — copy file đó rồi điền, đừng gõ tay lại từ đầu.

**Sửa `.env` xong mà không thấy đổi:** container `app` đã đọc biến môi trường **một lần lúc khởi động**, sửa `.env` gốc không tự áp dụng cho container đang chạy. Phải khởi động lại:

```
docker compose up -d --force-recreate app
```

Xem trước Compose sẽ nạp giá trị nào (không cần khởi động thật) bằng `docker compose config`.

**Trước khi commit, luôn kiểm lại `.env` không bị đưa vào:**

```
git status                    # .env không được xuất hiện ở đây
git check-ignore -v .env      # có dòng in ra = đang bị ignore, đúng
```

### Dừng và dọn dẹp

```
docker compose stop          # tạm dừng (bật lại: docker compose start)
docker compose down          # dừng và gỡ container, GIỮ dữ liệu (volume postgres_data)
docker compose down -v       # dừng và XOÁ luôn dữ liệu — dùng khi muốn làm lại từ đầu
docker compose restart app   # khởi động lại app
docker compose logs -f app   # xem log (Ctrl+C thoát, app vẫn chạy)
```
App chạy bằng Node (Cách B) thì dừng bằng `Ctrl+C`. Sao lưu/khôi phục DB, lùi migration, cổng bị chiếm, quay lại bản staging cũ: xem [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

---

## 2. Dùng thử hệ thống

| Vai trò | Mã | Workspace sau đăng nhập | Làm được gì lúc này |
|---|---|---|---|
| Quản trị | `ADMIN` | `/app.html#/admin` | Tạo tài khoản mọi vai trò (form trong giao diện), xem và sửa mọi trạm, trụ |
| Chủ trạm | `STATION_OWNER` | `/app.html#/owner` | Tạo, sửa, xem **trạm và trụ của mình** (giao diện đầy đủ: danh sách, bản đồ, thêm trụ) |
| Vận hành viên | `OPERATOR` | `/app.html#/operator` | Bảng điều khiển vận hành: chỉ số, bản đồ, trạng thái trụ; xem mọi trạm, trụ, không sửa được |
| Kế toán | `ACCOUNTANT` | `/app.html#/accountant` | Chưa có chức năng (từ sprint tính tiền) |
| Tài xế | `DRIVER` | `/app.html#/driver` | Tự đăng ký, đăng nhập; giao diện điện thoại; chưa có chức năng sạc |

### Tạo tài khoản

Hệ thống **không có tài khoản mặc định** ngoài Quản trị tạo ở bước 5 mục 1. Hai cách tạo tài khoản:

| Ai tạo | Vai trò tạo được | Endpoint | Ghi chú |
|---|---|---|---|
| Bất kỳ ai (đăng ký công khai) | Chỉ `DRIVER` | `POST /api/auth/register` | Gửi `role` (kể cả `"DRIVER"`) → 400. Không được chọn vai trò |
| Quản trị (`ADMIN`, đã đăng nhập) | Cả 5 vai trò | `POST /api/admin/users` | Bắt buộc gửi `role` đúng 1 trong 5 giá trị dưới |

5 giá trị `role` hợp lệ: `ADMIN`, `STATION_OWNER`, `OPERATOR`, `ACCOUNTANT`, `DRIVER`. Mật khẩu tối thiểu **8 ký tự** cho cả hai cách (riêng `ADMIN_PASSWORD` lúc `npm run create-admin` ở bước 5 mục 1 yêu cầu tối thiểu **12 ký tự**, quy định riêng của script đó).

Dùng `curl` (Windows PowerShell gõ `curl.exe`, không gõ `curl`). Cookie đăng nhập được lưu vào file `*.cookie` (đã có trong `.gitignore`, vì chứa phiên đăng nhập: **không commit, không gửi cho người khác**).

```
# 1. Quản trị đăng nhập (tài khoản đã tạo ở bước 5 mục 1)
curl -c admin.cookie -X POST http://localhost:3000/api/auth/login -H "content-type: application/json" -d "{\"email\":\"admin@csms.local\",\"password\":\"<mat-khau-admin>\"}"

# 2. Quản trị tạo tài khoản cho từng vai trò còn lại — đổi "role" và email cho mỗi lệnh
curl -b admin.cookie -X POST http://localhost:3000/api/admin/users -H "content-type: application/json" -d "{\"name\":\"Chu tram A\",\"email\":\"owner@csms.local\",\"password\":\"MatKhau#12345\",\"role\":\"STATION_OWNER\"}"
curl -b admin.cookie -X POST http://localhost:3000/api/admin/users -H "content-type: application/json" -d "{\"name\":\"Van hanh A\",\"email\":\"operator@csms.local\",\"password\":\"MatKhau#12345\",\"role\":\"OPERATOR\"}"
curl -b admin.cookie -X POST http://localhost:3000/api/admin/users -H "content-type: application/json" -d "{\"name\":\"Ke toan A\",\"email\":\"accountant@csms.local\",\"password\":\"MatKhau#12345\",\"role\":\"ACCOUNTANT\"}"

# 3. Đăng ký công khai — luôn ra tài khoản Tài xế, không gửi "role"
curl -c driver.cookie -X POST http://localhost:3000/api/auth/register -H "content-type: application/json" -d "{\"name\":\"Tai xe A\",\"email\":\"driver@csms.local\",\"password\":\"MatKhau#12345\"}"
```

### Thử bằng dòng lệnh (không cần giao diện)

```
# Chủ trạm đăng nhập rồi tạo trạm
curl -c owner.cookie -X POST http://localhost:3000/api/auth/login -H "content-type: application/json" -d "{\"email\":\"owner@csms.local\",\"password\":\"MatKhau#12345\"}"
curl -b owner.cookie -X POST http://localhost:3000/api/stations -H "content-type: application/json" -H "Idempotency-Key: demo-tram-001" -d "{\"name\":\"Tram ICTU\",\"address\":\"Thai Nguyen\",\"latitude\":21.59,\"longitude\":105.84}"

# Xem danh sách trạm của mình
curl -b owner.cookie http://localhost:3000/api/stations
```

> `POST /api/stations` bắt buộc header `Idempotency-Key` (chuỗi 8-128 ký tự, tự đặt, dùng để chống bấm lưu hai lần tạo hai trạm) — thiếu header này bị 400.

### Dữ liệu demo (GYM-14) — để cả nhóm thử giao diện

Tạo sẵn 6 tài khoản (mỗi vai trò một tài khoản, cộng 1 tài khoản **nhiều vai trò** Vận hành + Chủ trạm), 6 trạm, 12 trụ (mã `DEMO-...`), 24 đầu nối với trạng thái đa dạng để dashboard có dữ liệu. Chạy lại nhiều lần không tạo trùng.

- **Trên staging (Render):** đặt 2 biến `ALLOW_DEMO_SEED=1` và `DEMO_PASSWORD=<mật-khẩu-≥8-ký-tự>` rồi deploy lại; seed chạy tự động lúc khởi động. Xoá biến `ALLOW_DEMO_SEED` để tắt.
- **Trên máy (Cách B, sau `npm run migrate`):** `ALLOW_DEMO_SEED=1 DEMO_PASSWORD=... npm run seed-demo` (trong `backend/`).
- Đăng nhập bằng `owner@`, `owner2@`, `operator@`, `accountant@`, `driver@`, `multi@` + `demo.csms.local` (đổi được bằng `DEMO_EMAIL_DOMAIN`), mật khẩu là `DEMO_PASSWORD`. `owner@` chỉ thấy 4 trạm của mình, `owner2@` thấy 2 trạm khác — dùng để thử cô lập dữ liệu.
- ⚠️ Trạng thái trụ (Đang sạc, Lỗi…) trong seed là **giả lập để trình diễn**, không phải dữ liệu OCPP thật. Chỉ dùng trên staging/máy cá nhân, không chạy trên dữ liệu thật. Script từ chối chạy nếu thiếu `ALLOW_DEMO_SEED=1`.

Danh sách API đầy đủ và quy tắc bảo mật: xem `backend/README.md`.

---

## 3. Kiểm thử

Luôn bật Postgres riêng cho test trước (cổng **5433**, dữ liệu trong RAM, tự mất khi tắt container — không đụng database dev ở cổng 5432):

```
docker compose up -d db_test
```

### Cách A — máy đã có Node 22.7 trở lên

```
cd backend
npm ci              # lần đầu, hoặc khi package-lock.json đổi
npm run lint
npm test
```

### Cách B — máy chưa có Node 22.7 (chạy trong container Docker, không cần cài Node)

Chạy từ **thư mục gốc dự án** (không `cd backend` trước, khác Cách A):

```
docker run --rm --network host --user "$(id -u):$(id -g)" \
  -e TEST_DATABASE_URL=postgresql://csms:csms_test_only@localhost:5433/csms_test \
  -v "$PWD":/app -w /app/backend \
  node:22-bookworm-slim sh -c "npm ci && npm run lint && npm test"
```

> `--network host` chỉ chạy đúng trên Linux. Trên **macOS/Windows (Docker Desktop)**: bỏ `--network host`, đổi `localhost` thành `host.docker.internal` trong `TEST_DATABASE_URL` (Docker Desktop đã tự trỏ tên này về máy thật, không cần cấu hình gì thêm).
>
> `$(id -u):$(id -g)` chạy được trên macOS/Linux/Git Bash. **PowerShell thuần** không hiểu cú pháp này: chạy trong Git Bash, hoặc bỏ hẳn `--user "$(id -u):$(id -g)"` (kém an toàn hơn — file `node_modules` container tạo ra sẽ thuộc quyền `root`, có thể phải `sudo` mới xoá được sau này).
>
> Cách này chạy được mọi lệnh `npm run ...` khác của `backend/package.json` (`migrate`, `create-admin`, `dev`...), chỉ cần đổi phần sau `sh -c`.

### Chạy riêng một file test

Gọi thẳng `node --test`, không qua script `npm test` (script đó cố định chạy toàn bộ `tests/**/*.test.js`, thêm tham số vào `npm test -- ...` không lọc bớt được):

```
node --test tests/acceptance/S-04.station-management.test.js
# hoặc trong container: thay "npm ci && npm run lint && npm test" ở Cách B bằng "npm ci && node --test tests/acceptance/S-04.station-management.test.js"
```

### Đọc kết quả

Test in theo định dạng TAP: mỗi dòng `ok N - <tên test>` là qua, `not ok N - <tên test>` là fail kèm khối `error`/`expected`/`actual` ngay bên dưới. Cuối cùng có tổng kết:

```
# tests 138
# pass 138
# fail 0
```

`# fail 0` là điều kiện để merge — CI trên mỗi Pull Request chạy đúng `npm run lint && npm test`, PR đỏ thì không merge được.

Ca kiểm thử và báo cáo QA: `docs/testing/`, `docs/stories/S-xx.md`.

---

## Staging (môi trường chạy thật, tự cập nhật khi merge)

Staging chạy **cùng Dockerfile** với `docker-compose`, triển khai trên [Render](https://render.com) bằng file `render.yaml` ở thư mục gốc (gói free, không tốn tiền). Đây là môi trường để Product Owner và cả nhóm xem sản phẩm chạy thật; Definition of Done yêu cầu AC pass ở đây.

**Bật một lần (người có quyền admin repo GitHub, khoảng 10 phút):**

1. Đăng ký Render bằng tài khoản GitHub, cho Render quyền đọc repo này.
2. Dashboard Render: **New → Blueprint** → chọn repo → nhánh `main`. Render đọc `render.yaml` và tạo 1 web service `csms-staging` + 1 database `csms-staging-db`.
3. Khi Render hỏi 3 biến (`sync: false`):
   - `APP_ORIGIN`: `https://csms-staging.onrender.com` (đúng URL Render cấp, xem ở đầu trang service; nếu tên bị trùng Render sẽ thêm hậu tố thì dùng URL đó). Sai giá trị này thì mọi thao tác ghi bị 403.
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` (≥ 12 ký tự, không dùng ký tự `#`): tài khoản Quản trị đầu tiên, tự tạo lúc khởi động (chạy lại không đổi gì).
4. Sau lần deploy đầu, mở `<URL>/api/health` phải thấy `"ok":true`, rồi đăng nhập bằng admin ở bước 3.

**Cách nó vận hành**

- Merge vào `main` → Render chờ CI GitHub xanh (`autoDeployTrigger: checksPass`) → build → chạy migration → mở cổng. CI đỏ thì Render **không** triển khai, bản cũ vẫn chạy. Deploy lỗi lúc khởi động cũng giữ bản cũ.
- Bí mật (`JWT_SECRET`, mật khẩu admin, chuỗi kết nối DB) nằm ở Render, không nằm trong repo.
- Xem log / khởi động lại: dashboard Render → service `csms-staging`.

**Giới hạn của gói free — biết trước để khỏi bất ngờ**

- Service **ngủ sau 15 phút không có request**, lần đầu mở lại chờ 30–60 giây. **Mở trang staging trước buổi demo 5 phút.**
- Trụ sạc ảo giữ kết nối WebSocket lâu dài sẽ không chạy tốt khi service ngủ. Trước Sprint 2 (OCPP) cần chuyển sang gói trả phí của Render hoặc một máy chủ riêng chạy `docker compose`.
- Database free của Render bị **xoá sau 30 ngày** (có thêm 14 ngày chờ). Đủ cho dự án đến 26/10 nhưng **không phải nơi giữ dữ liệu quan trọng**.
- `TRUST_PROXY=2` trong `render.yaml` là giá trị theo tài liệu, **chưa kiểm chứng trên Render thật**: nếu sai, mọi người dùng bị coi là cùng một IP và khoá đăng nhập theo IP (20 lần sai) sẽ khoá cả nhóm. Kiểm sau deploy đầu: cố ý đăng nhập sai 6 lần bằng một email lạ từ máy A, rồi đăng nhập đúng từ máy B (mạng khác) — phải vào được.

---

## 4. Gặp lỗi thường gặp

| Hiện tượng | Nguyên nhân và cách xử lý |
|---|---|
| App thoát ngay, báo thiếu `JWT_SECRET` hoặc `DATABASE_URL` | Chưa tạo hoặc điền thiếu file `.env` tương ứng (mục 1). `JWT_SECRET` phải ≥ 32 ký tự |
| `migrate` lỗi ở `003_stations_owner` hoặc `001_baseline` | Database cũ từ trước baseline. Chạy `docker compose down -v` **một lần** (xoá dữ liệu dev) rồi chạy lại |
| Cổng 5432 hoặc 3000 đã bị dùng | Tắt Postgres/ứng dụng khác, hoặc đổi `POSTGRES_PORT` / `APP_PORT` trong `.env` gốc |
| Đổi cổng app xong thì mọi thao tác ghi bị 403 "Origin không hợp lệ" | Đặt `APP_ORIGIN` khớp địa chỉ đang mở, ví dụ `http://localhost:8080` |
| Đăng nhập bị 429 kể cả khi đúng mật khẩu | Đang bị khoá 15 phút do sai quá 5 lần; đợi hết thời gian khoá |
| Node báo phiên bản không hợp lệ, hoặc `npm error engine Unsupported` | Cần Node.js ≥ 22.7. Cài bằng nvm, hoặc chạy qua container Docker — xem mục 3, Cách B |
| `docker compose: unknown command` hoặc `command not found` | Máy chỉ có Docker Compose v1: đổi `docker compose` thành `docker-compose` (xem đầu mục 1) |
| Chạy Cách B (container Node) trên macOS/Windows: lỗi kết nối Postgres, `ECONNREFUSED` | Bỏ `--network host`, đổi `localhost` thành `host.docker.internal` trong `TEST_DATABASE_URL` (xem mục 3) |
| `npm test` chạy hết cả 138 test dù chỉ muốn 1 file | `npm test -- <file>` không lọc được vì script cố định chạy cả thư mục `tests/`. Gọi thẳng `node --test <file>` (xem mục 3) |

---

## 5. Tổng quan hệ thống

*Cập nhật: 28/9/2026, cuối Sprint 1. Trạng thái Done chính thức theo Jira (bảng GYM) và Definition of Done; bảng đầy đủ ở [`docs/SPRINT_STATUS.md`](docs/SPRINT_STATUS.md).*

### Kiến trúc

```
Trình duyệt ──HTTP/JSON (cookie httpOnly)──► Express 5 (backend/src)
   frontend/ (HTML/CSS/JS thuần, ES modules,          ├─ modules: auth · users · stations · charge-points · health · audit
   không build; Leaflet đặt sẵn trong repo)           ├─ security: ma trận quyền + chặn route chưa khai quyền
                                                      └─ PostgreSQL 16 (migration 001–005)
Trụ sạc ──WebSocket /ocpp/<mã trụ>──► máy chủ OCPP (hiện là mã spike, chỉ trả lời tĩnh)
```

Công nghệ: Node ≥ 22.7 · Express 5 · PostgreSQL 16 · Zod · argon2id · JWT trong cookie · `ws` · Docker Compose · GitHub Actions · Render (staging).

### Sprint 1 — đã xong (12 SP)

| Jira | Story | Kết quả |
|---|---|---|
| GYM-7 | S-01 Khung ứng dụng | Docker Compose, migration tiến/lùi, test, lint, CI (lint + test + quét phụ thuộc). **Staging cần bật một lần** (mục Staging) |
| GYM-8 | S-02 Đăng nhập | Email + mật khẩu, khoá 15 phút sau 5 lần sai (theo email và IP), không lộ email tồn tại |
| GYM-9 | S-03 Phân quyền | 5 vai trò; route chưa khai quyền bị chặn; chủ trạm chỉ thấy trạm của mình; truy cập trái phép trả 403 và ghi nhật ký |
| GYM-10 | S-04 Tạo/sửa trạm | Toạ độ bắt buộc và được kiểm; chống bấm lưu hai lần bằng `Idempotency-Key`; trạm mới `INACTIVE` |
| GYM-11 | S-05 Trụ và đầu nối | Mã trụ duy nhất, luôn chữ hoa (khớp OCPP), 1–4 đầu nối |
| GYM-12 | K-01 Spike OCPP | Phiên sạc trọn vẹn đã ghi, R-08 đã kiểm, bằng chứng cho S-06/S-14/S-21: `docs/spikes/K-01-ocpp-simulator.md` |
| GYM-13 | SM-01 Quy ước làm việc | `CONTRIBUTING.md` |
| GYM-14 | SM-02 Chuẩn bị demo | Đang làm: dữ liệu demo, ảnh chụp giao diện, hướng dẫn |

### Giao diện — bạn thao tác được ở đâu

Đăng nhập tại `/` rồi vào workspace theo vai trò (`/app.html#/<workspace>`). Một tài khoản có nhiều vai trò thì đổi workspace ở góc trên bên trái. **Ctrl+K** tìm trạm/trụ/trang; nút mặt trời/trăng đổi sáng/tối.

| Workspace | Làm được thật | Chỉ là khung / chưa có |
|---|---|---|
| Chủ trạm | Danh sách trạm, **tạo/sửa trạm** (chọn vị trí trên bản đồ), **thêm trụ** (kiểm tra trùng mã), sửa trụ, bản đồ, tổng quan | Doanh thu |
| Quản trị | Như Chủ trạm cho mọi trạm; **tạo tài khoản mọi vai trò** | Danh sách/khoá tài khoản, nhật ký |
| Vận hành viên | Bảng điều khiển (chỉ số, bản đồ, biểu đồ trạng thái trụ), xem trạm/trụ, lọc, ngăn kéo chi tiết — **chỉ xem** | Cảnh báo, hiệu suất, phiên sạc, điều khiển từ xa (khối hiển thị “chưa có dữ liệu”) |
| Kế toán | Đăng nhập, khung tổng quan | Toàn bộ đối soát |
| Tài xế | Đăng ký/đăng nhập, giao diện điện thoại, trang tài khoản | Tìm trạm, sạc, ví, lịch sử |

Menu của chức năng chưa có backend được **ẩn** (cấu hình trong `frontend/app/workspace.js`, mỗi mục ghi story sẽ bật nó). Trạng thái “thời gian thực” hiện là tự tải lại mỗi 15 giây vì chưa có trụ nào kết nối thật.

### API hiện có (chi tiết ở `backend/README.md`)

`/api/auth/{register,login,logout,me}` · `/api/admin/users` · `/api/roles` · `/api/stations` (+`/:id`) · `/api/stations/:id/charge-points` · `/api/charge-points` (+`/:id`, `/check-code`) · `/api/health` · WebSocket `/ocpp/<mã>` (spike).

### Đang làm / sắp tới

| Sprint | Mục tiêu | Trạng thái |
|---|---|---|
| 2 (28/9–5/10) | Trụ ảo nối vào hệ thống được xác thực; vận hành viên thấy đúng trạng thái mọi trụ (S-06…S-16, GYM-32…42, 20 SP) | Chưa bắt đầu code; K-01 đã xong phần nền |
| 3 | Một phiên sạc trọn vẹn, kWh đúng dù trụ mất kết nối | Chưa |
| 4 | Tính đúng tiền theo biểu giá nhiều khung giờ | Chưa |
| 5 | Nạp ví (sandbox), tự trừ tiền | Chưa; **chưa có hồ sơ sandbox thanh toán** |
| 6 | Phân bổ công suất | Chưa |
| 7 | Tìm trạm, đặt chỗ | Chưa |
| 8 | Đối soát, chia doanh thu | Chưa |

> ⚠️ Backlog có 8 sprint nhưng dự án chỉ còn khoảng 5 tuần làm việc (kết thúc 26/10). Phạm vi thực tế do PO chốt; bảng trên là lộ trình, không phải cam kết.

---

## 6. Cấu trúc thư mục

```
backend/
  src/modules/<miền>/     routes (khai quyền, kiểm đầu vào) → service (nghiệp vụ) → repository (SQL)
  src/security/           ma trận quyền (permissions.js), chặn route chưa khai quyền (routeGuard.js)
  src/server.js           listen + WebSocket OCPP (mã spike, sẽ thay ở Sprint 2)
  migrations/             NNN_ten.sql + NNN_ten.down.sql — đã merge thì không sửa, muốn đổi thì thêm file mới
  scripts/                create-admin.js, seed-demo.js
  tests/                  unit/ integration/ acceptance/ (một file cho mỗi story, tên test theo AC)
frontend/                 HTML/CSS/JS thuần, ES modules, không build
  index.html              đăng nhập / đăng ký          app.html   vỏ ứng dụng (mọi workspace)
  main.js                 khởi động, dựng shell theo vai trò
  app/                    router (hash), phiên, quyền, workspace (menu), status (nhóm trạng thái), theme
  components/             sidebar, topbar, palette (Ctrl+K), modal/drawer, bảng, biểu đồ tròn, bản đồ, toast…
  pages/<vai trò>/        trang theo vai trò; pages/shared/ dùng chung (trạm, trụ, bản đồ, tài khoản)
  services/               api.js (mọi request), csms.js (endpoint), realtime.js (polling, sẽ đổi sang SSE)
  styles/                 tokens.css, themes.css (sáng/tối), layout.css, components.css
  vendor/leaflet/         thư viện bản đồ (MIT), không dùng CDN
docs/OPERATIONS.md        sổ tay vận hành: build, chạy, dừng, DB, staging
docs/SPRINT_STATUS.md     tình trạng dự án và sprint đầy đủ
docs/design/              đặc tả giao diện đã duyệt, ảnh tham chiếu, ảnh chụp hiện có
docs/spikes/              spike (K-01 có mã chạy lại được trong k01/)
docs/testing/, docs/stories/, docs/integration/   hồ sơ QA
render.yaml               blueprint staging trên Render
```

---

## 7. Tài liệu liên quan

- **Vận hành** (build, chạy, dừng, sao lưu, staging, biến môi trường): [`docs/OPERATIONS.md`](docs/OPERATIONS.md).
- **Tình trạng dự án và sprint**: [`docs/SPRINT_STATUS.md`](docs/SPRINT_STATUS.md).
- **Đóng góp code** (đặt tên nhánh, commit, review, Definition of Done): [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **Chi tiết backend** (API, phân quyền, khoá đăng nhập): [`backend/README.md`](backend/README.md).
- **Thiết kế giao diện**: [`docs/design/`](docs/design/) (đặc tả, ảnh chụp, các quyết định lệch đặc tả).
- **Spike OCPP**: [`docs/spikes/K-01-ocpp-simulator.md`](docs/spikes/K-01-ocpp-simulator.md).
- **Kiểm thử/QA**: `docs/README.md` (điểm vào), `docs/testing/`, `docs/stories/`.
- Backlog dự án: file ghim trong nhóm Zalo của Khối 8 — nguồn sự thật về phạm vi và AC.
- Jira: bảng **GYM** (Team-CodeGym).
