# KẾ HOẠCH TỪ BÂY GIỜ ĐẾN HẾT DỰ ÁN — 9 chặng nối tiếp (12/10 → 21/10/2026)


## 1. Bảng 9 chặng

| Chặng | Nội dung | Thẻ (Jira) | SP | Must / Should / Could | Commit | Migration dự kiến | Phụ thuộc thật sự | Người làm | Tester | File |
|---|---|---|---:|---|---:|---|---|---|---|---|
| **1** | Biểu giá và hàm tính tiền | S-28*, S-29, S-30, S-31, S-32 (GYM-54, GYM-55, GYM-56, GYM-57, GYM-58) | 15 | 10 / 2 / 0 (+S-28*) | 16 | 032–033 | Bước 0 (đáp án tay) | ______ | ______ | `PROMPT_CHANG_01.md` |
| **2** | Hoá đơn bất biến, phí chiếm trụ và lịch sử phiên | S-28*, S-33, S-34, S-64 (GYM-54, GYM-59, GYM-60, GYM-90) | 10 | 3 / 5 / 0 (+S-28*) | 16 | 034–037 | Chặng 1 (`priceSession`, biểu giá) | ______ | ______ | `PROMPT_CHANG_02.md` |
| **3** | Sổ cái, ví tự trừ tiền và nhật ký ví | S-41, S-37, S-38, S-40, S-36, S-56 (GYM-62, GYM-63, GYM-64, GYM-66, GYM-67, GYM-82) | 15 | 6 / 9 / 0 | 17 | 038–040 | Chặng 2 (hoá đơn, `registerAfterInvoice`) | ______ | ______ | `PROMPT_CHANG_03.md` |
| **4** | Nạp ví qua cổng sandbox, thông báo và sao lưu | S-35, S-39, S-59, S-62 (GYM-61, GYM-65, GYM-85, GYM-88) | 14 | 8 / 6 / 0 | 18 | 041–043 | Chặng 3 (`postEntry`, ví) | ______ | ______ | `PROMPT_CHANG_04.md` |
| **5** | Doanh thu, đối soát, chốt kỳ và xoá dữ liệu cá nhân | S-52, S-53, S-55, S-57 (GYM-78, GYM-79, GYM-81, GYM-83) | 14 | 11 / 3 / 0 | 19 | 044–046 | Chặng 2, 3, 4 (hoá đơn, sổ cái, thông báo) | ______ | ______ | `PROMPT_CHANG_05.md` |
| **6** | Công suất trạm và cấu hình trụ từ xa | S-42, S-43, S-44, S-60 (GYM-68, GYM-69, GYM-70, GYM-86) | 16 | 8 / 8 / 0 | 18 | 047–049 | Ít phụ thuộc tiền; cần mẫu gửi lệnh xuống trụ (chặng 2–5) | ______ | ______ | `PROMPT_CHANG_06.md` |
| **7** | Tìm trạm gần, trạm hoạt động/tạm ngừng và đặt chỗ | S-47, S-66, S-48, S-49 (GYM-73, GYM-74, GYM-75, GYM-92) | 15 | 0 / 15 / 0 | 16 | 050–051 | Chặng 3 (ngưỡng ví), 6 (lệnh xuống trụ, trình giả lập), 1–2 (đơn giá hiện tại) | ______ | ______ | `PROMPT_CHANG_07.md` |
| **8** | Chia doanh thu, xuất CSV, cảnh báo trụ, sức khoẻ hệ thống và quản lý tài khoản | S-54, S-58, S-46, S-63, S-61 (GYM-72, GYM-80, GYM-84, GYM-87, GYM-89) | 14 | 0 / 9 / 5 | 19 | 052–056 | Chặng 4 (email), 5 (báo cáo, kỳ), 6 (`alerts`) | ______ | ______ | `PROMPT_CHANG_08.md` |
| **9** | Hạn mức theo giờ, huỷ và quá hạn đặt chỗ, gói tháng, bộ demo và đóng dự án | S-45, S-50, S-51, S-65 (GYM-71, GYM-76, GYM-77, GYM-91) | 12 | 0 / 0 / 12 | 19 | 057–060 | Chặng 2–3 (hoá đơn, sổ cái), 6 (`rebalanceStation`), 7 (đặt chỗ) | ______ | ______ | `PROMPT_CHANG_09.md` |
| | **Tổng** | 39 thẻ | **125** (123 SP Jira + ≈2 SP ẩn) | 49 / 57 / 17 | 158 | 032–060 | | | | |

`*` S-28 tách hai chặng: AC1 (khai biểu giá) + AC3 (chặn giá trị âm) ở chặng 1; AC2 (phí chiếm trụ tính từ hết ân hạn) ở chặng 2 vì cần lịch sử trạng thái đầu nối mà mã chưa lưu. **S-28 chỉ Done sau chặng 2.** Số migration trong bảng là dự kiến; số thật = số lớn nhất hiện có trong `backend/migrations/` + 1 (hiện tới `031`).

Vì sao thứ tự này: tiền phải đi đúng đường (biểu giá → hoá đơn → sổ cái/ví → nạp ví) trước khi làm báo cáo/đối soát dựa trên nó (chặng 5); công suất (chặng 6) đứng cuối nhóm Must vì ít phụ thuộc tiền; đặt chỗ cần ví (ngưỡng) và lệnh xuống trụ (chặng 7); chia doanh thu/CSV cần báo cáo và kỳ đã chốt (chặng 8); phần Could và đóng dự án để cuối (chặng 9) — chặng đầu tiên bị cắt nếu trễ.

## 2. Bảng 39 thẻ → chặng (để kéo lên Jira)

| Thẻ | Jira | Tiêu đề | SP | Ưu tiên | Chặng | Done khi |
|---|---|---|---:|---|---|---|
| S-28 | GYM-54 | Chủ trạm khai báo biểu giá theo kWh và phí chiếm trụ theo phút | 3 | Must | 1 + 2 | merge chặng 2 (AC1+AC3 ở chặng 1, AC2 phí chiếm trụ ở chặng 2) |
| S-29 | GYM-55 | Biểu giá có nhiều khung giờ trong ngày, không chồng lấn và phủ kín 24 giờ | 3 | Must | 1 | merge chặng 1 |
| S-30 | GYM-56 | Phiên cắt qua nhiều khung giờ được chia đoạn và tính đúng từng đoạn | 5 | Must | 1 | merge chặng 1 |
| S-31 | GYM-57 | Phiên qua nửa đêm tính đúng sang biểu giá ngày hôm sau | 2 | Must | 1 | merge chặng 1 |
| S-32 | GYM-58 | Bộ ca kiểm thử tính tiền có đáp án tính tay | 2 | Should | 1 | merge chặng 1 |
| S-33 | GYM-59 | Tài xế xem hoá đơn có diễn giải từng đoạn giá | 3 | Must | 2 | merge chặng 2 |
| S-34 | GYM-60 | Đổi biểu giá không làm đổi tiền của phiên đã kết thúc | 2 | Should | 2 | merge chặng 2 |
| S-35 | GYM-61 | Tài xế nạp tiền vào ví qua cổng thanh toán sandbox | 5 | Must | 4 | merge chặng 4 |
| S-36 | GYM-62 | Quản trị viên nạp tay vào ví khi chưa có cổng thanh toán | 2 | Should | 3 | merge chặng 3 |
| S-37 | GYM-63 | Ví bị trừ tự động khi phiên kết thúc, có bản ghi giao dịch | 3 | Must | 3 | merge chặng 3 |
| S-38 | GYM-64 | Ví dưới ngưỡng tối thiểu thì trụ từ chối bắt đầu phiên mới | 2 | Should | 3 | merge chặng 3 |
| S-39 | GYM-65 | Webhook nạp ví gửi lại nhiều lần chỉ ghi nhận một, sai chữ ký bị từ chối | 3 | Must | 4 | merge chặng 4 |
| S-40 | GYM-66 | Tài xế xem số dư và lịch sử giao dịch ví | 2 | Should | 3 | merge chặng 3 |
| S-41 | GYM-67 | Số dư ví luôn khớp sổ cái chỉ ghi thêm | 3 | Must | 3 | merge chặng 3 |
| S-42 | GYM-68 | Chủ trạm đặt hạn mức công suất cho trạm | 3 | Must | 6 | merge chặng 6 |
| S-43 | GYM-69 | Tổng công suất cấp cho các trụ đang sạc không vượt hạn mức trạm | 5 | Must | 6 | merge chặng 6 |
| S-44 | GYM-70 | Công suất được chia lại khi có xe vào hoặc rời trạm | 5 | Should | 6 | merge chặng 6 |
| S-45 | GYM-71 | Chủ trạm đặt hạn mức công suất theo khung giờ | 3 | Could | 9 | merge chặng 9 |
| S-46 | GYM-72 | Cảnh báo khi trụ ngoại tuyến quá lâu hoặc báo lỗi liên tục | 3 | Should | 8 | merge chặng 8 |
| S-47 | GYM-73 | Tài xế tìm trạm gần và thấy đầu nối nào đang rảnh | 5 | Should | 7 | merge chặng 7 |
| S-48 | GYM-74 | Tài xế đặt chỗ một trụ trong khoảng thời gian | 5 | Should | 7 | merge chặng 7 |
| S-49 | GYM-75 | Hai tài xế đặt cùng trụ cùng lúc thì chỉ một người thành công | 3 | Should | 7 | merge chặng 7 |
| S-50 | GYM-76 | Giữ chỗ quá giờ không tới thì bị huỷ và tính phí | 3 | Could | 9 | merge chặng 9 |
| S-51 | GYM-77 | Tài xế huỷ chỗ đã đặt và trụ mở lại cho người khác | 3 | Could | 9 | merge chặng 9 |
| S-52 | GYM-78 | Chủ trạm xem doanh thu và sản lượng kWh theo kỳ, theo từng trụ | 3 | Must | 5 | merge chặng 5 |
| S-53 | GYM-79 | Kế toán đối soát tổng kWh đã cấp với tổng tiền đã thu | 5 | Must | 5 | merge chặng 5 |
| S-54 | GYM-80 | Chia doanh thu cho đối tác theo tỉ lệ hợp đồng | 3 | Should | 8 | merge chặng 8 |
| S-55 | GYM-81 | Kỳ đối soát được chốt và khoá | 3 | Should | 5 | merge chặng 5 |
| S-56 | GYM-82 | Nhật ký thao tác trên giao dịch ví truy được ai làm gì | 3 | Should | 3 | merge chặng 3 |
| S-57 | GYM-83 | Tài xế yêu cầu xoá dữ liệu cá nhân và lịch sử di chuyển | 3 | Must | 5 | merge chặng 5 |
| S-58 | GYM-84 | Xuất báo cáo doanh thu và đối soát ra tệp CSV | 2 | Could | 8 | merge chặng 8 |
| S-59 | GYM-85 | Tài xế nhận thông báo khi phiên kết thúc hoặc bị dừng | 3 | Should | 4 | merge chặng 4 |
| S-60 | GYM-86 | Vận hành viên đổi cấu hình trụ từ xa bằng `ChangeConfiguration` | 3 | Should | 6 | merge chặng 6 |
| S-61 | GYM-87 | Quản trị viên quản lý tài khoản và gán vai trò | 3 | Should | 8 | merge chặng 8 |
| S-62 | GYM-88 | Sao lưu cơ sở dữ liệu hằng ngày và khôi phục được | 3 | Should | 4 | merge chặng 4 |
| S-63 | GYM-89 | Bảng sức khoẻ hệ thống: trụ trực tuyến, phiên đang chạy, lỗi gần đây | 3 | Could | 8 | merge chặng 8 |
| S-64 | GYM-90 | Tài xế xem lịch sử phiên sạc của mình | 3 | Should | 2 | merge chặng 2 |
| S-65 | GYM-91 | Gói thuê bao tháng với biểu giá riêng | 3 | Could | 9 | merge chặng 9 |
| S-66 | GYM-92 | Chủ trạm đưa trạm vào hoạt động hoặc tạm ngừng | 2 | Should | 7 | merge chặng 7 |

Gợi ý Jira (**mình không tự đổi**; Phúc làm hoặc nhờ trong chat): gắn nhãn `chang-1` … `chang-9` cho từng thẻ, hoặc tạo bộ lọc theo bảng trên; thẻ chuyển Done ngay khi chặng của nó merge (bảng «Done khi»).

## 3. Lịch và điểm cắt — nói thẳng

### 3.1 Phép tính
- Hôm nay Thứ Hai 12/10. Demo 21/10 (Thứ Tư). Ngày dùng được: 13, 14, 15, 16, 17 (T7), 18 (CN), 19, 20 = **8 ngày**; 21/10 dành cho tổng duyệt và demo (không còn ngày sửa lỗi lớn).
- Một chặng trong một ngày gồm: agy chạy + soát (≈ 3–5 giờ, **chưa đo**), PR + CI (≈ 20–40 phút, **ĐỌC CODE** từ lịch sử CI), tester kiểm (≈ 1–3 giờ), sửa lỗi + kiểm lại (≈ 1–2 giờ), merge. Tức một chặng/ngày là **sát giới hạn**, không có đệm.
- Nhịp lịch sử: Sprint 3 = 20 SP/tuần. Để làm 125 SP cần ≈ 15 SP/ngày. Phần chênh phải do agy tạo ra, **chưa kiểm chứng**.

### 3.2 Ba kịch bản
| Kịch bản | Cách làm | Xong khi | Hệ quả |
|---|---|---|---|
| **K1** — chỉ ngày làm việc, nối tiếp | 13, 14, 15, 16, 19, 20 ⇒ chặng 1–6 | 20/10 | **Đủ toàn bộ thẻ Must (49 SP)**. Chặng 7–9 (41 SP: đặt chỗ, chia doanh thu, CSV, cảnh báo, sức khoẻ, tài khoản, hạn mức theo giờ, quá hạn/huỷ chỗ, gói tháng) **không kịp**. |
| **K2** — nối tiếp + làm T7, CN | 13→20, mỗi ngày một chặng | 20/10: chặng 1–8; chặng 9 rơi vào ngày demo | Còn lại chỉ **chặng 9** (12 SP, toàn Could). |
| **K3** — K2 + chạy song song chặng 8 ∥ 9 ngày 20/10 | Hai người, hai nhánh, xem 5.4 | 20/10 đêm: cả 9 chặng | Đủ 39 thẻ nhưng **không còn ngày đệm**; một chặng trễ là vỡ. |

**ĐỀ XUẤT của mình:** hướng tới K3, nhưng quyết định theo số đo thật ở hai mốc dưới đây, và luôn cắt từ cuối (chặng 9 → 8 → 7); **không bao giờ cắt chặng 1–6**. Phúc đã yêu cầu «hoàn thành hết, không để thẻ nào ngoài»; mình ghi rõ rằng điều đó chỉ khả thi ở K3 và phụ thuộc nhịp chưa đo, để Phúc báo trước với mentor/PO thay vì phát hiện ở ngày 20/10.

### 3.3 Lịch đề xuất (K3) và mốc quyết định
| Ngày | Việc | Mốc quyết định |
|---|---|---|
| T2 12/10 tối | **Bước 0** (mục 6): Phúc đưa 2 tệp đáp án tay vào nhánh chặng 1; Nam bắt đầu tính tay lại C01–C17 | Nam báo thời gian cần |
| T3 13/10 | **Chặng 1** (chạy song song với việc Nam tính tay; chỉ merge sau khi Nam ký) | **Mốc 1 (tối 13/10):** chặng 1 tốn bao nhiêu giờ thật? > 1 ngày làm việc ⇒ báo PO NGAY rằng chặng 9 (và có thể 8) sẽ bị cắt |
| T4 14/10 | Chặng 2 | |
| T5 15/10 | Chặng 3 | |
| T6 16/10 | Chặng 4 | **Mốc 2 (tối 16/10):** đã xong 4/9 chặng? Chưa ⇒ chốt K1 (chỉ Must) và dùng 17–18/10 để đảm bảo chặng 5–6 |
| T7 17/10 | Chặng 5 (làm cuối tuần — cần Q0) | |
| CN 18/10 | Chặng 6 — **hết thẻ Must** | **Mốc 3 (tối 18/10):** nếu Must chưa xong, mọi sức lực dồn vào chặng 5–6, bỏ chặng 7–9 |
| T2 19/10 | Chặng 7 | |
| T3 20/10 | Chặng 8 ∥ Chặng 9 (5.4); cuối ngày: đóng băng mã | |
| T4 21/10 | Sáng: tổng duyệt `docs/demo/KICH-BAN-DEMO.md`, sửa lỗi nhỏ; chiều: demo | |

### 3.4 Chế độ song song duy nhất được phép (chỉ khi cần): chặng 8 ∥ chặng 9
Sau khi chặng 7 merge, chặng 8 và 9 gần như độc lập (chặng 9 cần chặng 3, 6, 7; chặng 8 cần chặng 4, 5, 6). Điều kiện: (1) hai người khác nhau, hai nhánh; (2) dải migration cố định — chặng 8: 052–056, chặng 9: 057–060 — và **chặng 8 merge trước chặng 9** (để thứ tự migration không đảo; cơ chế `npm run migrate` có chấp nhận số nhỏ chèn sau số lớn hay không là **CHƯA KIỂM**); (3) cả hai sửa chung `permissions.js`, `frontend/app/permissions.js`, `router.js`, `workspace.js`, `audit-logs.js`, `.env.example` ⇒ người merge sau tự giải xung đột văn bản và chạy lại `python test.py`; (4) chặng 9 bỏ yêu cầu «đã merge chặng 8» (ghi sẵn ở prerequisite), nhưng chặng 9 là bàn giao cuối nên **bộ demo chỉ làm sau khi cả hai đã merge** — lúc đó chỉ còn commit cuối (docs/tools) của chặng 9.
Không dùng chế độ này ở chỗ nào khác: Phúc đã chọn nối tiếp để dễ theo dõi.

## 4. Bước 0 — đáp án tay billing (Phúc + Nam, KHÔNG dùng AI)

Chặng 1 cần hai tệp **đã ký** làm chuẩn so sánh: `docs/testing/billing/ca-tinh-tay.md` (bản đọc được cho người, kèm cách tính) và `backend/tests/fixtures/billing/hand-cases.json` (cùng số liệu cho test). Hai tệp nằm trong **vùng cấm của AI** (`docs/testing/**` và fixture) nên do **người** đưa vào. Mình đã tính 17 ca (C01–C17) bằng chương trình riêng, không dùng mã dự án, và đã đối chiếu tổng tiền của cả 17 ca với một cài đặt thứ hai có cấu trúc khác (số nguyên theo giây, quét từng phút) — **ĐÃ CHẠY, 17/17 trùng tổng**; nhưng cả hai đều do cùng một tác giả (mình) nên chưa độc lập về mặt con người: **một người thứ hai phải tính tay lại** — nếu chỉ để AI tự tính rồi AI tự kiểm thì chặng 1 không có chuẩn độc lập.

1. **Phúc** tạo nhánh `docs/billing-ca-tinh-tay` từ `main`, chép hai tệp vào đúng đường dẫn trên, mở PR (hoặc đưa thẳng vào nhánh chặng 1 để chạy song song, xem 5.3).
2. **Nam** (hoặc người thứ hai) tính lại **C01–C17** bằng máy tính/bảng tính, **không mở mã ứng dụng, không dùng AI**, theo quy ước ở đầu `ca-tinh-tay.md` (Wh nguyên; tiền nguyên đồng; nội suy tuyến tính giữa hai mẫu bao quanh rồi làm tròn nửa lên; làm tròn từng đoạn rồi cộng; phí chiếm trụ tính trọn phút).
3. Nam điền khối «Xác nhận» cuối `ca-tinh-tay.md`: từng ca ☑ khớp hoặc ghi chênh lệch. **Lệch ca nào ⇒ báo Phúc/Claude (lỗi nằm ở tệp đáp án); KHÔNG sửa mã để chiều theo.**
4. Chỉ merge chặng 1 khi khối xác nhận đã có tên và ngày. (Nếu Nam ký sau khi dev bắt đầu thì vẫn được, miễn là trước khi merge.)
5. Các bảng đáp án của chặng 2–9 (K, V, A, B, U, W, R, G, H, P, S…) nằm ngay trong prompt từng chặng; tester tự tính lại các ca tiền ở phiếu «Tự tính tay» của từng chặng.

## 5. Tester và vòng sửa lỗi

- **Ba cách kiểm** (có thể kết hợp): (1) *Người* — Nam theo phiếu mục F (chạy thật trên giao diện, tự tính tay, lạm dụng, hồi quy); (2) *AI-tester* — mục G, chỉ đọc + chạy lệnh, trả bảng ĐẠT/LỖI kèm khối «Gửi dev sửa»; (3) *Claude kiểm độc lập* — Phúc dán link PR/nhánh vào chat. Kết quả của AI chỉ là đầu vào cho người; **người** ký «ĐẠT».
- **Mức lỗi:** CHẶN MERGE (sai tiền, mất dữ liệu, hở quyền/dữ liệu cá nhân, test đỏ, vi phạm quyết định ở mục 3, phá chặng trước) · NÊN SỬA (sai chữ, UX, thiếu test phụ) · GHI NHẬN (đưa vào bàn giao, sửa chặng sau).
- **Vòng sửa:** tối đa 2 vòng/chặng. Sau vòng 2 còn lỗi chặn ⇒ Phúc quyết: cắt phần đó khỏi chặng (ghi vào bàn giao, đổi trạng thái Jira) hoặc hoãn merge. Không kéo dài vô hạn vì sẽ ăn mất các chặng sau.
- **Lỗi nhỏ về giao diện** (như 4 lỗi frontend Phúc đã chọn để sau ở S-27) được phép dồn lại thành một đợt sửa cuối ở 21/10 sáng; lỗi về tiền/quyền/dữ liệu thì không.

## 6. Mẫu bàn giao, quy ước nhánh/commit/PR

**Tệp bàn giao** `docs/dev/CHANG-0N_<YYYY-MM-DD>.md` — AI chặng sau đọc để biết dùng lại hàm gì:
1) Thẻ đã xong / chưa xong (kèm lý do nếu chưa).  2) Danh sách commit (hash ngắn + message).  3) File chính đã thêm/sửa.  4) Bảng DB + migration (số, tên, ý nghĩa).  5) API mới (method, đường dẫn, quyền, ví dụ request/response).  6) Hàm/module để chặng sau TÁI SỬ DỤNG (đường dẫn + chữ ký + 1 dòng cách dùng).  7) Biến môi trường mới (tên + giá trị mẫu, KHÔNG ghi bí mật thật).  8) Quyết định đã áp dụng + giới hạn đã biết.  9) Cách chạy thử/demo (lệnh + tài khoản từ seed).  10) Kết quả lệnh (dán dòng cuối: số pass/fail).  11) Phát hiện thêm (không tự sửa).

**Nhánh:** `feat/GYM-<mã thẻ đầu>-chang-0N-<slug>` (ví dụ chặng 1: `feat/GYM-54-chang-01-bieu-gia`). **Commit:** `<type>(phạm vi): mô tả [GYM-xx]` theo `CONTRIBUTING.md` mục 3 — phần mô tả tiếng Việt, bắt đầu bằng động từ, ≤72 ký tự, không dấu chấm cuối; mỗi commit một ý. **PR:** tiêu đề `[GYM-54, GYM-55, GYM-56, GYM-57, GYM-58] Chặng 1 — Biểu giá và hàm tính tiền`; mô tả mẫu ở mục E của mỗi tệp prompt (có dòng bằng chứng `python test.py` và mục «Dùng AI»). **Merge:** *Create a merge commit* để giữ 8–20 commit; nếu chọn *Squash* thì chặng thành một commit (Phúc quyết một lần — `CONTRIBUTING.md` hiện ghi squash).

**Quy ước kỹ thuật chung K1–K12** (đã nhúng nguyên văn vào mọi prompt; liệt kê để đối chiếu):
K1. TIỀN: số nguyên đồng (BIGINT trong DB). ĐIỆN NĂNG: Wh nguyên. CẤM số thực ở mọi bước tính tiền/kWh. Chỉ MỘT hàm làm tròn (nửa lên) trong `backend/src/modules/billing/money.js`; mọi nơi khác gọi hàm đó, không tự làm tròn.
K2. NGÀY/KHUNG GIỜ: luôn theo múi giờ của trạm (`stations.timezone`), không dùng UTC cứng.
K3. BẢNG TIỀN (biểu giá, hoá đơn, sổ cái…): chỉ INSERT. Trigger chặn UPDATE, DELETE **và TRUNCATE** (bài học S-27). Mọi ngoại lệ phải ghi rõ trong migration và có test.
K4. GHI PHỤ (audit, thông báo, email, log) KHÔNG được làm hỏng thao tác chính của trụ/OCPP: bọc try/catch + log lỗi, trả lời trụ như bình thường. NGOẠI LỆ duy nhất: thao tác tiền — dòng sổ cái và dòng audit nằm CÙNG MỘT giao dịch DB.
K5. QUYỀN: khai ở `backend/src/security/permissions.js`; route dùng `secureRouter` + `access('<khoá>')` (không route nào mở mà chưa khai quyền); thêm khoá mới ⇒ cập nhật cả `frontend/app/permissions.js` (test `backend/tests/unit/frontend-permissions.test.js` kiểm hai bản khớp) và mở rộng `S-03.rbac-matrix.test.js`, `S-03.route-guard.test.js`. Lọc "của mình" ở tầng truy vấn (`backend/src/db/scope.js`); tài nguyên CÓ tồn tại nhưng của người khác ⇒ 403 + audit `ACCESS_DENIED`, không tồn tại ⇒ 404 (dùng `denyOrNotFound` trong `backend/src/lib/ownership.js`).
K6. AUDIT: dùng `backend/src/modules/audit/audit.repository.js` theo mẫu đang có; metadata KHÔNG chứa họ tên, mã thẻ đầy đủ, toạ độ GPS, mật khẩu, token (Nghị định 13). Thêm nhãn tiếng Việt cho action mới vào `ACTION_LABELS` của `frontend/pages/shared/audit-logs.js`.
K7. MIGRATION: file mới có số = (số lớn nhất hiện có trong `backend/migrations/`) + 1 — hiện nay tới `031`; số trong kế hoạch chỉ là dự kiến. Luôn kèm `.down.sql`; chạy được tiến → lùi → tiến trên DB rỗng. KHÔNG sửa migration cũ.
K8. TEST: mỗi AC ≥ 1 test, đặt `backend/tests/acceptance/S-xx.<mô-tả-ngắn>.test.js` và tên test nêu rõ AC; thêm unit/integration khi cần. Viết test TRƯỚC (phải đỏ đúng lý do), rồi code. Cấm xoá/`.skip`/nới ngưỡng test cũ. Dùng helper có sẵn trong `backend/tests/helpers/`.
K9. API: JSON; lỗi theo `backend/src/lib/errors.js`; kiểm đầu vào bằng zod (`lib/schemas.js`); không trả stack trace. Chỉ THÊM API/trường mới, không đổi hợp đồng API cũ (AGENTS 3.11).
K10. FRONTEND: JS thuần, KHÔNG thêm thư viện. Trang mới: đăng ký trong `frontend/app/router.js` (PAGES + PAGE_NEEDS) và bật mục menu trong `frontend/app/workspace.js` (`enabled: true`). Chuỗi hiển thị tiếng Việt; tiền hiển thị theo vi-VN (ví dụ `40.000 đ`) từ số nguyên; kiểm đầu vào tại ô nhập NHƯNG máy chủ luôn kiểm lại. Mọi chuỗi từ DB/người dùng khi đưa vào HTML phải được escape (chống XSS).
K11. OCPP/MẠNG: không được mất dữ liệu phiên khi trụ mất mạng/trễ gói. Lệnh xuống trụ có timeout, ghi kết quả, retry có giới hạn (mẫu: `backend/src/modules/sessions/abnormal-job.js`, `remote-stop-job.js`). Job nền phải chạy lại được nhiều lần không có tác dụng phụ (idempotent); đăng ký trong `start()` của `backend/src/server.js` theo mẫu `stopX = startXJob().stop`, và PHẢI dừng trong handler SIGTERM/SIGINT; test gọi hàm quét một lần chứ không chờ bộ hẹn.
K12. BÍ MẬT: không commit khoá/secret/.env; biến môi trường mới thêm vào `.env.example` + mục biến môi trường của `README.md`; `tools/` không hardcode credential (có test `tools-no-hardcoded-credentials`); log không chứa dữ liệu cá nhân (có test `log-hygiene`).

## 7. Câu hỏi cho PO và mặc định đã áp dụng trong prompt

Prompt đã **chốt sẵn một mặc định** cho mọi chỗ «chưa refine» để AI không đoán. PO trả lời khác ⇒ sửa mục 3 của prompt chặng tương ứng **trước khi chạy chặng đó** (các số trong bảng đáp án có thể phải tính lại).

| # | Câu hỏi | Mặc định đã áp | Chặng | Cần trả lời trước |
|---|---|---|---|---|
| Q0 | Có làm T7, CN và buổi tối không? | Chưa tính; K2/K3 cần «có» | tất cả | tối 12/10 |
| Q1 | Giá khoá theo lúc bắt đầu phiên hay theo từng ngày? | Theo `started_at`; ghi giới hạn ở phiên qua nửa đêm đúng đêm đổi giá | 1, 2 | trước chặng 1 |
| Q2 | Phí chiếm trụ: làm tròn phút, chờ rút súng tối đa? | Mỗi phút đã bắt đầu tính trọn; chờ tối đa 60 phút rồi chốt (`IDLE_MAX_WAIT_MIN`) | 2 | trước chặng 2 |
| Q3 | Làm tròn | Nửa lên, từng đoạn rồi cộng | 1 | trước chặng 1 |
| Q4 | Wh tại mốc cắt khi mẫu thưa | Nội suy giữa hai mẫu bao quanh | 1 | trước chặng 1 |
| Q5 | Phiên không biểu giá / không tài xế / `needs_review` | Không phát hành hoá đơn FINAL, hiện «đang chờ xử lý», không tính tiền ngầm | 2 | trước chặng 2 |
| Q6 | Biểu giá đầu tiên của trạm có được bắt đầu hôm nay? | Có; các phiên bản sau chỉ từ ngày mai | 1 | trước chặng 1 |
| Q7 | B5 — xác thực trụ (kết nối ẩn danh có thể gửi số đo giả) | **KHÔNG làm** trong 9 chặng; từ chặng 1 số kWh quyết định tiền nên đây là rủi ro còn mở, nêu rõ khi demo | — | báo PO trước 21/10 |
| Q8 | Phiên `COMPLETED` bị cờ `needs_review` chưa có thao tác gỡ | **Không làm** (ngoài 39 thẻ); ghi giới hạn trong bàn giao chặng 2/5 | 2, 5 | báo PO |
| Q9 | S-57 xoá dữ liệu cá nhân: giữ/xoá gì (Nghị định 13) | Ẩn danh hoá giữ sổ cái và doanh thu; **cần người có thẩm quyền xác nhận** — mình không đưa nhận định pháp lý | 5 | trước chặng 5 |
| Q10 | Kỳ kế toán | Theo tháng dương lịch; chỉ chốt tháng đã kết thúc | 5 | trước chặng 5 |
| Q11 | Cổng thanh toán | **Mô phỏng sandbox trong repo** (HMAC-SHA256 như cổng thật), không có tài khoản sandbox thật (R-02). Có tài khoản thật ⇒ thêm một chặng phụ | 4 | báo PO |
| Q12 | Giữ chỗ | «Giữ ngay lúc đặt» tới `bây giờ + thời gian tới + 15 phút`; chưa hỗ trợ khung giờ xa trong tương lai | 7 | trước chặng 7 |
| Q13 | Phí không đến, miễn lần đầu, huỷ miễn phí | Phí cấu hình theo trạm (mặc định 0), chụp lại lúc đặt; không miễn lần đầu; huỷ miễn phí tới hết hạn | 9 | trước chặng 9 |
| Q14 | Phí chiếm trụ có chia cho đối tác? | Có, cấu hình theo từng chủ trạm (`include_idle`, mặc định có) | 8 | trước chặng 8 |
| Q15 | CSV: cột, dấu phân cách | Cột theo JSON báo cáo; mặc định `;` ở giao diện, `,` ở API; **cần Nam mở thử bằng Excel thật** | 8 | trước chặng 8 |
| Q16 | Ngưỡng cảnh báo trụ, kênh | Ngoại tuyến 10 phút; ≥5 lỗi/30 phút; chỉ email (hàng đợi, gửi SMTP thật KHÔNG làm) | 8 | trước chặng 8 |
| Q17 | Một tài khoản mấy vai trò | Một | 8 | trước chặng 8 |
| Q18 | Gói tháng | Áp mọi trạm; chủ trạm gánh phần giảm giá; doanh thu bán gói chưa vào báo cáo | 9 | trước chặng 9 |
| Q19 | Hạn mức công suất thấp đến mức xe không sạc được | Chia đều có trần, không dừng phiên; nêu giới hạn | 6, 9 | trước chặng 6 |
| Q20 | Bản đồ | Không nhúng | 7 | — |

## 8. Rủi ro và điều CHƯA kiểm chứng

| # | Rủi ro / điều chưa biết | Mức | Cách giảm |
|---|---|---|---|
| 1 | **Nhịp 5×** lịch sử (mục 5.1) | Cao | Đo sau chặng 1; mốc quyết định 5.3; cắt từ cuối |
| 2 | **`agy` chưa chạy thật** với prompt dài; model mặc định là Flash; `DANH-GIA-AGY.md` chưa kiểm AGENTS.md có được bám không | Cao | Chạy chặng 1 làm thử có người ngồi cạnh; nếu agy bỏ sót mục, tách prompt theo thẻ (mục 5 của prompt có thể dán làm hai nửa); dùng mục C để tiếp tục |
| 3 | **Quota** `agy` cho 9 người, mỗi chặng ≈ 16–19 commit + chạy test nhiều lần — chưa có số chính thức | Cao | Mỗi người tài khoản riêng; báo ngay khi gần cạn; chặng dự phòng: dev chạy bằng công cụ khác (Copilot/Claude Code) với cùng prompt |
| 4 | **Một tester** là nút thắt (mỗi chặng 1–3 giờ) | Trung bình | AI-tester mục G chạy trước; Nam chỉ kiểm phần chạy thật + tự tính tay |
| 5 | Phải có **Docker** trên máy mỗi dev để `python test.py` | Trung bình | Ai không có ⇒ `npm test` + `TEST_DATABASE_URL`, hoặc nhờ máy khác; CI vẫn là chốt chặn |
| 6 | **Branch protection** chưa bắt buộc 3 check (Phúc đã hỏi 12/10; đang TẮT lúc kiểm) và merge method chưa chốt | Trung bình | Phúc bật *Require status checks* cho `lint-and-test`, `test-windows`, `session-scenario`; chốt merge commit/squash |
| 7 | Cổng thanh toán là **mô phỏng**, email chỉ ghi log, sao lưu tự động chỉ có tài liệu | Trung bình | Nói rõ khi demo; nêu trong `TONG-KET-DU-AN.md` |
| 8 | **Tiền sai một đồng**: hàm tính tiền và bảng chia doanh thu là lõi | Cao | Đáp án tay độc lập + người ký; test đột biến ở chặng 1; tester tự tính tay |
| 9 | `authenticate.js` (chặng 8) và `finalizeSession`, `rebalanceStation` (chặng 9) chạm đường nóng | Trung bình | Toàn bộ test cũ phải xanh không sửa; kiểm hồi quy trong phiếu tester |
| 10 | Xung đột khi hai chặng cùng sửa `permissions.js`/`router.js` (chỉ ở 5.4) | Thấp | Giải xung đột văn bản; chạy lại toàn bộ test |
| 11 | **Nghị định 13**: vị trí tài xế, xoá dữ liệu, log | Cao | Test log-hygiene, `POST` tìm trạm, ẩn danh hoá; **cần người có thẩm quyền xác nhận** phạm vi S-57 |
| 12 | `btree_gist` có sẵn ở CSDL triển khai không (chặng 7, 9) | Trung bình | Kiểm ở bước migration của CI và máy dev; thiếu ⇒ dừng, không đổi sang khoá trong bộ nhớ |
| 13 | AI làm báo cáo «xong 100%» không có bằng chứng (tiền lệ S-26) | Trung bình | Prompt bắt buộc dòng lệnh + kết quả; dev tự chạy lại `python test.py` (mục D); tester độc lập |
| 14 | Hai tệp ca tay do AI soạn nếu không có người thứ hai ký | Cao | Bước 0 bắt buộc |

## 9. Điều kiện hoàn thành dự án

1. 39 thẻ Done trong Jira theo bảng mục 4 (hoặc có ghi chú rõ phần bị cắt, nếu Phúc quyết cắt).
2. `main`: `python test.py` xanh; CI 3 job xanh; `session-scenario` xanh; `npm audit --omit=dev --audit-level=high` sạch.
3. `tools/demo-smoke.js` toàn PASS trên bản dữ liệu `seed-demo`.
4. Nam và Phúc chạy trọn `docs/demo/KICH-BAN-DEMO.md` một lần không lỗi chặn.
5. `docs/dev/TONG-KET-DU-AN.md` có bảng 39 thẻ ↔ test ↔ giới hạn, danh sách việc chưa làm, câu hỏi PO còn mở.
6. Khối «Xác nhận» của `ca-tinh-tay.md` đã ký; bảng đáp án các chặng khác đã có người tính lại.

## 10. Việc Phúc cần làm ngay (theo thứ tự)

1. Trả lời **Q0** (cuối tuần/buổi tối) và báo mentor/PO về mục 5 (thực tế chỉ chắc chắn đủ Must; đủ 39 thẻ cần K3).
2. Gán **người làm** và **tester** cho 9 chặng (cột «Người làm» ở mục 3). Mỗi người dùng tài khoản `agy` riêng; chạy bài kiểm tra 5 câu ở `docs/ai/PROMPTS.md` mục 0 nếu chưa chạy.
3. Làm **Bước 0** (mục 6) ngay tối nay: giao Nam tính lại C01–C17.
4. Bật *Require status checks to pass* cho 3 job và chốt cách merge (mục 8, rủi ro 6).
5. Đánh dấu hai tệp cũ `SPRINT_4_PLAN.md`, `SPRINT_4_THEO_S-XX.md` là **không dùng** (mình đã thêm banner trong Project; chưa đụng gì ngoài Project).
6. Chạy chặng 1 làm thử có người ngồi cạnh; sau chặng 1 báo mình số giờ thật để chỉnh lịch và prompt các chặng sau.
