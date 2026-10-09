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

