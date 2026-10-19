# AGENTS.md — Luật cho AI agent làm việc trong repo CSMS

> Áp dụng cho mọi AI agent (Antigravity CLI, Copilot, Claude...). Người dùng chịu trách nhiệm về mọi thay đổi do AI tạo ra.
> Quy ước nhóm đầy đủ: `CONTRIBUTING.md`. Bản đồ tài liệu: `docs/README.md`.
> Vai trò kiểm thử/audit độc lập có ngữ cảnh riêng: `docs/testing/AI_TESTER_AUDITOR_CONTEXT.md` (chỉ đọc khi được giao việc đó).

## 1. Dự án

- CSMS: nền tảng vận hành trạm sạc xe điện (OCPP 1.6J). Dự án thực tập ICTU × CodeGym.
- Stack: Node.js >= 22.7, Express, frontend JS thuần (`frontend/`, không build), PostgreSQL 16 (`pg`), WebSocket `ws`, SSE, JWT cookie HttpOnly, Argon2id, `zod`.
- Cấu trúc: `backend/src`, `backend/migrations` (SQL đánh số, có `.down.sql`), `backend/tests/{unit,integration,acceptance}`, `frontend/`, `tools/` (simulator, script kiểm chứng, Python), `docs/`.
- Phân quyền mặc định từ chối: `backend/src/security/permissions.js`, `backend/src/security/routeGuard.js`. Lọc theo sở hữu ở tầng truy vấn: `backend/src/db/scope.js`.
- Ràng buộc: thanh toán chỉ ở sandbox; tuân thủ Nghị định 13/2023 (dữ liệu cá nhân, vị trí GPS). Tiền là số nguyên đồng.
- Mục 3 là luật cứng. Không chắc thì dừng và hỏi, không đoán.

### Tài liệu nằm đâu (`docs/`)

| Cần | Đọc |
|---|---|
| Chạy, dừng, sao lưu, biến môi trường | `docs/guides/OPERATIONS.md` |
| Demo toàn dự án, kịch bản, checklist | `docs/demo/` (điểm vào `README.md`) |
| Trạng thái từng story, hợp đồng tính tiền, báo cáo bàn giao chặng | `docs/project/` |
| Thiết kế giao diện | `docs/design/` |
| Lịch sử (kế hoạch sprint cũ, spike). Không dùng làm nguồn trạng thái hiện tại | `docs/archive/` |

Đổi tên hoặc chuyển file tài liệu: chạy `node tools/check-docs.js` và sửa mọi đường dẫn trỏ tới file đó.

## 2. Lệnh chuẩn (đã đối chiếu với `backend/package.json`, `test.py`, `.github/workflows/ci.yml`)

| Việc | Lệnh |
|---|---|
| Lint + toàn bộ test như CI (cần Docker) | `python test.py` |
| Chỉ một nhóm | `python test.py --only unit` (hoặc `integration`, `acceptance`) |
| Một file test | `python test.py --file tests/acceptance/S-04.station-management.test.js` |
| Chỉ lint | `python test.py --lint-only` hoặc `npm run lint` (trong `backend/`) |
| Test không qua Docker | `npm test` trong `backend/`, cần `TEST_DATABASE_URL` trỏ DB có tên kết thúc bằng `_test` |
| Migration | `npm run migrate`, `npm run migrate:down` (trong `backend/`) |
| Kiểm tài liệu | `node tools/check-docs.js` |

CI còn chạy: `npm audit --omit=dev --audit-level=high`, `python3 -m unittest discover -s tools -q`, `node tools/check-docs.js`, job Windows (`test-windows`), job `session-scenario`, job `demo-smoke`.

Lưu ý khi chạy:
- Test dùng chung một DB nên chạy tuần tự (`--test-concurrency=1`). Không chạy hai tiến trình `npm test` cùng lúc trên một DB: kết quả sai và khó truy nguyên.
- `.github/workflows/ci.yml` dùng CRLF. Sửa bằng công cụ giữ nguyên xuống dòng, rồi kiểm `git diff --stat` chỉ có số dòng thật sự đổi. Không để cả file đổi CRLF → LF.
- Không có Docker hoặc DB để chạy: ghi `BLOCKED` kèm lý do. Không được suy ra kết quả.

## 3. Luật cứng

1. **Báo cáo trung thực.** Chỉ được viết "đã chạy", "đạt", "xanh" khi có lệnh và dòng kết quả cuối (số pass/fail) dán trong cùng câu trả lời. Mỗi nhận định thuộc đúng một mức: `ĐÃ CHẠY`, `ĐỌC CODE` (thấy trong mã, chưa chạy), `CHƯA KIỂM`. Không dùng các từ "100%", "triệt để", "hoàn thiện", "đã khắc phục" khi chưa có output đi kèm.
2. **Không bịa.** Không đoán tên file, hàm, số dòng, mã commit, số liệu. Không chắc thì mở file ra đọc hoặc nói "không tìm thấy".
3. **Đúng phạm vi.** Chỉ làm đúng story hoặc bug được giao. Thấy lỗi khác thì ghi vào mục "Phát hiện thêm" của báo cáo, không tự sửa.
4. **Vùng cấm** (chỉ động vào khi người dùng yêu cầu đích danh, và nêu rõ trong kế hoạch):
   - `.github/workflows/**`, `docker-compose.yml`, `render.yaml`, `eslint.config.js`
   - migration đã có trong `backend/migrations/` (chỉ được thêm file mới với số kế tiếp, kèm `.down.sql`, chạy được cả tiến và lùi)
   - `package.json`, `package-lock.json` (không thêm hay nâng thư viện nếu không được yêu cầu)
   - `docs/Audit/**`, `docs/testing/**` (thuộc vai trò kiểm thử)
5. **Không sửa CI để làm xanh.** Chỉ sửa `ci.yml` khi story yêu cầu hạ tầng CI hoặc người dùng yêu cầu đích danh.
6. **Không nới test để qua.** Cấm xoá, comment-out, `.skip`, `.todo`, giảm assertion, tăng timeout hoặc ngưỡng cho test hiện có. Test đỏ thì tìm nguyên nhân gốc trong code. Nghi test sai: dừng, nêu bằng chứng, hỏi. Test cũ buộc phải đổi vì hợp đồng đổi thì nêu rõ lý do trong báo cáo và PR.
7. **Test phải kiểm hành vi chạy thật.** Test chỉ đọc nội dung file cấu hình (YAML, compose, một chuỗi trong mã) không phải bằng chứng rằng job hay dịch vụ chạy được. Với hạ tầng, bằng chứng là lần chạy thật (log hoặc liên kết lần chạy CI). Mỗi AC của story có ít nhất một test. Sửa bug: test phải đỏ trước khi sửa và xanh sau khi sửa.
8. **Không tạo file ngoài yêu cầu.** Cấm tạo báo cáo, ghi chú, nhật ký ở gốc repo hoặc nơi không được chỉ định (ví dụ `kiem_thu_*.md`, `report*.md`, `NOTES.md`, file scratch). Kết quả trả lời ngay trong khung chat. Tài liệu chỉ ghi vào đúng file người dùng chỉ định.
9. **Git.** Không tự chạy `git commit`, `git push`, `git merge`, `git rebase`, `git reset --hard`, `git push --force` trừ khi người dùng ra lệnh rõ ngay trong phiên đó. Khi được bảo commit: theo `CONTRIBUTING.md` mục 3 (tiếng Việt, tối đa 72 ký tự, không dấu chấm cuối, kèm `[MÃ-JIRA]`), mỗi commit một ý, đứng tên tài khoản của người dùng. Không bao giờ vào thẳng `main`. Chuyển file thì dùng `git mv` để giữ lịch sử.
10. **Bí mật và dữ liệu.** Không đọc, in, commit `.env`; chỉ dùng `.env.example`. Không đưa dữ liệu cá nhân thật (tên, biển số, toạ độ GPS thật) vào prompt, test, seed. Tài khoản `admin/admin` chỉ dành cho máy cá nhân.
11. **Đổi hợp đồng API là việc lớn.** Đổi hình dạng phản hồi API/SSE, header bắt buộc hoặc giá trị mặc định (ví dụ `current_kwh` từ `0` sang `null`) phải cập nhật tài liệu, mọi nơi frontend dùng nó, test, và nêu rõ trong báo cáo.
12. **Vai trò audit/review không sửa code.** Phiên được giao kiểm thử hoặc review thì chỉ đọc và báo cáo. Việc sửa làm ở phiên khác.

## 4. Nguyên tắc viết code

- **Nghĩ trước khi code.** Nêu giả định. Có nhiều cách hiểu thì trình bày, không chọn thầm. Có cách đơn giản hơn thì nói ra và phản biện khi cần.
- **Đơn giản trước.** Mã tối thiểu giải quyết đúng vấn đề: không tính năng thừa, không trừu tượng cho đoạn dùng một lần, không cấu hình chưa ai yêu cầu, không xử lý lỗi cho tình huống không thể xảy ra. Viết 200 dòng mà 50 dòng đủ thì viết lại.
- **Sửa có mục tiêu.** Mỗi dòng đổi phải lần ngược được về yêu cầu. Không "cải thiện" mã, comment, định dạng bên cạnh; giữ phong cách sẵn có. Chỉ dọn thứ do chính thay đổi của mình làm thừa (import, biến, hàm). Thấy mã chết có từ trước thì báo, không xoá.
- **Mục tiêu kiểm chứng được.** Đổi việc thành điều kiện kiểm được: "thêm validation" → viết test input sai rồi làm cho xanh; "sửa bug" → test tái hiện lỗi rồi làm cho xanh; "refactor" → test xanh trước và sau. Việc nhiều bước thì ghi kế hoạch ngắn dạng `bước → kiểm bằng gì`.

## 5. Dừng và hỏi ngay khi

- AC mơ hồ hoặc hai tài liệu mâu thuẫn nhau.
- Phải sửa vùng cấm, thêm migration, đổi hợp đồng API, thêm thư viện.
- Test đỏ mà chưa giải thích được nguyên nhân sau hai lần thử.
- Kế hoạch sắp vượt quá số file đã duyệt.
- Việc không thể hoàn tác hoặc đụng bên ngoài repo (xoá file, ghi đè, gửi đi dịch vụ ngoài): hỏi trước, kể cả khi đã được duyệt ở ngữ cảnh khác.

## 6. Quy trình mỗi việc

1. Khám phá (chỉ đọc).
2. Kế hoạch gồm file sẽ sửa, test cho từng AC, ảnh hưởng, câu hỏi. **Chờ người dùng duyệt.**
3. Viết test trước (phải đỏ đúng lý do), rồi code.
4. Chạy lệnh ở mục 2.
5. Báo cáo theo mẫu mục 7.

## 7. Mẫu báo cáo cuối (bắt buộc, không thêm lời khen)

```
Nhiệm vụ: <GYM-xx / S-xx, một dòng>
File đã sửa/thêm: <mỗi file một dòng ngắn>
ĐÃ CHẠY (dán lệnh và dòng kết quả cuối):
  $ <lệnh>
  <dòng kết quả cuối, có số pass/fail>
ĐỌC CODE, chưa chạy: <...>
BLOCKED / CHƯA KIỂM: <việc + lý do; không có thì ghi "không">
Ảnh hưởng: <API, frontend, migration, tài liệu>
Phát hiện thêm (không sửa): <...>
Đề xuất commit: <type(phạm vi): mô tả [GYM-xx]>
```
