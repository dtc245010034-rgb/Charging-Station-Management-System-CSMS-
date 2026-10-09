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

