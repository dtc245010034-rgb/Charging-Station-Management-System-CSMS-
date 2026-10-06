# CONTRIBUTING — Quy ước làm việc nhóm CSMS

> Áp dụng cho cả nhóm trong **Sprint 3**. Muốn đổi quy ước: nêu trong Daily hoặc Retrospective, rồi cập nhật mục này bằng một Pull Request.
>
> Hướng dẫn chạy và kiểm thử hệ thống: xem `README.md`.

## 1. Nguyên tắc chung

- **Nhánh `main`** là bản phát hành ổn định. **Nhánh `sprint-3`** là nhánh tích hợp chung cho mọi tính năng trong Sprint 3.
- **Không push trực tiếp vào `main` hay `sprint-3`**, mọi thay đổi tính năng đều đi qua Pull Request (PR) nhắm vào nhánh `sprint-3`.
- **Quy trình đóng Sprint**: Khi hết hạn Sprint 3, đội ngũ kiểm thử (QA) và nhóm sẽ tiến hành kiểm thử hồi quy toàn diện trên `sprint-3` (chạy test suites, kiểm tra migration, mô phỏng tải). Khi Sprint 3 chạy ổn định và đạt chuẩn Definition of Done (DoD), nhóm mới tạo PR gộp từ `sprint-3` vào `main`.
- Một việc trên Jira = một nhánh = một PR. Việc lớn thì tách nhỏ, PR nhỏ thì review nhanh.
- Luôn ghi mã Jira (ví dụ `GYM-19`) vào tên nhánh, commit và tiêu đề PR để truy vết được.
- **Không commit bí mật**: mật khẩu, khoá API, chuỗi kết nối cơ sở dữ liệu, file `.env`. Đọc từ biến môi trường và chỉ commit file mẫu `.env.example`.

## 2. Đặt tên nhánh

Cú pháp: `<tên>/<MÃ-JIRA>-<mô-tả-ngắn>`

Quy tắc: `<tên>` là tiền tố cố định của bạn (bảng dưới); chữ thường, không dấu tiếng Việt, nối các từ bằng dấu gạch ngang, mô tả tối đa khoảng 5 từ, mã Jira giữ chữ hoa. Mỗi thẻ Jira một nhánh mới tạo từ `sprint-3`.

Ví dụ đúng:

```
lam/GYM-19-form-tao-tram
kien/GYM-25-loi-khoa-dang-nhap
phuc/GYM-13-quy-uoc-lam-viec
```

Ví dụ sai: `lam` (không gắn thẻ Jira), `lam/tao-tram` (thiếu mã Jira), `feature/GYM-19-form` (thiếu tên), `Lâm/GYM-19` (có dấu).

| Thành viên | Tiền tố |
|---|---|
| Nguyễn Anh Phúc | `phuc/` |
| Nguyễn Văn Hữu | `huu/` |
| Sầm Nông Anh Khoa | `khoa/` |
| Dương Trung Kiên | `kien/` |
| Phạm Quang Anh | `quanganh/` |
| Lý Ngọc Lâm | `lam/` |
| Dương Công Lộc | `loc/` |
| Lồ Đức Minh | `minh/` |
| Nguyễn Hà Nam | `nam/` |

## 3. Viết commit

Cú pháp: `<type>(<phạm vi>): <mô tả ngắn> [MÃ-JIRA]`

| Type | Ý nghĩa |
|---|---|
| `feat` | Thêm chức năng |
| `fix` | Sửa lỗi |
| `docs` | Thay đổi tài liệu |
| `refactor` | Viết lại code, không đổi hành vi |
| `test` | Thêm hoặc sửa test |
| `chore` | Cấu hình, thư viện, việc lặt vặt |

Phạm vi là tuỳ chọn, ví dụ: `auth`, `station`, `charge-point`, `db`, `ui`, `readme`.

Quy tắc:

- Mô tả viết tiếng Việt, bắt đầu bằng động từ (thêm, sửa, xoá, đổi), tối đa 72 ký tự, không có dấu chấm cuối.
- Một commit là một thay đổi có ý nghĩa. Commit thường xuyên, không dồn cả ngày làm việc vào một commit.

Ví dụ đúng:

```
feat(station): thêm form tạo trạm sạc [GYM-19]
fix(auth): sửa lỗi không khoá đăng nhập sau 5 lần sai [GYM-16]
docs(readme): thêm quy ước làm việc [GYM-13]
```

Ví dụ sai: `update`, `fix bug`, `done`, `abc`, `sửa nhiều thứ`.

## 4. Quy trình làm một việc và mở Pull Request

1. Trên Jira, kéo thẻ sang **In Progress** và gán tên mình.
2. Cập nhật nhánh `sprint-3` rồi tạo nhánh tính năng mới:

   ```
   git checkout sprint-3
   git pull origin sprint-3
   git checkout -b lam/GYM-19-form-tao-tram
   ```

3. Làm việc và commit theo quy ước ở mục 3.
4. Trước khi mở PR, lấy code mới nhất của `sprint-3` về nhánh của mình, tự xử lý xung đột nếu có, chạy thử ứng dụng trên máy và tự xem lại phần thay đổi:

   ```
   git fetch origin
   git merge origin/sprint-3
   ```

5. Đẩy nhánh và mở PR vào `sprint-3` trên GitHub (**chọn base branch là `sprint-3`**, không trỏ vào `main`):

   ```
   git push -u origin lam/GYM-19-form-tao-tram
   ```

   Tiêu đề PR: `[GYM-19] Thêm form tạo trạm sạc`. Điền đầy đủ mẫu PR và chọn reviewer (mục 5).
6. Sửa theo góp ý của reviewer, đẩy commit mới lên cùng nhánh.
7. Khi đã có approve: tác giả bấm **Squash and merge** vào `sprint-3`, xoá nhánh tính năng, rồi chuyển thẻ Jira sang **Done**.

   **PR xếp chồng** (PR B dựa trên nhánh của PR A vì cần code của A): luôn mở PR vào `sprint-3`, không merge vào nhánh của PR khác. Khi PR A đã vào `sprint-3`, cập nhật PR B: `git fetch origin && git merge origin/sprint-3`, đổi base của PR B về `sprint-3` nếu cần, rồi mới nhờ review.

8. **Quy trình đóng Sprint và merge vào `main`:**
   - Khi hết hạn Sprint 3, toàn bộ tính năng đã được gộp vào `sprint-3`.
   - Đội ngũ QA và nhóm tiến hành kiểm thử hồi quy toàn diện trên `sprint-3` (chạy toàn bộ test suites `python test.py`, kiểm tra migration cơ sở dữ liệu tiến/lùi, chạy mô phỏng tải `tools/simulate-fleet.js`).
   - Khi hệ thống chạy ổn định và đạt toàn bộ tiêu chí Definition of Done (DoD), nhóm mới tạo Pull Request gộp từ `sprint-3` vào `main`.

## 5. Ai review và review thế nào

- Mỗi PR cần **ít nhất 1 approve từ một thành viên khác** (không phải tác giả), theo Definition of Done.
- Tác giả chọn reviewer, xoay vòng giữa các thành viên, ưu tiên người hiểu phần việc đó. PR đụng tới cấu trúc cơ sở dữ liệu (migration) hoặc phân quyền thì thêm **trưởng dev** làm reviewer.
- Reviewer phản hồi **trong ngày làm việc**. Ai đang chờ review của ai thì nêu trong Daily, Scrum Master theo dõi.
- PR phải có check **CI xanh** mới merge được (các nhánh chính có ruleset chặn). CI đỏ thì tác giả sửa, không nhờ người có quyền bỏ qua.
- Reviewer vẫn **tự chạy thử chức năng** theo AC trên máy mình; CI chỉ thay phần chạy lint + test (`python test.py`).
- Reviewer kiểm tra: code chạy đúng tiêu chí chấp nhận (AC) của việc trên Jira, không có bí mật, tên nhánh và commit đúng quy ước, code dễ đọc.
- Góp ý tập trung vào code, không nhắm vào người viết. Nêu rõ, mang tính xây dựng, và phân biệt "cần sửa" với "gợi ý".
- Không tự merge khi chưa có approve. Xung đột merge do tác giả tự xử lý, cần giúp thì hỏi trên nhóm chat.

## 6. Việc phải đạt trước khi coi là xong

Trích từ Definition of Done của dự án, phần liên quan tới code:

- Đã được ít nhất 1 thành viên khác review và approve.
- Có test cho logic mới, gồm test nghiệm thu `tests/acceptance/S-xx.*.test.js` theo từng AC; check CI trên PR xanh.
- Không có bí mật trong mã nguồn.
- README được cập nhật nếu đổi cách chạy hoặc thêm biến môi trường.
