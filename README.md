# CSMS · Nền tảng vận hành trạm sạc xe điện

Đồ án Thực tập cơ sở ICTU × CodeGym · nhóm **TTCS_T926_K8S4_N3** · PO: Mentor Lê Đình Tuấn · dự án 21/9 – 26/10/2026.

**Product Goal:** Đơn vị vận hành nắm được mọi phiên sạc theo thời gian thực qua OCPP 1.6J, tính đúng tiền theo biểu giá nhiều khung giờ, không để trạm vượt công suất, và đối soát doanh thu khớp với số kWh đã cấp.

> **Ràng buộc:** thanh toán chỉ chạy môi trường sandbox. Vị trí và lịch sử di chuyển của tài xế là dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP.

Muốn biết hệ thống đang làm được đến đâu (theo Sprint/Jira) trước khi chạy? Xem mục 5. Muốn đóng góp code? Xem `CONTRIBUTING.md`. Còn không, bắt đầu ngay dưới đây.

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
docker compose down          # dừng container, GIỮ dữ liệu (volume postgres_data)
docker compose down -v       # dừng và XOÁ luôn dữ liệu — dùng khi muốn làm lại từ đầu
```

---

## 2. Dùng thử hệ thống

| Vai trò | Mã | Trang chủ sau đăng nhập | Làm được gì lúc này |
|---|---|---|---|
| Quản trị | `ADMIN` | `/pages/admin.html` | Tạo tài khoản mọi vai trò (qua API), xem và sửa mọi trạm, trụ |
| Chủ trạm | `STATION_OWNER` | `/pages/station-owner.html` | Tạo, sửa, xem **trạm và trụ của mình** (qua API; giao diện đang làm) |
| Vận hành viên | `OPERATOR` | `/pages/operator.html` | Xem mọi trạm, trụ; không sửa được |
| Kế toán | `ACCOUNTANT` | `/pages/accountant.html` | Chưa có chức năng (từ sprint tính tiền) |
| Tài xế | `DRIVER` | `/pages/driver.html` | Tự đăng ký, đăng nhập; chưa có chức năng sạc |

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

### Kịch bản dùng thử nhanh (thay cho giao diện chưa có)

```
# Chủ trạm đăng nhập rồi tạo trạm
curl -c owner.cookie -X POST http://localhost:3000/api/auth/login -H "content-type: application/json" -d "{\"email\":\"owner@csms.local\",\"password\":\"MatKhau#12345\"}"
curl -b owner.cookie -X POST http://localhost:3000/api/stations -H "content-type: application/json" -H "Idempotency-Key: demo-tram-001" -d "{\"name\":\"Tram ICTU\",\"address\":\"Thai Nguyen\",\"latitude\":21.59,\"longitude\":105.84}"

# Xem danh sách trạm của mình
curl -b owner.cookie http://localhost:3000/api/stations
```

> `POST /api/stations` bắt buộc header `Idempotency-Key` (chuỗi 8-128 ký tự, tự đặt, dùng để chống bấm lưu hai lần tạo hai trạm) — thiếu header này bị 400.

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
# tests 127
# pass 127
# fail 0
```

`# fail 0` là điều kiện để merge — CI trên mỗi Pull Request chạy đúng `npm run lint && npm test`, PR đỏ thì không merge được.

Ca kiểm thử và báo cáo QA: `docs/testing/`, `docs/stories/S-xx.md`.

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
| `npm test` chạy hết cả 127 test dù chỉ muốn 1 file | `npm test -- <file>` không lọc được vì script cố định chạy cả thư mục `tests/`. Gọi thẳng `node --test <file>` (xem mục 3) |

---

## 5. Tổng quan hệ thống

*Cập nhật: 27/9/2026, đang ở Sprint 1. Trạng thái Done chính thức theo Jira (bảng GYM) và Definition of Done.*

### Đã có trên `main`

| Chức năng | Story | Ghi chú |
|---|---|---|
| Khung dự án: Docker Compose, PostgreSQL, migration tiến/lùi, test, lint | S-01 | Chạy trên máy cá nhân; CI (GitHub Actions) chạy lint + test cho mọi PR, **chưa có staging** |
| Đăng nhập email + mật khẩu, khoá 15 phút sau 5 lần sai, đếm theo tài khoản và theo IP | S-02 | Không tiết lộ email có tồn tại hay không |
| Đăng ký công khai (luôn là tài khoản Tài xế); Quản trị tạo tài khoản các vai trò khác | S-02 | Tạo qua API, chưa có giao diện quản trị |
| 5 vai trò, mỗi vai trò có trang chủ riêng sau đăng nhập | S-02, S-03 | Trang chủ hiện mới có lời chào |
| Phân quyền: route chưa khai quyền bị chặn mặc định; chủ trạm chỉ thấy trạm của mình; truy cập trái phép trả 403 và ghi nhật ký | S-03 | |
| API trạm, trụ sạc (tạo, sửa, xem) có lọc theo chủ sở hữu; toạ độ + tên/địa chỉ bắt buộc và được kiểm; chống bấm lưu hai lần qua `Idempotency-Key` bắt buộc; mã trụ luôn lưu chữ hoa (khớp OCPP); `power_kw`/`status` của trụ được kiểm, `status` do hệ thống quản lý | S-04, S-05 | S-04 đạt đủ AC. S-05 đạt AC1, AC2; **AC3 (chặn đổi mã khi có phiên sạc) hoãn sang Sprint 3** — chưa có bảng phiên sạc, xem `docs/spikes/S-05-AC3-ghi-nhan-cho-PO.md` |
| Spike K-01: trụ sạc ảo nối OCPP 1.6J qua WebSocket, bản ghi chuỗi tin nhắn thật | K-01 | Xem `docs/spikes/K-01-ocpp-simulator.md`; máy chủ mới hỗ trợ 4/7 loại bản tin (`StartTransaction`/`MeterValues`/`StopTransaction` thuộc Sprint 3); WebSocket chưa xác thực mã trụ (thuộc S-06) |

### Đang làm trong Sprint 1 (demo Thứ 4, 30/9)

- **S-04, S-05:** màn hình quản lý trạm, trụ và đầu nối (giao diện — chưa kiểm lại trên trình duyệt sau khi API đổi hợp đồng ở trên).

### Chưa có (theo lộ trình backlog)

| Sprint | Mục tiêu |
|---|---|
| 2 | Trụ ảo nối vào hệ thống được xác thực; vận hành viên thấy đúng trạng thái mọi trụ kể cả khi kết nối chập chờn |
| 3 | Một phiên sạc chạy trọn vẹn từ cắm tới rút với số kWh đúng, dù trụ mất kết nối giữa chừng |
| 4 | Tính tiền đúng theo biểu giá nhiều khung giờ, tài xế đọc được vì sao ra số tiền đó |
| 5 | Nạp ví (sandbox), tự trừ tiền khi sạc xong, số dư không sai một đồng |
| 6 | Phân bổ công suất: trạm không bao giờ vượt hạn mức |
| 7 | Tìm trạm trống và đặt chỗ |
| 8 | Đối soát doanh thu khớp kWh, chia cho từng đối tác |

> ⚠️ Backlog có 8 sprint nhưng dự án chỉ có 4 tuần làm việc. Phạm vi thực tế tới 26/10 do PO chốt; bảng trên là lộ trình, không phải cam kết.

---

## 6. Cấu trúc thư mục

```
backend/
  src/modules/<miền>/     routes (khai quyền, kiểm đầu vào) → service (nghiệp vụ) → repository (SQL)
  src/security/           ma trận quyền (permissions.js), chặn route chưa khai quyền (routeGuard.js)
  migrations/             NNN_ten.sql + NNN_ten.down.sql — đã merge thì không sửa, muốn đổi thì thêm file mới
  tests/                  unit/ integration/ acceptance/ (một file cho mỗi story, tên test theo AC)
  scripts/create-admin.js
frontend/                 HTML/CSS/JS thuần, ES modules; mọi request đi qua js/api.js
docs/testing/             kế hoạch, ca kiểm thử, báo cáo lỗi của QA
docs/stories/             hồ sơ nghiệm thu từng story (S-xx.md), đối chiếu AC với bằng chứng chạy thật
docs/spikes/              spike Sprint 1 (mã dùng một lần + tài liệu, không phải sản phẩm)
```

---

## 7. Tài liệu liên quan

- Đóng góp code (đặt tên nhánh, commit, review, Definition of Done): `CONTRIBUTING.md`.
- Chi tiết backend (API, phân quyền, khoá đăng nhập): `backend/README.md`.
- Kiểm thử: `docs/testing/`, `docs/stories/`.
- Backlog dự án: file ghim trong nhóm Zalo của Khối 8 — nguồn sự thật về phạm vi và AC.
- Jira: bảng **GYM** (Team-CodeGym).
