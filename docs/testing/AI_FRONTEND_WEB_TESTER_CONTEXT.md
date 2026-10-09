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
