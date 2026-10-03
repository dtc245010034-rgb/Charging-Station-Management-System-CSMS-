# Kiểm tra bản đồ và giao diện trước/sau F2 (CLAUDE.md mục 4.2)

Ngày chạy: 03/10/2026. Kịch bản: `tools/verify-ui-round6.js` (Playwright + Chrome hệ thống, Node 22).

## Cách chạy lại

```bash
# Bản "trước": worktree từ main (có S-10, chưa có F2). Bản "sau": nhánh có F2 (verify/round6-local).
git worktree add --detach /tmp/csms-before main
ln -s "$PWD/backend/node_modules" /tmp/csms-before/backend/node_modules
UI_TARGETS="before=/tmp/csms-before,after=$PWD" \
PW_CORE=/duong/dan/node_modules/playwright-core CHROME_PATH=/usr/bin/google-chrome \
node tools/verify-ui-round6.js          # thoát mã 0 khi "sau" 0 FAIL và "trước" chỉ FAIL ở mục F2
```

Mỗi bản dùng server riêng, cổng trống, DB mới `csms_r6ui_<before|after>_chk` trên Postgres test 5433 (tạo rồi DROP
khi xong; đã kiểm không còn DB nào sót). Tài khoản admin sinh ngẫu nhiên khi chạy, không in ra, không ghi vào file.
Dữ liệu seed bằng SQL sau khi server khởi động (bản có N4 sẽ đưa trụ ONLINE mồ côi về UNKNOWN lúc khởi động):
8 trạm (7 có toạ độ, 1 không), 10 trụ, trong đó trụ ONLINE với đầu nối `OCCUPIED`, `ERROR`, `UNAVAILABLE`, `UNKNOWN`,
trụ `UNKNOWN`, và trạm Cần Thơ có 3 trụ (ready/fault/offline) để kiểm màu đại diện.

## Kết quả

| | Trước F2 (main) | Sau F2 |
|---|---|---|
| Tổng kiểm tra DOM | 121 | 121 |
| Đạt | 66 | **121** |
| FAIL | 55 (toàn bộ ở mục liên quan F2) | **0** |
| Lỗi JS / console / request hỏng sau đăng nhập | 0 | 0 |
| Request tile OSM bị chặn và thay bằng PNG 256×256 trong suốt | 37 | 37 |

Các kiểm tra (desktop 1280 px; mobile 390 px kiểm lại số marker, màu, nhãn, không tràn ngang):

| Mục | Trước | Sau |
|---|---|---|
| Số marker = số trạm có toạ độ (7), ghi chú "1 trạm chưa có toạ độ" | ok | ok |
| Chú giải đủ 5 nhóm; Leaflet khởi tạo, yêu cầu tile | ok | ok |
| Màu marker từng trạm (Hà Nội ready, Đà Nẵng charging, Huế fault, Nha Trang ready, Sài Gòn offline, Cần Thơ fault, Vũng Tàu ready) | 6/7 sai: mọi trạm có trụ ONLINE hiện offline | 7/7 đúng |
| Chấm màu panel danh sách trạm | 6/7 sai | 7/7 đúng |
| Bộ lọc trạng thái (4 nhóm) cho danh sách và marker | sai: "Sẵn sàng/Đang sạc/Lỗi" rỗng, "Ngoại tuyến" hiện cả 7 trạm | đúng |
| Tìm "Huế" → 1 marker | ok | ok |
| Bấm marker / bấm dòng danh sách → ngăn chi tiết đúng trạm, đầu nối hiện đúng giá trị gốc | ok | ok |
| Nhãn trụ trong ngăn chi tiết trạm | ONLINE hiện "Ngoại tuyến / chưa rõ" | "Sẵn sàng" / "Đang sạc" / "Lỗi" theo đầu nối |
| Tooltip giữ trạng thái gốc (`Trạng thái gốc: ONLINE`, `Available`, `Charging`...) | ok | ok |
| Màn danh sách trụ: nhãn, màu badge, bộ lọc 4 nhóm | 8/10 trụ sai, lọc sai | đúng |
| Ngăn chi tiết trụ: nhãn đầu ngăn, "Trạng thái gốc" = ONLINE, tooltip đầu nối | nhãn sai | đúng |
| KPI tổng quan: Tổng 10, Sẵn sàng 5, Đang sạc 1, Lỗi 2, Ngoại tuyến 2 | 0/0/0/10 | đúng |
| Không tràn ngang ở 390 px (bản đồ, danh sách trụ) | ok | ok |

Chi tiết từng kiểm tra (kỳ vọng/thực tế) nằm trong `results.json`.

## Ảnh chụp

`before-*.png` và `after-*.png`, mỗi cặp cùng dữ liệu:
`map-desktop`, `map-mobile`, `overview-desktop`, `overview-mobile`, `charge-points-desktop`, `charge-points-mobile`,
`station-drawer-charging-desktop`, `station-drawer-unavailable-desktop`, `station-drawer-mobile`,
`charge-point-drawer-charging-desktop`, `charge-point-drawer-unavailable-desktop`.

## Lỗi console

- Sau đăng nhập: 0 lỗi (kể cả không có lỗi tile, vì tile đã được thay bằng PNG trong suốt).
- Trước đăng nhập: mỗi khung nhìn có 1 dòng `Failed to load resource ... 401` từ lời gọi thăm dò phiên (`/api/auth/me`)
  của trang đăng nhập khi chưa có phiên. Đây là hành vi dự kiến, được loại khỏi phép kiểm "console sạch".

## Điều chưa kiểm chứng

- **Tile OSM thật chưa kiểm trên mạng có Internet.** Môi trường không ra được Internet nên request tile bị chặn và
  thay bằng ảnh trong suốt; chưa xác nhận tile thật hiển thị, CORS (`crossOrigin: true`) và tốc độ tải tile.
- Chỉ chạy Chrome (150) headless; chưa chạy Firefox/Safari. Chưa đo trên thiết bị thật.

## Bất thường của sản phẩm ghi nhận (chưa vá, cần PO/QA quyết định)

1. Trụ `ONLINE` mà mọi đầu nối đều `UNAVAILABLE` hoặc `UNKNOWN` hiện "Sẵn sàng" (xanh) vì `ONLINE` thuộc nhóm ready và
   `SEVERITY` xếp ready nặng hơn offline. Ảnh `after-charge-point-drawer-unavailable-desktop.png`: trụ "Sẵn sàng" nhưng cả
   hai đầu "Không khả dụng". Có thể gây hiểu nhầm là sạc được.
2. Nhãn đầu nối `UNAVAILABLE` là "Không khả dụng", trong khi mô tả F4 nêu nhãn "Tạm ngừng".
3. Trụ `UNKNOWN` hiện nhãn "Chưa rõ" (màu nhóm offline), khác nhãn nhóm "Ngoại tuyến / chưa rõ" ở chú giải và bộ lọc.
   Đây là hành vi đã có từ trước F2.
