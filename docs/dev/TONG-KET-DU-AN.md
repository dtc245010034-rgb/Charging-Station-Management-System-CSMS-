# Tổng kết dự án CSMS — bản bàn giao 21/10/2026

## Trạng thái

Đây là bản tổng kết kỹ thuật theo mã nguồn, bàn giao các giới hạn và bằng chứng hiện có; không phải xác nhận Done của Jira hoặc thông báo phát hành. Phần Chặng 9 đã được triển khai trên nhánh `dev` theo xác nhận của người dùng. **Chưa merge vào `main`, chưa push, chưa xác minh CI/GitHub hoặc trạng thái Jira.** Các bàn giao Chặng 1–8 được dẫn ở cuối bảng; kết quả kiểm thử trong phiên được ghi bên dưới.

Thanh toán chỉ ở sandbox. Không dùng dữ liệu cá nhân hoặc toạ độ thật trong seed/demo. Không có bằng chứng thử với trụ vật lý hoặc triển khai staging trong phiên này.

## 39 thẻ: kiểm thử tham chiếu và giới hạn

Danh mục/thẻ theo [`docs/KE_HOACH_DEN_HET_DU_AN.md`](../KE_HOACH_DEN_HET_DU_AN.md). Cột kiểm thử là bằng chứng trong repo, không đồng nghĩa tất cả các suite đã chạy lại trong phiên Chặng 9.

| Story / Jira | Kiểm thử tham chiếu | Giới hạn / trạng thái cần giữ rõ |
|---|---|---|
| S-28 / GYM-54 | `backend/tests/acceptance/S-28.tariff-declaration.test.js`; `backend/tests/integration/finalize-session.test.js` | Hoá đơn đã chốt là bất biến; chỉ sandbox. |
| S-29 / GYM-55 | `backend/tests/acceptance/S-29.tariff-periods.test.js` | Giá theo ngày và múi giờ của trạm; không xác minh với trụ vật lý. |
| S-30 / GYM-56 | `backend/tests/acceptance/S-30.price-session.test.js` | Đáp án tính tay độc lập vẫn cần người ký. |
| S-31 / GYM-57 | `backend/tests/acceptance/S-31.midnight.test.js` | Cần tiếp tục giữ kiểm thử ranh giới ngày/múi giờ. |
| S-32 / GYM-58 | `backend/tests/acceptance/S-32.hand-cases.test.js`; `backend/tests/fixtures/billing/hand-cases.json` | `docs/testing/billing/ca-tinh-tay.md` không tìm thấy ở lần kiểm tra trước; không tự tạo/sửa đáp án đã ký. |
| S-33 / GYM-59 | `backend/tests/acceptance/S-33.invoice-history.test.js` | Hoá đơn hiển thị theo snapshot đã lưu. |
| S-34 / GYM-60 | `backend/tests/acceptance/S-34.tariff-versioning.test.js` | Không thay đổi giá của hoá đơn cũ. |
| S-35 / GYM-61 | `backend/tests/acceptance/S-35.wallet-topup.test.js`; `backend/tests/integration/wallet-topup-api.test.js` | Cổng thanh toán chỉ là sandbox; chưa tích hợp provider thật. |
| S-36 / GYM-62 | `backend/tests/acceptance/S-36.wallet-topups.test.js`; `backend/tests/unit/wallet-admin-actions.test.js` | Nạp tay cần thao tác quản trị được phân quyền. |
| S-37 / GYM-63 | `backend/tests/integration/wallet-invoice-debit.test.js` | Trừ ví gắn với hoá đơn; tài khoản bị khoá được xử lý theo chính sách ledger. |
| S-38 / GYM-64 | `backend/tests/integration/wallet-min-balance.test.js`; `backend/tests/acceptance/S-15.authorize.test.js` | Chặn phiên mới theo ngưỡng; không cắt phiên đang chạy. |
| S-39 / GYM-65 | `backend/tests/acceptance/S-39.webhook-idempotency.test.js` | Webhook không phải giao dịch tiền thật. |
| S-40 / GYM-66 | `backend/tests/acceptance/S-40.wallet-read.test.js` | Chủ ví chỉ xem số dư/lịch sử của mình. |
| S-41 / GYM-67 | `backend/tests/integration/wallet-ledger.service.test.js`; `backend/tests/integration/wallet-ledger-concurrency.test.js` | Sổ cái ghi thêm; sửa lệch số dư theo quy trình kiểm toán, không sửa dòng cũ. |
| S-42 / GYM-68 | `backend/tests/acceptance/S-42.power-limit.test.js`; `backend/tests/integration/migrate-043-station-power.test.js` | Cần cấu hình đúng công suất danh định và kết nối trụ. |
| S-43 / GYM-69 | `backend/tests/acceptance/S-43.power-allocation.test.js` | Profile gửi thất bại/timeout không chứng minh giới hạn vật lý đã áp dụng. |
| S-44 / GYM-70 | `backend/tests/acceptance/S-44.power-rebalance.test.js`; `backend/tests/integration/power-rebalance.test.js` | Hiệu lực phụ thuộc OCPP trụ online và phản hồi profile. |
| S-45 / GYM-71 | `backend/tests/acceptance/S-45.power-windows.test.js`; `backend/tests/integration/migrate-052-station-power-windows.test.js` | Job quét theo chu kỳ; không dừng phiên khi hạ hạn mức. Cần thử ranh giới giờ trên simulator/trụ thật. |
| S-46 / GYM-72 | `backend/tests/acceptance/S-46.charge-point-health.test.js` | Cảnh báo không thay thế giám sát vận hành 24/7. |
| S-47 / GYM-73 | `backend/tests/acceptance/S-47.station-search.test.js` | Không nhúng bản đồ; vị trí là dữ liệu cá nhân. |
| S-48 / GYM-74 | `backend/tests/acceptance/S-48.reservation.test.js` | ReserveNow cần trụ online và đầu nối Available. |
| S-49 / GYM-75 | `backend/tests/acceptance/S-49.reservation-concurrency.test.js` | Cạnh tranh được chặn ở PostgreSQL; chưa thử tải trụ vật lý. |
| S-50 / GYM-76 | `backend/tests/acceptance/S-50-51.reservation-lifecycle.test.js`; `backend/tests/integration/migrate-053-reservation-cancellation-queue.test.js` | Phí vắng mặt 20.000 đ, kể cả khi ví bị khoá; lệnh huỷ có thể còn chờ/thử lại khi trụ offline/timeout. |
| S-51 / GYM-77 | `backend/tests/acceptance/S-50-51.reservation-lifecycle.test.js` | Huỷ miễn phí khi còn ACCEPTED và trước `expires_at`; tranh chấp với job được xử lý ở DB. |
| S-52 / GYM-78 | `backend/tests/acceptance/S-52.revenue-report.test.js` | Doanh thu gói VIP chưa được phân bổ vào báo cáo doanh thu trạm. |
| S-53 / GYM-79 | `backend/tests/acceptance/S-53.reconciliation.test.js` | Sai lệch đối soát cần được người có quyền xử lý. |
| S-54 / GYM-80 | `backend/tests/acceptance/S-54.revenue-sharing.test.js` | Bảng kê dựa trên tỷ lệ đã cấu hình; không xác nhận chi trả ngoài hệ thống. |
| S-55 / GYM-81 | `backend/tests/acceptance/S-55.periods.test.js` | Kỳ đã khoá cần quy trình điều chỉnh được kiểm toán. |
| S-56 / GYM-82 | `backend/tests/acceptance/S-56.audit-driver-filter.test.js`; `backend/tests/acceptance/S-56.wallet-admin-actions.test.js` | Nhật ký có thể chứa dữ liệu cần bảo vệ; tuân thủ chính sách lưu trữ. |
| S-57 / GYM-83 | `backend/tests/acceptance/S-57.data-erasure.test.js` | Phạm vi và thời hạn xoá cần người có thẩm quyền xác nhận theo Nghị định 13/2023. |
| S-58 / GYM-84 | `backend/tests/acceptance/S-58.csv-export.test.js` | Tệp CSV có thể chứa dữ liệu vận hành; chia sẻ theo quyền tối thiểu. |
| S-59 / GYM-85 | `backend/tests/acceptance/S-59.notifications.test.js` | Email đang ghi log; chưa có SMTP thật. |
| S-60 / GYM-86 | `backend/tests/acceptance/S-60.change-configuration.test.js` | Trụ có thể từ chối hoặc yêu cầu khởi động lại; cần xác minh phản hồi thực tế. |
| S-61 / GYM-87 | `backend/tests/acceptance/S-61.account-management.test.js` | Thay đổi vai trò có hiệu lực theo vòng đời phiên đăng nhập/JWT. |
| S-62 / GYM-88 | `tools/test_backup_scripts.py`; `tools/backup-db.sh`; `tools/backup-restore-drill.sh` | Script backup/restore không tự chứng minh lịch chạy hằng ngày đã được cài ở môi trường triển khai. |
| S-63 / GYM-89 | `backend/tests/acceptance/S-63.health-overview.test.js` | Metrics là quan sát theo cửa sổ lưu trữ, không phải dịch vụ giám sát ngoài. |
| S-64 / GYM-90 | `backend/tests/acceptance/S-64.session-history.test.js` | Lịch sử phải tuân thủ giới hạn truy cập dữ liệu tài xế. |
| S-65 / GYM-91 | `backend/tests/acceptance/S-65.subscription.test.js`; `backend/tests/integration/migrate-054-monthly-subscriptions.test.js` | VIP toàn hệ thống: 299.000 đ/30 ngày, 30.000 đ/kWh; doanh thu bán gói chưa vào báo cáo trạm. |
| S-66 / GYM-92 | `backend/tests/acceptance/S-66.station-operating.test.js` | Trạm tạm ngừng không nhận phiên/đặt chỗ mới; không tự kết thúc phiên đang chạy. |

## Chặng 9 và bộ demo

- S-45, S-50, S-51, S-65 có acceptance tests nêu AC; migration 052–054 có kiểm tra tiến/lùi tương ứng.
- `tools/demo-smoke.js` kiểm tra API đang chạy sau khi `seed-demo` tạo tài khoản, lịch hạn mức, ví và VIP.
- Kịch bản demo là [`docs/demo/KICH-BAN-DEMO.md`](../demo/KICH-BAN-DEMO.md). Chạy với tài khoản demo; không dùng môi trường dữ liệu thật.
- Các bàn giao kỹ thuật trước đây: [`CHANG-01`](./CHANG-01_2026-10-13.md), [`CHANG-02`](./CHANG-02_2026-10-13.md), [`CHANG-03`](./CHANG-03_2026-10-14.md), [`CHANG-04`](./CHANG-04_2026-10-15.md), [`CHANG-05`](./CHANG-05_2026-10-16.md), [`CHANG-06`](./CHANG-06_2026-10-16.md), [`CHANG-07`](./CHANG-07_2026-10-17.md), [`CHANG-08`](./CHANG-08_2026-10-18.md).

## Kiểm thử trong phiên Chặng 9

| Lệnh | Kết quả |
|---|---|
| `python test.py --file tests/acceptance/S-65.subscription.test.js` | ĐẠT — 3 test pass, 0 fail |
| `python test.py --file tests/integration/migrate-054-monthly-subscriptions.test.js` | ĐẠT — 2 test pass, 0 fail |
| `python test.py --file tests/integration/migrate.test.js` | ĐẠT — 3 test pass, 0 fail |
| `python test.py --file tests/integration/migrate-045-zero-power.test.js` | ĐẠT — 1 test pass, 0 fail |
| `python test.py --file tests/integration/migrate-048-settlements.test.js` | ĐẠT — 3 test pass, 0 fail |
| `python test.py --file tests/integration/seed-demo.test.js` | ĐẠT — 7 test pass, 0 fail |
| `python test.py` | ĐẠT — 1175 test pass, 0 fail; `run.py` tự kiểm `OK (skipped=1)` |

## Điều kiện đóng dự án chưa được xác nhận

1. Chưa có bằng chứng trong phiên này rằng 39 thẻ đã chuyển Done trong Jira.
2. Chưa có bằng chứng CI ba job, `session-scenario`, staging hoặc trụ vật lý.
3. `docs/testing/billing/ca-tinh-tay.md` chưa tìm thấy ở lần kiểm tra trước; không thay đổi tài liệu/fixture được người thứ hai ký.
4. Chưa có xác nhận độc lập của Nam và Phúc chạy trọn kịch bản demo.
5. Người dùng đã xác nhận phí vắng mặt vẫn được ghi khi ví bị khoá. Còn cần hoàn tất xem xét quyền riêng tư và quyết định những phần chưa làm trước khi tuyên bố đóng dự án.
