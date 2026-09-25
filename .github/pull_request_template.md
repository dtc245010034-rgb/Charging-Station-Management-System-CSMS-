## Mô tả

<!-- Làm gì và vì sao. Ngắn gọn, 2 đến 3 câu. -->

## Việc Jira

<!-- Ví dụ: GYM-19 -->

## Cách kiểm tra

<!-- Các bước để reviewer tự chạy và thấy kết quả đúng -->

1.
2.

## Ảnh chụp hoặc kết quả

<!-- Nếu có thay đổi giao diện thì dán ảnh vào đây -->

## Checklist

- [ ] Tên nhánh và commit đúng quy ước trong README
- [ ] Đã chạy `npm run lint && npm test` trên máy trước khi push; check CI trên PR xanh
- [ ] Có test nghiệm thu cho từng AC của story (`tests/acceptance/S-xx.*.test.js`)
- [ ] Đã tự xem lại phần thay đổi
- [ ] Không có bí mật (mật khẩu, khoá API, file `.env`) trong code
- [ ] Đã cập nhật README nếu đổi cách chạy hoặc thêm biến môi trường
- [ ] Đã chọn ít nhất 1 reviewer (thêm trưởng dev nếu đụng migration hoặc phân quyền)