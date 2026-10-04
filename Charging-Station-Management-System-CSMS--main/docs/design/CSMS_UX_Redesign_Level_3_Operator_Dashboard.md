# CSMS --- UX Redesign Level 3

## Operator Workspace --- Dashboard / Operations Center

**Design status:** Approved visual direction\
**Version:** UX Redesign v1.0\
**Implementation target:** Vanilla JS + ES Modules + CSS thuần\
**Theme:** Dark-first + Light Mode

------------------------------------------------------------------------

## 1. Mục tiêu

-   Clean, professional, vận hành thực tế.
-   Realtime-first cho Operator.
-   Chung Design System cho 5 role.
-   Multi-role ready.
-   Không thay đổi domain/backend chỉ vì UX.

## 2. App Shell

``` text
┌──────────────────────────────────────────────────────────────────────┐
│ SIDEBAR │ TOPBAR                                                    │
│         ├────────────────────────────────────────────────────────────┤
│         │ WORKSPACE HEADER                                           │
│         ├────────────────────────────────────────────────────────────┤
│         │ KPI CARDS                                                  │
│         ├───────────────────────────────────────┬────────────────────┤
│         │ MAP / NETWORK MONITORING              │ ALERTS & EVENTS    │
│         ├──────────────────────────┬────────────┼────────────────────┤
│         │ PERFORMANCE              │ STATUS     │ RECENT SESSIONS    │
│         │ ANALYTICS                │ BREAKDOWN  │                    │
│         └──────────────────────────┴────────────┴────────────────────┘
└──────────────────────────────────────────────────────────────────────┘
```

## 3. Operator Navigation

### Tổng quan

-   Tổng quan

### Vận hành

-   Trạm sạc
-   Trụ sạc
-   Phiên sạc
-   Cảnh báo
-   Điều khiển từ xa
-   OCPP
-   Nhật ký điều khiển

### Giám sát

-   Bản đồ
-   Sự cố
-   Hiệu suất

### Hệ thống

-   Người dùng
-   Nhật ký hệ thống
-   Cài đặt

## 4. Multi-role

Frontend không tiếp tục coi một account chỉ có một role.

``` js
currentUser = {
  id,
  email,
  roles: ["OPERATOR", "STATION_OWNER"],
  activeRole: "OPERATOR"
}
```

Role Switcher chỉ đổi workspace; backend vẫn là nguồn xác thực quyền.

## 5. Topbar

``` text
[⌕ Tìm trạm, trụ sạc, phiên sạc...  Ctrl + K]

                         [☀/☾] [🔔 3] │ [NA] Nguyễn Anh ▾
```

Có global search, theme switch, notification và user menu.

## 6. Dashboard Header

``` text
[OPERATOR]

Chào mừng, Nguyễn Anh!
Theo dõi và xử lý các sự kiện trạm sạc theo thời gian thực.

Thứ Hai, 21 Tháng 4, 2025
10:24
● Hệ thống hoạt động ổn định
```

## 7. KPI

-   Tổng số trụ
-   Đang sạc
-   Sẵn sàng
-   Cảnh báo
-   Lỗi
-   Ngoại tuyến

Không dùng toàn bộ card theo màu trạng thái; màu semantic chỉ làm
accent.

## 8. OCPP Status

Backend/domain giữ đủ 9 trạng thái OCPP 1.6J:

1.  Available
2.  Preparing
3.  Charging
4.  SuspendedEVSE
5.  SuspendedEV
6.  Finishing
7.  Reserved
8.  Unavailable
9.  Faulted

UI có thể gom nhóm để dễ đọc nhưng không thay đổi domain value.

## 9. Bản đồ trạm

Khu vực lớn nhất dashboard, gồm map, marker, legend, search, filter và
station list.

Legend:

``` text
● Sẵn sàng
● Đang sạc
● Cảnh báo
● Lỗi
● Ngoại tuyến
```

Click marker mở Station Detail Drawer thay vì chuyển trang ngay.

## 10. Alerts & Events

Hiển thị lỗi kết nối, phiên treo, nhiệt độ cao, khôi phục kết nối và
phiên kết thúc.

Severity chuẩn:

``` text
LOW
MEDIUM
HIGH
CRITICAL
```

Severity phải được xác định bởi business rule, không do UI tự suy đoán.

## 11. Hiệu suất

Chart cho:

-   Tổng phiên sạc.
-   Sản lượng kWh.
-   24 giờ / 7 ngày / 30 ngày.

Không hard-code dữ liệu production.

## 12. Trạng thái trụ

Donut chart tổng hợp trạng thái trụ. Click segment có thể lọc danh sách
trụ tương ứng.

## 13. Phiên sạc gần đây

Hiển thị session ID, trạm, kWh, chi phí và trạng thái. Click mở Session
Detail.

## 14. Realtime

``` text
OCPP / WebSocket
       ↓
Frontend state
       ↓
Chỉ cập nhật component bị ảnh hưởng
```

Không reload toàn dashboard khi một trụ đổi trạng thái.

## 15. Remote Control

Flow:

``` text
Charger Detail
      ↓
Actions
      ↓
Confirmation
      ↓
Backend authorization
      ↓
Audit log
```

Đã có: - Reset charger --- S-16 - Remote Stop --- S-23

Remote Start cho Operator là story mới và có điều kiện:

``` text
Operator
  ↓
Remote Start
  ↓
idTag của Driver
  ↓
Validate Driver
  ↓
Validate wallet / authorization hold
  ↓
Confirmation
  ↓
RemoteStartTransaction
  ↓
Audit log
```

Operator không tự start bằng tài khoản của mình.

## 16. Wallet

Đã chọn hướng:

``` text
Authorization Hold
      ↓
StartTransaction
      ↓
Charging
      ↓
StopTransaction
      ↓
meterStop
      ↓
Settlement
      ↓
Capture / Refund difference
```

UI phải phân biệt rõ tiền giữ, tiền sử dụng, tiền hoàn và thanh toán
cuối.

## 17. Reservation

Chưa đưa vào navigation vì E-07 chưa có story con/AC. Không tạo menu
Coming Soon chỉ để lấp IA.

## 18. Driver

Driver dùng mobile-first experience:

``` text
Tìm trạm
Đặt chỗ
Phiên sạc
Lịch sử
Ví
Tài khoản
```

Màn hình active charging ưu tiên kWh, thời gian, chi phí tạm tính, công
suất và CTA Dừng sạc.

## 19. Desktop / Mobile

-   Admin / Operator / Owner / Accountant: desktop-first.
-   Driver: mobile-first.

Driver không phải desktop page thu nhỏ.

## 20. Visual Direction

### Giữ

-   Navy/dark background.
-   Cyan/blue brand.
-   Subtle glow.
-   Rounded cards.
-   Thin borders.
-   Gradient CTA.
-   Status colors.
-   High information density.

### Giảm

-   Glow quá mạnh.
-   Glassmorphism quá mức.
-   Card lồng card.
-   Border ở mọi thành phần.
-   Gradient background nặng.
-   Typography quá lớn trong admin.
-   Decoration không phục vụ nghiệp vụ.

Mục tiêu: **Premium operations console --- không phải Dribbble
dashboard.**

## 21. Design Tokens

``` css
--bg-primary
--bg-secondary
--surface
--surface-elevated
--surface-hover

--border-subtle
--border-default
--border-strong

--text-primary
--text-secondary
--text-muted
--text-disabled

--brand-primary
--brand-secondary

--success
--info
--warning
--danger

--radius-sm: 8px
--radius-md: 12px
--radius-lg: 16px
--radius-xl: 20px
```

Dark và Light dùng chung semantic token system.

## 22. Frontend Architecture

Giữ Vanilla JS + ES Modules, chưa migrate React/Vite.

``` text
frontend/
├── app/
│   ├── router.js
│   ├── auth.js
│   ├── permissions.js
│   ├── workspace.js
│   └── state.js
├── components/
│   ├── sidebar/
│   ├── topbar/
│   ├── table/
│   ├── modal/
│   ├── drawer/
│   ├── badge/
│   ├── toast/
│   └── empty-state/
├── pages/
│   ├── admin/
│   ├── operator/
│   ├── owner/
│   ├── accountant/
│   └── driver/
├── services/
│   ├── api.js
│   └── websocket.js
├── styles/
│   ├── tokens.css
│   ├── reset.css
│   ├── layout.css
│   ├── components.css
│   └── themes.css
└── main.js
```

## 23. Implementation Priority

### P0 --- Foundation

-   Design tokens.
-   Theme system.
-   App Shell.
-   Sidebar.
-   Topbar.
-   Role Switcher.
-   Router refactor.
-   Auth state.
-   Permission helper.
-   Responsive base.

### P1 --- Operator

-   Dashboard.
-   Station list.
-   Charger list.
-   Charger detail.
-   Session detail.
-   Alerts.
-   Remote actions.
-   Audit log.
-   Realtime state.

### P2 --- Business roles

-   Station Owner workspace.
-   Accountant workspace.
-   Admin workspace.

### P3 --- Driver

-   Mobile-first Find Station.
-   Charger detail.
-   Start/Stop.
-   Active session.
-   Wallet.
-   Invoice.
-   GPS consent.

## 24. Không làm ở bước đầu

Không triển khai đồng thời: - Reservation UI. - Advanced analytics. -
Full chart library. - Complex map interactions. - Payment gateway UI
hoàn chỉnh. - OCPP simulator UI. - AI assistant. - Custom design-system
package.

## 25. Definition of Done

-   [ ] Light/Dark mode.
-   [ ] Responsive đúng với role.
-   [ ] Loading state.
-   [ ] Empty state.
-   [ ] Error state.
-   [ ] Success feedback.
-   [ ] Permission-aware action.
-   [ ] Không hard-code dữ liệu production.
-   [ ] Realtime không reload toàn trang.
-   [ ] Frontend không tự quyết authorization.
-   [ ] Keyboard/focus behavior cơ bản.
-   [ ] Status dùng semantic tokens.
-   [ ] Không phá OCPP domain status.
-   [ ] Remote actions có audit flow.

## 26. Visual Baseline đã duyệt

**CSMS --- Operator Operations Center Dashboard**

Đây là khung tham chiếu visual cho các màn hình tiếp theo:

1.  Operator Dashboard
2.  Station Management
3.  Station Detail
4.  Charger Management
5.  Charger Detail
6.  Charging Session Detail
7.  Alert Center
8.  Remote Control
9.  OCPP Monitor
10. Audit Log
11. Station Owner Dashboard
12. Accountant Dashboard
13. Admin Dashboard
14. Driver Mobile Home
15. Driver Active Charging
16. Driver Wallet
17. Driver Invoice

Các màn hình sau kế thừa Design System và App Shell; không copy
dashboard một cách máy móc.
