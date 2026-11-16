# HƯỚNG DẪN VẬN HÀNH HỆ THỐNG SOÁT VÉ OFFLINE LAN
## Sự kiện: "Hùng Vương Concert: GAME ON"

> **Dành cho sự kiện:** 1 Cổng soát vé duy nhất • 1 Loại vé online • Chạy hoàn toàn Offline trong mạng LAN • **KHÔNG CẦN IP TĨNH** • Nhân viên chỉ quét mã QR để vào làm việc.

---

## MỤC LỤC
1. [Chọn 1 trong 2 mô hình mạng (Có Router hoặc Không Router)](#1-chọn-1-trong-2-mô-hình-mạng)
2. [Hướng dẫn cài đặt Modem / Router Wi-Fi chi tiết](#2-hướng-dẫn-cài-đặt-modem--router-wi-fi-chi-tiết)
3. [Mở Firewall Windows (Để điện thoại kết nối được Laptop)](#3-mở-firewall-windows-trên-laptop-server)
4. [Cài đặt & Khởi động hệ thống (3 bước siêu nhanh)](#4-cài-đặt--khởi-động-hệ-thống-3-bước-siêu-nhanh)
5. [Hướng dẫn nhân viên kết nối từ điện thoại (Chỉ quét QR, không gõ chữ)](#5-hướng-dẫn-nhân-viên-kết-nối-từ-điện-thoại)
6. [Quy tắc soát vé tại cổng & Xử lý tình huống](#6-quy-tắc-soát-vé-tại-cổng--xử-lý-tình-huống)
7. [Trang quản trị (Admin) & Xuất báo cáo sau sự kiện](#7-trang-quản-trị-admin--xuất-báo-cáo-sau-sự-kiện)
8. [Kế hoạch xử lý sự cố khẩn cấp (Troubleshooting)](#8-kế-hoạch-xử-lý-sự-cố-khẩn-cấp-troubleshooting)

---

## 1. CHỌN 1 TRONG 2 MÔ HÌNH MẠNG

Hệ thống hỗ trợ 2 cách triển khai mạng LAN tùy theo thiết bị bạn có:

```text
MÔ HÌNH A: DÙNG ROUTER WI-FI RIÊNG (Khuyên dùng cho sự kiện đông khách)
[ Router Wi-Fi cục bộ ] <----(Cáp LAN Gigabit)----> [ Laptop Server ]
         |
         +--- (Sóng Wi-Fi 5GHz) ---> [ Điện thoại Soát Vé 1 ]
         +--- (Sóng Wi-Fi 5GHz) ---> [ Điện thoại Soát Vé 2 ]
         +--- (Sóng Wi-Fi 5GHz) ---> [ Điện thoại Trưởng Cổng ]

MÔ HÌNH B: KHÔNG DÙNG ROUTER (Gọn nhẹ tối đa, dùng Mobile Hotspot trên Laptop)
[ Laptop Server tự phát Wi-Fi Hotspot ]
         |
         +--- (Wi-Fi Hotspot) ---> [ Điện thoại Soát Vé 1 ]
         +--- (Wi-Fi Hotspot) ---> [ Điện thoại Soát Vé 2 ]
```

---

## 2. HƯỚNG DẪN CÀI ĐẶT MODEM / ROUTER WI-FI CHI TIẾT

Nếu bạn dùng **Mô hình A (Router Wi-Fi ngoài)**, hãy làm theo các bước chuẩn kỹ thuật sau:

### Bước 2.1: Kết nối vật lý
1. Cắm nguồn điện cho Router Wi-Fi.
2. **TUYỆT ĐỐI KHÔNG CẮM DÂY MẠNG VÀO CỔNG WAN (màu xanh dương)**: Mục đích để cách ly hoàn toàn với Internet, tránh điện thoại tự tải bản cập nhật làm chậm mạng.
3. Cắm dây cáp mạng LAN từ Laptop vào một trong các **cổng LAN (màu vàng)** của Router.

### Bước 2.2: Đăng nhập trang quản trị Router
- Mở trình duyệt trên Laptop, gõ địa chỉ IP của Router: Thường là `192.168.1.1` hoặc `192.168.0.1` (xem nhãn dán dưới đáy router).
- Tên đăng nhập / Mật khẩu mặc định thường là: `admin` / `admin` (hoặc xem nhãn dưới đáy router).

### Bước 2.3: Ba mục bắt buộc phải cấu hình trên Router
1. **BẬT DHCP SERVER (Cấp IP tự động):**
   - Vào mục **Network** $\rightarrow$ **LAN** / **DHCP Server** $\rightarrow$ Chọn **Enable / Bật**.
   - Dải IP cấp phát: Để mặc định (ví dụ `192.168.1.100` đến `192.168.1.200`).
   - *Tác dụng:* Khi cắm Laptop hay kết nối điện thoại, Router tự cấp IP ngay lập tức, bạn **không cần cài đặt IP tĩnh thủ công**.
2. **TẮT AP ISOLATION / CLIENT ISOLATION (Cực kỳ quan trọng!):**
   - Vào mục **Wireless** $\rightarrow$ **Advanced Wireless Settings** (hoặc **Wireless Security**).
   - Tìm mục có tên: **AP Isolation**, **Station Isolation**, hoặc **Client Isolation**.
   - Chuyển sang: **Disabled / Tắt**.
   - *Lý do:* Nếu mục này bật (Enabled), Router sẽ cô lập các điện thoại, khiến điện thoại không thể kết nối tới Laptop Server. Tắt đi thì các máy mới liên lạc được với nhau trong mạng LAN.
3. **CẤU HÌNH SÓNG WI-FI TỐI ƯU:**
   - **Tên Wi-Fi (SSID):** Đặt tên rõ ràng, ví dụ `GAME_ON_SOATVE`.
   - **Chế độ ẩn SSID (Khuyên dùng):** Tích chọn **Hide SSID / Ẩn mạng Wi-Fi** để khán giả đứng gần cổng không nhìn thấy tên Wi-Fi để xin mật khẩu hoặc dò phá.
   - **Băng tần:** Nếu router hỗ trợ 2 băng tần, hãy bật băng tần **5GHz** (chuẩn AC hoặc AX). Băng tần 5GHz có tốc độ phản hồi cực nhanh (< 2ms) và không bị nhiễu sóng Bluetooth hay sóng đám đông.
   - **Mật khẩu:** Đặt chuẩn WPA2-PSK đơn giản cho nhân viên, ví dụ: `12345678`.

---

## 3. MỞ FIREWALL WINDOWS TRÊN LAPTOP SERVER

Để tường lửa của Windows không chặn kết nối từ điện thoại của nhân viên:

1. Bấm phím **Windows**, gõ **PowerShell**, chuột phải chọn **Run as Administrator** (Chạy với quyền Quản trị).
2. Dán dòng lệnh sau và bấm Enter:
```powershell
New-NetFirewallRule -DisplayName "SoatVe_LAN_443" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
New-NetFirewallRule -DisplayName "SoatVe_LAN_80" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
```
*(Lệnh này chỉ cần chạy 1 lần duy nhất trên máy tính chủ).*

---

## 4. CÀI ĐẶT & KHỞI ĐỘNG HỆ THỐNG (3 BƯỚC SIÊU NHANH)

### Bước 4.1: Cài đặt thư viện (nếu mới tải code về)
Mở cửa sổ dòng lệnh (Terminal / PowerShell) tại thư mục `e:\scanticket` và gõ:
```bash
npm install
```

### Bước 4.2: Nhập danh sách vé vào cơ sở dữ liệu
```bash
node import.js
```
- Hệ thống sẽ tự động tìm và nạp file `tickets_sample.json` (hoặc file vé chốt của bạn).
- In ra màn hình: Tổng số vé, số vé đã check-in, số vé còn lại.
- Dù bạn chạy lại lệnh này bao nhiêu lần cũng không bị mất dữ liệu vé đã soát.

### Bước 4.3: Khởi động Server soát vé
```bash
node server.js
```
Ngay lập tức, màn hình dòng lệnh của Laptop sẽ hiện **MÃ QR TERMINAL TO RÕ**:
- Tự động nhận diện IP LAN của laptop (ví dụ `192.168.168.9`).
- Tự động sinh chứng chỉ HTTPS cho chính IP đó.
- Hiển thị mã QR để quét ngay trên màn hình đen console!

---

## 5. HƯỚNG DẪN NHÂN VIÊN KẾT NỐI TỪ ĐIỆN THOẠI

Nhân viên **KHÔNG CẦN GÕ BẤT KỲ ĐỊA CHỈ IP NÀO**.

### Cách 1: Quét trực tiếp mã QR trên màn hình Laptop (Nhanh nhất)
1. Nhân viên kết nối điện thoại vào mạng Wi-Fi sự kiện.
2. Mở ứng dụng **Camera** trên điện thoại (hoặc mở Zalo / Chrome).
3. Đưa camera soi vào **Mã QR đang hiển thị trên màn hình Laptop**.
4. Bấm vào đường link hiện lên $\rightarrow$ Chọn **"Cho phép"** khi trình duyệt hỏi quyền Camera $\rightarrow$ Bắt đầu soát vé!

### Cách 2: In tờ hướng dẫn A4 dán tại bàn soát vé
Chạy lệnh tạo bảng hướng dẫn in ấn:
```bash
node make-staff-card.js
```
Hệ thống sẽ tạo ra file [data/huong-dan-nhan-vien.html](file:///e:/scanticket/data/huong-dan-nhan-vien.html). Bạn mở file này lên và bấm `Ctrl + P` in ra giấy A4 dán tại bàn soát vé:
- Nhân viên mới tới ca trực chỉ cần đưa điện thoại quét mã QR trên tờ giấy là vào việc ngay.

### Cách 3: Chia sẻ mã QR giữa các điện thoại
- Trên điện thoại của trưởng cổng (đã vào được app), bấm vào biểu tượng **📱** ở góc trên bên phải màn hình.
- Màn hình sẽ hiện lên mã QR to để nhân viên khác đứng cạnh dùng camera quét theo.

---

### XỬ LÝ CẢNH BÁO "KẾT NỐI KHÔNG RIÊNG TƯ" LẦN ĐẦU TRÊN ĐIỆN THOẠI:
Do đây là mạng LAN nội bộ không có Internet, trình duyệt sẽ hiện một thông báo bảo mật nhẹ ở lần đầu tiên mở link:
- **Trên Android (Chrome):** Bấm nút **"Nâng cao" (Advanced)** $\rightarrow$ Bấm dòng chữ nhỏ **"Tiếp tục truy cập 192.168.x.x (không an toàn)"**.
- **Trên iPhone (Safari):** Bấm nút **"Hiển thị chi tiết" (Show Details)** $\rightarrow$ Bấm dòng **"truy cập trang web này" (visit this website)** $\rightarrow$ Xác nhận bằng vân tay/FaceID.
*(Chỉ cần thao tác 1 lần duy nhất, các lần sau vào thẳng tức thì).*

---

## 6. QUY TẮC SOÁT VÉ TẠI CỔNG & XỬ LÝ TÌNH HUỐNG

Giao diện soát vé được thiết kế tối ưu dùng bằng 1 tay, phản hồi chỉ trong 0.1 giây:

| Màu màn hình | Âm thanh | Độ rung | Ý nghĩa | Hành động của nhân viên |
| :--- | :--- | :--- | :--- | :--- |
| **XANH LÁ CỰC TO**<br>`✔ CHO VÀO` | 2 tiếng bíp cao vui tươi | Rung 2 nhịp ngắn | Vé hợp lệ, chưa từng quét | Mời khách vào |
| **MÀU CAM NỔI BẬT**<br>`⚠ ĐÃ SỬ DỤNG` | Còi trầm cảnh báo | Rung dài cảnh báo | Vé đã bị quét trước đó | **GIỮ KHÁCH LẠI**, đối chiếu thông tin |
| **MÀU ĐỎ CẢNH BÁO**<br>`✖ VÉ BỊ HỦY / KHÔNG HỢP LỆ` | Còi gắt dồn dập | Rung liên tục | Vé bị hủy hoặc mã giả | **TỪ CHỐI**, hướng dẫn sang quầy hỗ trợ |

### Khi điện thoại của khách bị nứt vỡ hoặc camera không quét được QR:
1. Bấm vào nút **"🔍 Tra cứu thủ công"** ở góc dưới cùng màn hình.
2. Gõ Số điện thoại hoặc Họ tên của khách.
3. Khi tìm thấy thông tin khách, bấm nút **"CHO VÀO"** để check-in tay.

---

## 7. TRANG QUẢN TRỊ (ADMIN) & XUẤT BÁO CÁO SAU SỰ KIỆN

### Truy cập trang quản trị:
- Địa chỉ: `https://<IP-Laptop>/admin.html`
- Mã PIN mặc định: `123456`
- **Tính năng trên trang Admin:**
  - Theo dõi tổng số khách đã vào theo thời gian thực (realtime).
  - Xem danh sách 20 lượt quét gần nhất.
  - **Nút Hoàn tác (Undo):** Nếu nhân viên lỡ tay quét nhầm vé của khách, nhập mã vé và bấm Hoàn tác để trả vé về trạng thái chưa dùng.
  - **Nút Tải CSV / Tải JSON:** Xuất toàn bộ danh sách vé và thời gian check-in ra file Excel tiếng Việt (chuẩn UTF-8 không lỗi font).

### Hoặc xuất báo cáo bằng dòng lệnh sau sự kiện:
```bash
node export.js
```
File kết quả sẽ được lưu tại:
- `data/tickets_export.csv` (Mở trực tiếp bằng Microsoft Excel)
- `data/tickets_export.json` (Đầy đủ cấu trúc gốc kèm giờ vào)

---

## 8. KẾ HOẠCH XỬ LÝ SỰ CỐ KHẨN CẤP (TROUBLESHOOTING)

| Tình huống | Cách khắc phục tức thì |
| :--- | :--- |
| **Laptop bị sập nguồn / Hết pin** | 1. Cắm sạc và bật lại laptop.<br>2. Mở terminal gõ lại `node server.js`.<br>3. **Dữ liệu hoàn toàn an toàn 100%**: SQLite ở chế độ WAL tự phục hồi nguyên vẹn dữ liệu vé đã soát. |
| **Mất kết nối Wi-Fi giữa chừng** | Màn hình điện thoại soát vé sẽ hiện banner đỏ `⚠️ MẤT KẾT NỐI SERVER - TẠM DỪNG SOÁT VÉ!` và **chặn không cho quét tiếp**. Chỉ cần kiểm tra lại router hoặc kết nối lại Wi-Fi là hệ thống tự chạy tiếp. |
| **Khách quá đông làm nghẽn sóng 2.4GHz** | Chuyển điện thoại nhân viên sang bắt sóng Wi-Fi băng tần **5GHz** của router để không bị nhiễu bởi điện thoại của khán giả. |
| **Router Wi-Fi bị cháy / hỏng** | Bật ngay tính năng **Mobile Hotspot** trên Laptop Server để Laptop tự phát Wi-Fi cho các điện thoại kết nối vào. Không cần bất kỳ thiết bị mạng nào khác! |
