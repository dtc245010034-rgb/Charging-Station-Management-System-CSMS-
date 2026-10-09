# NGỮ CẢNH AI KIỂM THỬ FRONTEND + TẦNG WEB — CSMS

> File bổ sung cho `AI_TESTER_AUDITOR_CONTEXT.md` (đã phủ backend, OCPP, DB, phân quyền theo từng story).
> File này phủ **phần còn thiếu**: giao diện chạy trong trình duyệt và tầng web (header, CSP, CORS, cookie, lỗi, tệp tĩnh, phụ thuộc).
> Đọc cả hai file. Khi mâu thuẫn: nguyên tắc cứng, ranh giới ghi file, chuẩn bằng chứng và mẫu báo cáo của file chính **vẫn áp dụng nguyên vẹn**. Lưu bản này tại `docs/testing/AI_FRONTEND_WEB_TESTER_CONTEXT.md`.

---

## 1. Vai trò và phạm vi

Bạn kiểm thử + audit **mọi thứ người dùng thấy và mọi thứ trình duyệt nhận từ máy chủ**. Frontend của CSMS là **JavaScript thuần** (không framework) nên không có lớp tự thoát ký tự như React; mọi chỗ gán `innerHTML`, `insertAdjacentHTML`, `document.write`, `outerHTML`, `setAttribute('on…')`, `href`/`src` lấy từ dữ liệu đều là nghi phạm cho tới khi chứng minh an toàn.

Phạm vi (không trùng file chính):
1. **Hành vi giao diện** theo AC: form, ô nhập, thông báo lỗi, nút, trạng thái chờ, điều hướng theo vai trò.
2. **Bảo mật phía trình duyệt:** XSS (lưu trữ/phản chiếu/DOM), CSRF từ góc trình duyệt, lưu trữ phía client, clickjacking, mở chuyển hướng.
3. **Kênh đẩy SSE trong trình duyệt:** nối lại, tải lại đầy đủ, rò dữ liệu, hết phiên.
4. **Tầng web phía máy chủ:** header bảo mật, CSP, CORS, cookie, trang lỗi, tệp tĩnh, thông tin lộ ra.
5. **Khả dụng:** nhãn chữ kèm màu, bàn phím, đọc màn hình, responsive (360px, xoay ngang cho các màn hình di động).
6. **Chuỗi cung ứng:** thư viện phía client/server, `npm audit`, tệp thừa trong thư mục tĩnh.

Nếu một lỗi frontend thực chất do backend (API không kiểm tra) thì ghi lỗi ở backend và **dẫn chiếu**; nếu chỉ giao diện chặn mà máy chủ không chặn thì **đó là lỗi backend, không phải "đã có kiểm tra ở form"**.

## 2. Quy tắc riêng

1. **Phải chạy trình duyệt thật** khi có thể (Playwright/Puppeteer headless, hoặc trình duyệt điều khiển được). Đọc code JS **không đủ** để kết luận hành vi giao diện. Không có công cụ trình duyệt → ghi `BLOCKED` cho mọi ca cần tương tác, chỉ làm được phần `ĐỌC CODE` + gọi API bằng `curl`, và nói rõ.
2. **Mọi ca kiểm tra ở form đều phải thử lại bằng cách gửi thẳng API** (bỏ qua giao diện). Giao diện chỉ là tiện lợi, máy chủ mới là nơi quyết.
3. **Chụp bằng chứng:** ảnh chụp màn hình (đặt trong `docs/testing/results/evidence/`), đoạn DOM, tab Network (yêu cầu/đáp ứng, header), lỗi Console. Che mọi secret/mã thẻ/mật khẩu trong ảnh.
4. **Tài khoản thử:** dùng tài khoản seed cục bộ (tài xế, chủ trạm A, chủ trạm B, vận hành viên, kế toán, quản trị). Không dùng tài khoản thật. Không thử trên Render/ngrok.
5. **Payload XSS chỉ có tác dụng chứng minh** (ví dụ ghi vào `window.__xss_probe`, không đánh cắp, không gọi ra ngoài). Dùng nhiều ngữ cảnh: văn bản, thuộc tính (có/không nháy), URL, `<script>`, `<img onerror>`, SVG, `javascript:`.
6. Quy ước ID: lỗi giao diện `BUG-Sxx-FEnn`, lỗ hổng `VULN-Sxx-FEnn`, lỗi tầng web `WEB-nn` (hoặc theo quy ước repo nếu đã có).
7. Không sửa code. Không sửa `docs` không phải của chủ dự án.

## 3. Pha 0 — Khảo sát frontend

1. Tìm thư mục frontend, cách phục vụ (Express static? thư mục nào?), danh sách trang/route giao diện, các file JS/CSS/HTML. **Không đoán đường dẫn — liệt kê thật.**
2. Lập **bảng sink**: grep toàn bộ frontend theo `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, `setTimeout("…")`, `location =`, `location.href`, `window.open`, `postMessage`, `localStorage`, `sessionStorage`, `document.cookie`, `EventSource`, `fetch`. Ghi từng chỗ: dữ liệu vào từ đâu, có thoát ký tự không.
3. Lập **bảng nguồn dữ liệu không tin cậy** hiển thị lên màn hình: tên/địa chỉ trạm (chủ trạm nhập), mã trụ (chủ trạm nhập), vendor/model/firmware (**do trụ gửi qua OCPP**), `errorCode`/`vendorErrorCode`/`info` (trụ gửi), thông báo lỗi từ máy chủ, tên người dùng/email, lý do đóng phiên. Với mỗi nguồn: nó hiện ở màn hình nào?
4. Liệt kê header phản hồi thật của ứng dụng (`curl -i`) cho: trang HTML, API JSON, tệp tĩnh, SSE, trang 404/500.
5. Xác định cookie phiên: tên, cờ, phạm vi, hạn (`curl -i` sau đăng nhập).

## 4. Kiểm thử theo màn hình (tương ứng story đã làm)

> Mỗi mục: **Kiểm** (hành vi) và **Soi** (bảo mật/độ bền). Danh sách tối thiểu — nghĩ thêm.

### 4.1 Đăng nhập (S-02) — T-05 là mẫu bố cục mọi form
- Kiểm: đăng nhập đúng → chuyển về trang chính **đúng theo từng vai trò** (thử cả 5 vai trò); sai → thông báo chung "email hoặc mật khẩu không đúng"; sai 5 lần → thông báo khoá hiển thị rõ cho lần 6 (kể cả nhập đúng); phiên hết hạn khi gọi API → về trang đăng nhập (không để màn hình trắng/treo).
- Soi: thông báo lỗi trên giao diện có **khác nhau giữa "email không tồn tại" và "sai mật khẩu"** không (xem cả chữ, thời gian, thay đổi DOM); thông báo khoá có lộ thời gian còn lại/tài khoản tồn tại; mật khẩu có lọt vào URL/lịch sử/`localStorage`; `autocomplete`, `type=password`; nút gửi bị vô hiệu khi đang gửi; Enter gửi form; sau đăng xuất bấm nút Back có xem lại được trang đã đăng nhập không (cache); **chuyển hướng sau đăng nhập** (`?next=`/`redirect=`) có cho trỏ ra miền ngoài không (open redirect); nội dung trang có thể bị nhúng `iframe` không (clickjacking).

### 4.2 Danh sách và form trạm (S-04, T-09)
- Kiểm: tạo/sửa/xem danh sách chạy; **lỗi nhập liệu hiện tại ô sai** (toạ độ ngoài dải, tên rỗng); nút lưu **vô hiệu trong lúc gửi**; sửa xong danh sách đổi ngay; chủ trạm chỉ thấy trạm của mình.
- Soi: **XSS lưu trữ** qua tên/địa chỉ trạm (thử mọi ngữ cảnh ở mục 2.5, ở danh sách, trang chi tiết, tiêu đề trang, tooltip, thông báo xác nhận); toạ độ nhập kiểu `1,5`/`1e3`/`NaN`/khoảng trắng — giao diện báo gì; **bấm lưu hai lần bằng hai tab/F5 lại yêu cầu** (không chỉ bấm đúp); mất mạng giữa lúc gửi thì giao diện có cho gửi lại không và có tạo trùng không; dữ liệu cũ hiển thị sau khi sửa ở tab khác; thao tác trên trạm của chủ khác bằng cách đổi ID trong URL giao diện.

### 4.3 Form thêm trụ (S-05, T-11)
- Kiểm: rời ô mã trụ → gọi API kiểm trùng → ô **báo đỏ trước khi bấm lưu**; số đầu nối 1–4; gửi thẳng API với mã trùng vẫn bị máy chủ từ chối.
- Soi: **điều kiện đua** (kiểm trùng xong → người khác tạo mã đó → bấm lưu: giao diện báo gì); gọi API kiểm trùng **mỗi lần rời ô** có thể bị dùng để **dò mã trụ đã tồn tại của chủ khác** (liệt kê mã toàn hệ thống) — đây là rủi ro lộ thông tin có chủ đích của yêu cầu "mã unique toàn hệ thống", ghi **GAP/OBS** cho PO; phản hồi chậm/lỗi 500 từ API kiểm trùng có làm ô kẹt trạng thái "đang kiểm" không; kết quả cũ về muộn ghi đè kết quả mới (gõ nhanh nhiều lần); mã chứa ký tự đặc biệt/khoảng trắng/Unicode giống nhau; độ dài.

### 4.4 Màn hình theo dõi + SSE (S-11, T-24, T-25)
- Kiểm: 20 trụ trên một màn hình máy tính **không cuộn ngang**; trạng thái phân biệt **bằng nhãn chữ chứ không chỉ màu** (thử bộ lọc mô phỏng mù màu hoặc chuyển ảnh xám); trụ ngoại tuyến hiện thời điểm liên lạc cuối; đổi trạng thái đầu nối → màn hình đổi < 1 giây không tải lại; **tắt rồi bật lại máy chủ** → màn hình tự khôi phục, **tải lại đầy đủ** (không chỉ nhận sự kiện mới); chủ trạm chỉ thấy trụ mình.
- Soi: **rò dữ liệu SSE** — mở hai trình duyệt (chủ trạm A, chủ trạm B) và một vận hành viên, gây sự kiện ở trạm A, quan sát tab Network/`EventSource` của B (dữ liệu **trong luồng**, không chỉ trên màn hình); sau **đăng xuất / hết hạn phiên / đổi vai trò** ở tab khác, luồng SSE còn mở và còn nhận dữ liệu không; nối lại tự động có **bão nối lại** (không giãn cách → tự DoS máy chủ) không; rò listener/bộ nhớ khi chuyển trang nhiều lần (đếm kết nối SSE phía máy chủ sau khi đóng tab); sự kiện tới **không đúng thứ tự** hoặc tới trước lúc tải đầy đủ xong (trạng thái cũ ghi đè mới); dữ liệu do trụ gửi (vendor/model/firmware/`errorCode`) hiển thị có bị XSS không — **đây là điểm tấn công thực tế nhất** vì kẻ lạ nối được trụ giả (B5); 20 → 50 trụ có giật/đơ giao diện không; tab ở chế độ nền lâu rồi quay lại.

### 4.5 Nút khởi động lại trụ (S-16, T-35)
- Kiểm: chỉ **vận hành viên và quản trị** thấy nút (thử 5 vai trò, kiểm cả **DOM** chứ không chỉ mắt nhìn: nút bị ẩn bằng CSS nhưng vẫn có trong DOM/có gọi được?); hộp chọn mềm/cứng; trụ ngoại tuyến → thông báo ngay; chờ → hết thời gian hiện lỗi; ô trụ chuyển ngoại tuyến → trực tuyến sau khi reset.
- Soi: **CSRF thực tế** — dựng một trang HTML cục bộ ở miền khác gửi `POST` tới API reset trong lúc đang đăng nhập (`SameSite`, kiểm `Origin`/token) và ghi kết quả; xác nhận trước khi thực hiện lệnh phá hoại (bấm nhầm); bấm nhiều lần liên tiếp có gửi nhiều lệnh không (nút vô hiệu trong lúc chờ); người dùng không đủ quyền gọi thẳng API (đã thuộc file chính, ở đây chỉ **đối chiếu**: giao diện ẩn nút ≠ có quyền).

### 4.6 Màn hình chưa có ở S-01…S-20 nhưng sẽ tới (khi story xong thì kiểm theo cùng mẫu)
S-22 (phiên đang sạc, **360px**, xoay ngang, kWh tăng trong 2 giây), S-23/T-50 (nút dừng, ba thông báo khác nhau), S-24/T-52 (nút bắt đầu sạc, chờ 60 giây, nút vô hiệu), S-25/T-54 (danh sách phiên bất thường, đóng tay bắt buộc lý do), S-27/T-58 (nhật ký, ba bộ lọc, phân trang 50 dòng). Nếu code đã có ở nhánh hiện tại thì kiểm luôn.

## 5. Lăng kính xuyên suốt cho frontend (áp cho mọi màn hình)

1. **XSS**: bảng sink ở Pha 0 là danh mục việc cần làm — mỗi sink có một ca thử với payload ở mọi ngữ cảnh; kết luận dựa trên **kết quả thực chạy trong trình duyệt**.
2. **Nội dung phản chiếu**: tham số URL/hash/query có được in lại vào trang không.
3. **Lưu trữ phía client**: gì nằm trong `localStorage`/`sessionStorage`/cookie không-HttpOnly (token, vai trò, thông tin cá nhân)? **Vai trò lưu ở client chỉ để hiển thị — nếu có logic quyền dựa vào nó thì ghi lỗi.** Sửa giá trị đó trong DevTools thì mở được gì (chỉ giao diện, hay cả dữ liệu)?
4. **Quyền trên giao diện ≠ quyền thật**: với mỗi nút/menu/trang bị ẩn theo vai trò, thử vào thẳng đường dẫn giao diện và gọi thẳng API bằng vai trò thấp.
5. **Xử lý lỗi API**: 401 (về đăng nhập), 403 (thông báo, không trắng trang), 404, 409, 429, 500, mạng đứt, phản hồi không phải JSON, phản hồi chậm 30 giây — giao diện có treo/nuốt lỗi/hiện thông điệp kỹ thuật lộ chi tiết (stack trace, SQL) không.
6. **Trạng thái chờ và chống gửi lặp**: mọi nút gây thay đổi dữ liệu có vô hiệu trong lúc chờ **và** máy chủ có chống lặp độc lập không.
7. **Tính toàn vẹn dữ liệu hiển thị**: giá trị số (kWh, toạ độ, thời gian) định dạng đúng, không làm tròn sai, múi giờ hiển thị đúng (máy chủ UTC vs hiển thị địa phương Việt Nam), không hiện `null`/`undefined`/`NaN`.
8. **Khả dụng**: tab được bằng bàn phím và thứ tự hợp lý; focus nhìn thấy; nhãn cho ô nhập (`label`/`aria-label`); thông báo lỗi có `aria-live`/gắn với ô; tương phản màu; **không chỉ dùng màu** để truyền trạng thái; 360px không cuộn ngang; phóng to 200%.
9. **Hiệu năng**: thời gian tải trang; số yêu cầu; kích thước JS; danh sách 50 trụ/200 đầu nối vẽ lại toàn bộ mỗi lần có sự kiện (giật) hay cập nhật cục bộ.
10. **Tương thích**: tối thiểu Chrome và Firefox (và Safari nếu có); điện thoại ở 360px.

## 6. Tầng web phía máy chủ (không thuộc một story, kiểm một lần rồi hồi quy)

Ghi kết quả vào `docs/Audit/` (tầng web là việc audit) và dẫn chiếu từ `docs/testing/`.

1. **Header bảo mật** trên trang HTML và API: `Content-Security-Policy` (không `unsafe-inline`/`unsafe-eval` nếu tránh được; nguồn script/connect chặt), `X-Content-Type-Options: nosniff`, `X-Frame-Options` hoặc `frame-ancestors`, `Referrer-Policy`, `Strict-Transport-Security` (production), `Permissions-Policy`; kiểm có dùng `helmet` hay tự đặt và **header nào thiếu**.
2. **Cookie phiên:** `HttpOnly`, `Secure` (production — nhớ rằng chỉ bật khi `NODE_ENV=production`, nên ngrok/local khác Render), `SameSite`, `Path`, hạn; cookie còn hiệu lực sau đăng xuất không; cố định phiên (session fixation).
3. **CORS:** `Access-Control-Allow-Origin` có phản chiếu bất kỳ `Origin`, có `*` kèm credentials không; preflight; biến `APP_ORIGIN` có thật sự được dùng để chặn không.
4. **CSRF:** mọi phương thức thay đổi dữ liệu (POST/PUT/PATCH/DELETE) có cơ chế gì (SameSite/Origin/token); thử từ trang miền khác.
5. **Giới hạn tốc độ:** đăng nhập, API kiểm trùng mã trụ, API reset, các route ghi — có giới hạn theo IP/tài khoản không; header IP lấy từ đâu (`TRUST_PROXY`).
6. **Xử lý lỗi:** trang 404/500, lỗi JSON hỏng, thân quá lớn, `Content-Type` sai — có lộ stack trace, đường dẫn máy chủ, phiên bản, câu SQL không; `X-Powered-By` còn không; chế độ production vs dev khác biệt thế nào.
7. **Tệp tĩnh:** thư mục được phục vụ có chứa thứ không nên (`.env`, `.git`, `docker-compose.yml`, file sao lưu, bản đồ nguồn `.map`, tài liệu nội bộ, `node_modules`)? **Duyệt đường dẫn** (`../`, `%2e%2e`, `%5c`) có thoát ra ngoài thư mục tĩnh không; liệt kê thư mục có bật không; phân biệt hoa/thường.
8. **Giới hạn kích thước/thời gian:** thân yêu cầu JSON lớn, header lớn, kết nối chậm (slowloris), số kết nối SSE tối đa.
9. **HTTP method:** `TRACE`/`OPTIONS`/`HEAD` hành xử thế nào; `PUT/DELETE` trên route chỉ khai `GET` trả 405 hay lọt; (S-27 yêu cầu sửa/xoá nhật ký trả **405** — kiểm khi đã làm).
10. **Phụ thuộc:** `npm audit` (cả `backend` và frontend nếu có `package.json` riêng), phiên bản Node/Express/ws/pg; thư viện nạp từ CDN có ghim phiên bản/`integrity` không; file `package-lock.json` có trong repo không; gói không dùng.
11. **Bí mật & cấu hình trong repo công khai:** quét `.env*`, `render.yaml`, `run.py`, `docker-compose.yml`, `README` tìm giá trị mặc định nguy hiểm (JWT secret mặc định, mật khẩu admin cố định); `run.py` tạo mật khẩu admin ngẫu nhiên — mật khẩu đó **in ra đâu** (log/terminal/file)?
12. **Khác biệt môi trường:** cùng một hành vi trên local, Docker, Render (`TRUST_PROXY=2`), ngrok (`TRUST_PROXY=1`): cờ `Secure`, IP, HTTPS, WebSocket `ws`/`wss`, độ dài kết nối SSE qua proxy (proxy có cắt kết nối rảnh sau X giây không → ảnh hưởng nối lại).

## 7. Quy trình mỗi lần được gọi

1. **Pha 0** (mục 3) + Pha 0 của file chính (nhánh, commit, đọc quy ước, đường cơ sở test).
