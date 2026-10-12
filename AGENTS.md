# AGENTS.md — Luật cho AI agent làm việc trong repo CSMS

> Áp dụng cho mọi AI agent (Antigravity CLI, Copilot, Claude...). Người dùng chịu trách nhiệm về mọi thay đổi do AI tạo ra.
> Quy ước nhóm đầy đủ: `CONTRIBUTING.md`.
> Vai trò kiểm thử/audit độc lập có ngữ cảnh riêng: `docs/testing/AI_TESTER_AUDITOR_CONTEXT.md` (chỉ đọc khi được giao việc đó).

## 1. Dự án trong 6 dòng

- CSMS: nền tảng vận hành trạm sạc xe điện (OCPP 1.6J). Dự án thực tập ICTU × CodeGym.
- Stack: Node.js >= 22.7, Express, frontend JS thuần (`frontend/`), PostgreSQL 16 (`pg`), WebSocket `ws`, SSE, JWT cookie HttpOnly, Argon2id, `zod`.
- Cấu trúc: `backend/src` (mã nguồn), `backend/migrations` (SQL đánh số, có `.down.sql`), `backend/tests/{unit,integration,acceptance}`, `frontend/`, `tools/` (simulator, script Python), `docs/`.
- Phân quyền mặc định từ chối: `backend/src/security/permissions.js`, `backend/src/security/routeGuard.js`; lọc theo sở hữu ở tầng truy vấn: `backend/src/db/scope.js`.
- Ràng buộc: thanh toán chỉ ở sandbox; tuân thủ Nghị định 13/2023 (dữ liệu cá nhân, vị trí GPS).
- Mọi thứ trong mục 3 là luật cứng. Không chắc thì dừng và hỏi, không đoán.

## 2. Lệnh chuẩn (đã đối chiếu với `backend/package.json`, `test.py`, `.github/workflows/ci.yml`)

| Việc | Lệnh |
|---|---|
| Lint + toàn bộ test như CI (cần Docker) | `python test.py` |
| Chỉ một nhóm | `python test.py --only unit` (hoặc `integration`, `acceptance`) |
| Một file test | `python test.py --file tests/acceptance/S-04.station-management.test.js` |
| Chỉ lint | `python test.py --lint-only` hoặc `npm run lint` (trong `backend/`) |
| Test không qua Docker | `npm test` trong `backend/`, cần `TEST_DATABASE_URL` trỏ DB có tên kết thúc bằng `_test` |
| Migration | `npm run migrate`, `npm run migrate:down` (trong `backend/`) |

CI còn chạy: `npm audit --omit=dev --audit-level=high`, `python3 -m unittest discover -s tools -q`, job Windows (`test-windows`) và job `session-scenario`.
Không có Docker hoặc DB để chạy: ghi `BLOCKED` kèm lý do. Không được suy ra kết quả.

## 3. Luật cứng

1. **Báo cáo trung thực.** Chỉ được viết "đã chạy", "đạt", "xanh" khi có lệnh và dòng kết quả cuối (số pass/fail) dán trong cùng câu trả lời. Mỗi nhận định thuộc đúng một mức: `ĐÃ CHẠY`, `ĐỌC CODE` (thấy trong mã, chưa chạy), `CHƯA KIỂM`. Không dùng các từ "100%", "triệt để", "hoàn thiện", "đã khắc phục" khi chưa có output đi kèm.
2. **Không bịa.** Không đoán tên file, hàm, số dòng, mã commit, số liệu. Không chắc thì mở file ra đọc hoặc nói "không tìm thấy".
3. **Đúng phạm vi.** Chỉ làm đúng story hoặc bug được giao. Thấy lỗi khác thì ghi vào mục "Phát hiện thêm" của báo cáo, không tự sửa.
4. **Vùng cấm** (chỉ động vào khi người dùng yêu cầu đích danh, và nêu rõ trong kế hoạch):
   - `.github/workflows/**`, `docker-compose.yml`, `render.yaml`, `eslint.config.js`
   - migration đã có trong `backend/migrations/` (chỉ được thêm file mới với số kế tiếp, kèm `.down.sql`, chạy được cả tiến và lùi)
   - `package.json`, `package-lock.json` (không thêm hay nâng thư viện nếu không được yêu cầu)
   - `docs/Audit/**`, `docs/testing/**` (thuộc vai trò kiểm thử)
5. **Không sửa CI để làm xanh.** Chỉ sửa `ci.yml` khi story yêu cầu hạ tầng CI (ví dụ S-26).
6. **Không nới test để qua.** Cấm xoá, comment-out, `.skip`, `.todo`, giảm assertion, tăng timeout hoặc ngưỡng cho test hiện có. Test đỏ thì tìm nguyên nhân gốc trong code. Nghi test sai: dừng, nêu bằng chứng, hỏi.
7. **Test phải kiểm hành vi chạy thật.** Test chỉ đọc nội dung file cấu hình (YAML, compose, một chuỗi trong mã) không phải bằng chứng rằng job hay dịch vụ chạy được. Với hạ tầng, bằng chứng là lần chạy thật (log hoặc liên kết lần chạy CI). Mỗi AC của story có ít nhất một test.
8. **Không tạo file ngoài yêu cầu.** Cấm tạo báo cáo, ghi chú, nhật ký ở gốc repo hoặc nơi không được chỉ định (ví dụ `kiem_thu_*.md`, `report*.md`, `NOTES.md`, file scratch). Kết quả trả lời ngay trong khung chat. Tài liệu chỉ ghi vào đúng file người dùng chỉ định.
9. **Git.** Không tự chạy `git commit`, `git push`, `git merge`, `git rebase`, `git reset --hard`, `git push --force` trừ khi người dùng ra lệnh rõ ngay trong phiên đó. Khi được bảo commit: theo `CONTRIBUTING.md` mục 3 (tiếng Việt, tối đa 72 ký tự, không dấu chấm cuối, kèm `[MÃ-JIRA]`), mỗi commit một ý. Không bao giờ vào thẳng `main`.
10. **Bí mật và dữ liệu.** Không đọc, in, commit `.env`; chỉ dùng `.env.example`. Không đưa dữ liệu cá nhân thật (tên, biển số, toạ độ GPS thật) vào prompt, test, seed. Tài khoản `admin/admin` chỉ dành cho máy cá nhân.
11. **Đổi hợp đồng API là việc lớn.** Đổi hình dạng phản hồi API/SSE hoặc giá trị mặc định (ví dụ `current_kwh` từ `0` sang `null`) phải cập nhật tài liệu, mọi nơi frontend dùng nó, test, và nêu rõ trong báo cáo.
12. **Vai trò audit/review không sửa code.** Phiên được giao kiểm thử hoặc review thì chỉ đọc và báo cáo. Việc sửa làm ở phiên khác.

## 4. Dừng và hỏi ngay khi

- AC mơ hồ hoặc hai tài liệu mâu thuẫn nhau.
- Phải sửa vùng cấm, thêm migration, đổi hợp đồng API, thêm thư viện.
- Test đỏ mà chưa giải thích được nguyên nhân sau hai lần thử.
- Kế hoạch sắp vượt quá số file đã duyệt.

## 5. Quy trình mỗi việc

1. Khám phá (chỉ đọc) → 2. Kế hoạch gồm file sẽ sửa, test cho từng AC, ảnh hưởng, câu hỏi; **chờ người dùng duyệt** → 3. Viết test trước (phải đỏ đúng lý do) rồi code → 4. Chạy lệnh ở mục 2 → 5. Báo cáo theo mẫu dưới đây.

## 6. Mẫu báo cáo cuối (bắt buộc, không thêm lời khen)

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
## 7. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 8. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 9. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 10. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.