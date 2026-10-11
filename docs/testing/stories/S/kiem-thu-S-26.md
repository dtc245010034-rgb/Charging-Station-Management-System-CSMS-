# BÁO CÁO NGHIỆM THU S-26 (GYM-52) — BỘ TRỤ ẢO VÀ CI

- **Ngày kiểm thử:** 11/10/2026
- **Phạm vi:** T-55 (Compose), T-46 (ngắt–nối), T-56 (CI)
- **Môi trường:** Docker Compose cô lập, PostgreSQL 16, app Node.js 22; không dùng ngrok hoặc dữ liệu thật
- **Simulator:** `ocpp-rpc` 2.2.1 (ghim trong `docs/spikes/k01/package-lock.json`)
- **Trạng thái:** đạt 2/3 tiêu chí kỹ thuật; yêu cầu nâng phiên bản chỉ bằng cách đổi tag Compose và cấu hình branch protection còn chờ xử lý

## 1. Lệnh kiểm thử

Môi trường kiểm thử dùng project Compose riêng, cổng host 25432 (PostgreSQL) và 23000 (app), tài khoản admin chỉ dùng trong DB thử. Trước kịch bản, tạo admin và seed thẻ demo để `TAG-DEMO-01` được kích hoạt.

```powershell
docker compose -p csms-s26-acceptance up --build --detach --wait app
docker compose -p csms-s26-acceptance exec -T -e ADMIN_EMAIL -e ADMIN_PASSWORD app npm run create-admin
docker compose -p csms-s26-acceptance exec -T -e ALLOW_DEMO_SEED=1 -e DEMO_PASSWORD=ci-only-demo-password app npm run seed-demo
docker compose -p csms-s26-acceptance --profile simulator up --build --detach --wait vcp
node tools/test-s21-reconnect-fleet.js --count 20 --drops 1-3 --seed 26026 --runs 1 --prefix S26-RUN-
docker compose -p csms-s26-acceptance --profile simulator down --volumes --remove-orphans
```

Các biến cấu hình được cấp trong môi trường kiểm thử:

```text
VCP_COUNT=20
VCP_PREFIX=VCP-
CSMS_URL=http://app:3000
STAGING_BASE_URL=http://127.0.0.1:23000
STAGING_DATABASE_URL=postgresql://csms:<test-password>@127.0.0.1:25432/csms
```

Lệnh CI tương ứng chạy 5 trụ, với prefix `CI-VCP-` cho dịch vụ simulator và `CI-S21-` cho fixture kịch bản:

```bash
node ../tools/test-s21-reconnect-fleet.js --count 5 --drops 1-3 --seed 26026 --runs 1 --prefix CI-S21-
```

## 2. Kết quả nghiệm thu ba tiêu chí

| Tiêu chí | Bằng chứng | Kết quả |
|---|---|---|
| Compose nhận số lượng cấu hình, trụ xuất hiện trực tuyến trong dashboard trong 1 phút | `docker compose ... up --wait vcp` báo container healthy; runner chờ API `/api/fleet-status` xác nhận toàn bộ 20 mã online. Container đã healthy khoảng 5 giây sau khi khởi động. | **ĐẠT — 20/20 trụ trực tuyến** |
| CI chạy sau test đơn vị và thất bại sẽ chặn merge | Job `session-scenario` khai báo `needs: lint-and-test`, timeout 5 phút; kiểm thử tương đương trên Docker local hoàn tất trong 57.78 giây. Kịch bản trả mã lỗi khi có lỗi OCPP hoặc phiên/kWh không khớp. | **ĐẠT về workflow/kịch bản.** Cần đặt tên check thành required trong branch protection; chưa thể xác minh cấu hình GitHub từ môi trường local. |
| Ghim phiên bản simulator; nâng cấp bằng cách chỉ đổi tag phiên bản trong Compose | Compose gắn tag image `csms-vcp:2.2.1`; `package-lock.json` ghim `ocpp-rpc` 2.2.1. Không thay đổi mã nghiệp vụ CSMS. Tuy nhiên, vì image được build từ source tại chỗ, nâng `ocpp-rpc` hiện cần cập nhật package manifest/lockfile cùng image tag. | **CHƯA ĐẠT HOÀN TOÀN.** Phiên bản hiện tại được ghim, nhưng cơ chế đổi phiên bản chỉ qua Compose tag chưa được triển khai. |

## 3. Đối chiếu phiên sạc 20 trụ

Seed ngẫu nhiên cố định: `26026`; mỗi trụ ngắt kết nối 1–3 lần. `Tx` là transaction/session ID do CSMS cấp. KWh mong đợi lấy từ chênh lệch meter của simulator; kWh CSMS lấy từ phiên đã lưu và phải bằng giá trị đó.

| Mã trụ | Tx | Lần ngắt | kWh simulator | kWh CSMS | Kết quả |
|---|---:|---:|---:|---:|---|
| S26-RUN-001 | 1 | 2 | 6.250 | 6.250 | PASS |
| S26-RUN-002 | 2 | 2 | 6.250 | 6.250 | PASS |
| S26-RUN-003 | 3 | 2 | 6.250 | 6.250 | PASS |
| S26-RUN-004 | 4 | 3 | 8.750 | 8.750 | PASS |
| S26-RUN-005 | 5 | 2 | 6.250 | 6.250 | PASS |
| S26-RUN-006 | 6 | 2 | 6.250 | 6.250 | PASS |
| S26-RUN-007 | 7 | 2 | 6.250 | 6.250 | PASS |
| S26-RUN-008 | 8 | 1 | 3.750 | 3.750 | PASS |
| S26-RUN-009 | 9 | 3 | 8.750 | 8.750 | PASS |
| S26-RUN-010 | 10 | 3 | 8.750 | 8.750 | PASS |
| S26-RUN-011 | 11 | 2 | 6.250 | 6.250 | PASS |
| S26-RUN-012 | 12 | 1 | 3.750 | 3.750 | PASS |
| S26-RUN-013 | 13 | 1 | 3.750 | 3.750 | PASS |
| S26-RUN-014 | 14 | 1 | 3.750 | 3.750 | PASS |
| S26-RUN-015 | 15 | 3 | 8.750 | 8.750 | PASS |
| S26-RUN-016 | 16 | 3 | 8.750 | 8.750 | PASS |
| S26-RUN-017 | 17 | 3 | 8.750 | 8.750 | PASS |
| S26-RUN-018 | 18 | 2 | 6.250 | 6.250 | PASS |
| S26-RUN-019 | 19 | 2 | 6.250 | 6.250 | PASS |
| S26-RUN-020 | 20 | 2 | 6.250 | 6.250 | PASS |

**Tổng:** 20/20 phiên hoàn tất, kWh simulator và CSMS khớp; `PASS: 20/20 sessions matched in 1/1 runs`.

## 4. Kiểm tra cấu hình CI 5 trụ

Chạy luồng Docker tương đương job `session-scenario`, gồm khởi động app, tạo admin, seed thẻ demo, bật 5 VCP và chạy lệnh CI ở mục 1:

- Seed `26026`; mã simulator `CI-VCP-001`…`CI-VCP-005`; mã fixture phiên `CI-S21-001`…`CI-S21-005`.
- Kết quả: **5/5 phiên PASS**, mọi giá trị kWh mong đợi khớp CSMS.
- Tổng thời gian từ lúc bắt đầu build/start tới khi scenario kết thúc: **57.78 giây**, dưới ngưỡng 5 phút.
- Đã chạy kiểm thử đơn vị S-21: **5/5 PASS**; `npm run lint`: **PASS**.
- Các container, network và volume của project kiểm thử đã được dừng và xóa sau khi chạy.

CI GitHub thực tế và tình huống cố ý làm hỏng phần khôi phục phiên chưa được chạy trong lần nghiệm thu local này. Bảo đảm chặn merge yêu cầu check `OCPP reconnect session scenario` phải được bật thành required trong branch protection.

Tiêu chí nâng phiên bản chỉ bằng tag Compose cũng còn mở: hiện simulator được build từ source trong repository, nên đổi tag image không tự nâng phiên bản `ocpp-rpc`. Cần chuyển sang image simulator đã publish theo tag hoặc thiết kế build argument/version mapping trước khi xác nhận AC này.
