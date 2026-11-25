# TÀI LIỆU HƯỚNG DẪN TOÀN DIỆN HỆ THỐNG SOÁT VÉ OFFLINE LAN
## Sự kiện: HÙNG VƯƠNG CONCERT: GAME ON

Tài liệu này là **bộ instruction vận hành và kỹ thuật chính thức** cho toàn bộ hệ thống soát vé offline LAN (**SoatVe Hung Vuong Concert: GAME ON**), bao gồm: hướng dẫn cài đặt cho kỹ thuật viên, quy trình kết nối cho nhân viên, thao tác chi tiết từng tính năng trên web/mobile, hướng dẫn sử dụng cổng quản trị, đặc tả dữ liệu CSV/JSON, API hệ thống, kiểm thử tự động và quy trình ứng phó sự cố tại hiện trường.

---

## PHẦN 1. TỔNG QUAN KIẾN TRÚC & NGUYÊN LÝ HOẠT ĐỘNG

### 1.1. Mục tiêu thiết kế
- **Chạy hoàn toàn Offline trong mạng LAN / Wi-Fi nội bộ:** Không cần kết nối Internet khi diễn ra sự kiện, tránh nghẽn mạng 4G/Wi-Fi công cộng tại khu vực đông người.
- **Không cần đặt IP tĩnh cho máy chủ:** Mỗi khi khởi động, `server.js` tự động dò IP LAN chính xác của máy chủ, cập nhật chứng chỉ HTTPS (nếu IP chưa có trong SAN) và in mã QR truy cập ngay trên cửa sổ console.
- **Chống check-in trùng tuyệt đối giữa nhiều cổng:** Tất cả điện thoại kết nối về một máy chủ SQLite bật chế độ `WAL` (`journal_mode = WAL`, `synchronous = NORMAL`). Lệnh check-in sử dụng câu truy vấn nguyên tử:
  ```sql
  UPDATE tickets SET checked_in = 1, checked_at = ?, gate = ?
  WHERE code = ? AND checked_in = 0 AND status = 'VALID'
  ```
  Nếu 20 nhân viên quét cùng 1 mã vé tại cùng một mili-giây, chỉ đúng 1 thiết bị nhận kết quả `OK`, toàn bộ 19 thiết bị còn lại lập tức nhận `DUPLICATE` kèm thời gian và cổng đã soát trước đó.
- **Thuần cục bộ 100% (Zero External Assets):** Không gọi CDN, không tải Google Fonts, không tải file `.mp3/.wav` bên ngoài. Âm thanh phản hồi được tổng hợp trực tiếp bằng `WebAudio API`.

### 1.2. Cấu trúc mã nguồn và thư mục
```text
scanticket/
├── server.js                   # Máy chủ HTTPS/HTTP Express, API soát vé, SSL tự động, Auto Backup 5 phút
├── import.js                   # Module & CLI nhập vé từ JSON/CSV vào SQLite
├── export.js                   # Module & CLI xuất báo cáo JSON/CSV (có UTF-8 BOM + cột Ghi chú)
├── start.bat                   # Script khởi động 1-click trên Windows
├── start.sh                    # Script khởi động 1-click trên macOS / Linux
├── tickets_sample.json         # Dữ liệu vé mẫu để chạy thử và kiểm thử
├── package.json                # Khai báo dependencies & npm scripts
├── certs/
│   ├── cert.pem                # Chứng chỉ SSL tự ký phục vụ HTTPS cho Camera
│   └── key.pem                 # Khóa bí mật SSL
├── public/
│   ├── index.html              # Giao diện chính: Cổng soát vé (Desktop + Mobile Responsive)
│   ├── admin.html              # Giao diện Quản trị hệ thống (bảo vệ bằng PIN)
│   ├── test-qr.html            # Trang hiển thị bộ mã QR mẫu để test camera
│   └── html5-qrcode.min.js     # Thư viện giải mã QR cục bộ
├── scripts/
│   ├── make-staff-card.js      # Sinh phiếu hướng dẫn A4 dán bàn nhân viên (docs/huong-dan-nhan-vien.html)
│   └── make-test-qr.js         # Sinh file PNG & HTML bộ mã QR kiểm thử
├── docs/
│   ├── HUONG_DAN_HE_THONG.md   # Tài liệu instruction toàn diện hệ thống (file này)
│   ├── huong-dan-nhan-vien.html# Phiếu hướng dẫn A4 in dán tại cổng
│   └── diagrams/               # Sơ đồ luồng nghiệp vụ và kiến trúc hệ thống
├── data/
│   ├── tickets.db              # CSDL SQLite chính (tự tạo khi import/start)
│   ├── tickets.json            # File dữ liệu vé chuẩn cho bộ test
│   ├── backup/                 # Thư mục lưu tự động tối đa 20 bản sao lưu SQLite mỗi 5 phút
│   ├── screenshots/            # Ảnh chụp giao diện xuất ra từ test_ui.js
│   └── test_qrs/               # Ảnh QR mẫu phục vụ kiểm thử
└── tests/
    ├── test.js                 # Bộ kiểm thử lõi (6 bài test nghiệp vụ, concurrency, offline)
    ├── test_drive_specs.js     # Bộ kiểm thử đối chiếu 4 sơ đồ đặc tả
    └── test_ui.js              # Bộ kiểm thử UI tĩnh + Headless Chromium CDP (bao gồm camera stream & Flash)
```

---

## PHẦN 2. HƯỚNG DẪN CÀI ĐẶT & KHỞI ĐỘNG MÁY CHỦ (DÀNH CHO KỸ THUẬT VIÊN)

### 2.1. Chuẩn bị phần mềm trên Laptop Server
1. Cài đặt **Node.js LTS** (khuyến nghị bản 18.x, 20.x hoặc 22.x) từ `https://nodejs.org`.
2. Đảm bảo có **OpenSSL** nếu muốn máy chủ tự động tái tạo chứng chỉ SSL khi đổi IP mạng mới:
   - **macOS / Linux:** Có sẵn `openssl` trong hệ thống.
   - **Windows:** Cài *Git for Windows* (`C:\Program Files\Git\usr\bin\openssl.exe`) hoặc *OpenSSL Win64*; `server.js` tự động tìm kiếm ở cả `PATH` và các đường dẫn phổ biến.

### 2.2. Biến môi trường cấu hình (Tùy chọn)
| Biến | Mặc định | Mô tả |
| :--- | :--- | :--- |
| `PORT` | `443` | Cổng HTTPS chính. Khuyên giữ `443` để nhân viên không cần gõ số cổng trên URL. |
| `HTTP_PORT` | `80` | Cổng HTTP tự chuyển hướng 301 sang HTTPS (chỉ kích hoạt khi `PORT=443`). |
| `ADMIN_PIN` | `123456` | Mã PIN đăng nhập `/admin.html` và gọi các API quản trị (`/api/admin/*`, `/api/undo`, `/api/export`, `/api/backup/download`). **Nên đổi PIN trước khi chạy sự kiện thật.** |

Ví dụ đặt PIN riêng khi chạy trên Windows PowerShell:
```powershell
$env:ADMIN_PIN="889900"
node server.js
```
Trên macOS / Linux (nếu không chạy bằng `sudo` để mở cổng `443`, có thể dùng cổng `8443`):
```bash
ADMIN_PIN=889900 PORT=8443 node server.js
```

### 2.3. Mở Firewall & Thiết lập mạng LAN / Wi-Fi
1. **Mở cổng Firewall trên Windows** (chạy PowerShell bằng quyền **Administrator**, chỉ cần làm 1 lần):
   ```powershell
   New-NetFirewallRule -DisplayName "SoatVe_LAN_443" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
   New-NetFirewallRule -DisplayName "SoatVe_LAN_80" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
   ```
2. **Cấu hình Router Wi-Fi sự kiện:**
   - Cắm Laptop Server vào cổng **LAN** của Router (hoặc kết nối Wi-Fi cùng mạng, ưu tiên dây LAN cho Laptop để ổn định nhất).
   - Không cần cắm dây Internet vào cổng WAN.
   - Bật **DHCP Server** để Router tự cấp IP cho các điện thoại nhân viên.
   - **Bắt buộc TẮT tính năng `AP Isolation` / `Client Isolation` / `Wireless Isolation`** trong trang quản trị Router (nếu bật tính năng này, điện thoại sẽ không truy cập được vào Laptop Server).
   - Khuyến nghị dùng băng tần **5GHz** và đặt mật khẩu Wi-Fi riêng cho ban tổ chức để tránh khán giả kết nối làm nghẽn băng thông.
3. **Phương án dự phòng không có Router:** Bật tính năng **Mobile Hotspot** ngay trên Laptop Windows/macOS, kết nối điện thoại nhân viên vào Hotspot đó rồi khởi chạy `server.js`.

### 2.4. Khởi chạy Server
- **Cách 1 (1-Click):**
  - Windows: Nhấp đúp **`start.bat`**.
  - macOS/Linux: Chạy `chmod +x start.sh && ./start.sh`.
- **Cách 2 (Thủ công):**
  ```bash
  npm install
  node import.js <duong_dan_file_ve.csv_hoac_json>
  npm start
  ```
- Khi khởi động thành công, cửa sổ dòng lệnh hiển thị:
  - Địa chỉ IP LAN tự động (ví dụ `https://192.168.1.10`).
  - **Mã QR ngay trên terminal** để điện thoại quét trực tiếp.
  - Đường dẫn màn hình chia sẻ QR toàn trang: `https://<IP_LAN>/qr`.

### 2.5. In phiếu hướng dẫn dán tại bàn soát vé
Chạy lệnh sau sau khi đã kết nối vào mạng Wi-Fi sự kiện để tạo file A4 chứa đúng mã QR IP hiện tại:
```bash
npm run make-card
```
Mở file `docs/huong-dan-nhan-vien.html` bằng trình duyệt và nhấn `Ctrl + P` (`Cmd + P`) để in dán tại mỗi cổng.

---

## PHẦN 3. HƯỚNG DẪN KẾT NỐI TỪ ĐIỆN THOẠI NHÂN VIÊN

Trình duyệt di động (đặc biệt là Safari iOS và Chrome Android) **bắt buộc dùng HTTPS** mới cho phép mở Camera. Vì đây là mạng LAN offline nên chứng chỉ là chứng chỉ tự ký cục bộ; nhân viên chỉ cần xác nhận tin cậy **1 lần duy nhất** trên mỗi máy:

1. Kết nối điện thoại vào Wi-Fi nội bộ của sự kiện (tắt 4G/5G tạm thời nếu điện thoại tự đẩy lưu lượng LAN ra mạng di động).
2. Mở ứng dụng **Camera** mặc định (hoặc Zalo) soi vào mã QR trên Laptop hoặc trên trang `https://<IP_LAN>/qr`.
3. Chạm vào thông báo mở liên kết `https://<IP_LAN>`:
   - **Trên iPhone (Safari):**
     1. Nếu thấy màn hình *"Kết nối này không riêng tư"*, bấm **"Hiển thị chi tiết"** (*Show Details*).
     2. Bấm dòng **"Truy cập trang web này"** (*Visit this website*), sau đó bấm xác nhận trong hộp thoại hiện ra.
     3. Trang **Cổng soát vé** sẽ mở ra. Khi bấm nút **Cổng soát vé** lần đầu, chọn **"Cho phép"** (*Allow*) quyền truy cập Camera.
   - **Trên Android (Chrome):**
     1. Nếu thấy màn hình cảnh báo bảo mật, bấm **"Nâng cao"** (*Advanced*).
     2. Bấm **"Tiếp tục truy cập `<IP>` (không an toàn)"** (*Proceed to ...*).
     3. Khi bấm nút **Cổng soát vé** lần đầu, chọn **"Trong khi dùng ứng dụng"** (*While using the app* / *Allow*) để cấp quyền Camera.

> **Lưu ý quan trọng cho iPhone (Safari):**
> - Không mở trang soát vé bằng trình duyệt nhúng bên trong Zalo/Messenger; hãy bấm mở bằng **Safari** (trên iOS) hoặc **Chrome** (trên Android) để Camera và WebAudio hoạt động ổn định nhất.
> - Nếu lỡ bấm *"Từ chối"* quyền Camera trên Safari: bấm biểu tượng **`aA`** (hoặc biểu tượng cài đặt ở thanh địa chỉ) → **Cài đặt trang web** → **Camera** → chọn **Cho phép**, rồi tải lại trang.

---

## PHẦN 4. HƯỚNG DẪN SỬ DỤNG TRANG CHÍNH ("CỔNG SOÁT VÉ" - `/`)

### 4.1. Giao diện tổng quan & Thanh công cụ
- **Header GAME ON:** Hiển thị tên sự kiện và nút **Nhập danh sách** ở góc phải.
- **Hàng thao tác chính:**
  - **Cổng soát vé:** Mở giao diện Camera quét mã QR toàn màn hình.
  - **🔄 Tải lại:** Tải lại ngay thống kê và danh sách vé mới nhất từ máy chủ (kèm hiệu ứng xoay và thông báo *"Đã làm mới dữ liệu"*).
- **Dashboard 3 thẻ đếm (tương tác lọc trực tiếp):**
  - **Tất cả** *(mặc định)*: Tổng số vé trong CSDL.
  - **Đã soát:** Tổng số vé đã check-in (qua QR hoặc thủ công).
  - **Chưa soát:** Tổng số vé chưa check-in.
  - Nhấp vào từng thẻ để lọc bảng dữ liệu tương ứng. Ngoài ra, hệ thống tự động cập nhật lại 3 thẻ đếm mỗi **5 giây** khi không mở Camera.
- **Thanh tìm kiếm (`Tìm kiếm mã vé`):**
  - Nhập **Mã vé**, **Họ tên**, **Số điện thoại**, hoặc **Mã đơn hàng** rồi nhấn phím **Enter**.
  - Nếu không có kết quả khớp, hệ thống hiện thông báo *"Báo lỗi: Không tìm thấy vé trong hệ thống!"*.
  - Bấm dấu `✕` bên phải ô tìm kiếm để quay về danh sách đầy đủ.

### 4.2. Bảng danh sách vé & Thao tác trên từng vé
Bảng hiển thị phân trang mỗi **20 vé/trang** với **8 cột**:
`STT | Tên khách hàng | Email | Thời điểm mua vé | Mã vé | Số lượng vé | Trạng thái | Thời điểm check in`

1. **Xem chi tiết vé & Ghi chú (Note):**
   - Nhấp trực tiếp vào **Mã vé** màu đỏ (ví dụ `HVC-K2MJ8D-U754`) để mở modal **Chi tiết mã vé**.
   - Xem đầy đủ: Mã vé, Họ tên, Email, SĐT, Thời điểm mua vé, Mã đơn hàng, Thông tin thanh toán (PayOS/giá vé), Số lượng/Loại vé, Trạng thái, Thời điểm check-in và **Ghi chú**.
   - Bấm **✏ Sửa** cạnh dòng Ghi chú để nhập hoặc xóa ghi chú (ví dụ: `voucher nước`, `khách VIP`, `quà tặng áo`), hệ thống lưu ngay vào SQLite.
   - Bấm **Đóng bảng** hoặc `✕` để đóng modal.
2. **Thay đổi trạng thái thủ công (Check-in tay):**
   - Dùng khi khách làm mờ mã QR, vỡ màn hình hoặc hết pin nhưng đọc được mã/SĐT.
   - Nhấp vào nút **`Chưa soát ▼`** (hoặc **`Đã soát ▼`**) ở cột Trạng thái → xác nhận trong hộp thoại → hệ thống ghi nhận thời gian thực tế, lưu log cổng `"Thủ công"` và cập nhật bộ đếm ngay lập tức.

### 4.3. Nhập danh sách vé (`.csv` hoặc `.json`)
1. Nhấn **Nhập danh sách** ở góc trên bên phải.
2. Chọn file `.csv` hoặc `.json` từ máy tính/điện thoại → nhấn **Xác nhận**.
3. Hệ thống kiểm tra cấu trúc cột/JSON:
   - Nếu hợp lệ: Lưu toàn bộ vé vào CSDL, **bảo toàn trạng thái `checked_in = 1`** của các vé đã quét trước đó, cập nhật Dashboard và báo **"Nhập thành công"**.
   - Nếu file rỗng, sai JSON hoặc thiếu cột Mã vé: Báo **"File lỗi"**.

### 4.4. Quy trình Soát vé QR tốc độ cao & Đèn Flash
1. Nhấn **Cổng soát vé** → Camera bật toàn màn hình.
2. Đưa mã QR trên vé khách vào **khung ngắm vuông ở giữa màn hình** (`Đưa mã QR vào giữa khung`).
3. **Đặc tính tối ưu tốc độ & độ chính xác:**
   - Tần số giải mã **30fps**, chỉ bật bộ giải mã chuẩn `QR_CODE` (nhanh hơn 3–5 lần so với dò đa chuẩn mã vạch).
   - Video tự động cân tỉ lệ theo cảm biến camera gốc, **không bóp méo QR** và **không phóng to mất khung hình** trên camera HD/FullHD.
   - Camera tự động tạm dừng (`isScanPaused = true`) ngay khi bắt được mã để chống quét đúp.
4. **Đọc kết quả tức thì (1 giây/khách):**
   - **Hợp lệ:** Thẻ trượt màu **Xanh lá `"Thành công!"`**, âm bíp cao vui tai, rung nhẹ, hiện *Họ tên • Vé số • Mã vé*. Nếu vé có ghi chú, hiển thị nổi bật **thẻ vàng `"Ghi chú: ..."`** để nhân viên phát kèm voucher/quà tặng.
   - **Không hợp lệ:** Thẻ trượt màu **Đỏ `"Không hợp lệ"`**, âm trầm cảnh báo, rung cảnh báo kép, hiện rõ nguyên nhân:
     * *Vé đã dùng:* `"Vé đã được soát lúc <thời gian> (<Cổng>)"`.
     * *Vé đã hủy/hoàn tiền:* `"Vé không hợp lệ (Trạng thái: CANCELLED)"`.
     * *Vé giả/sai mã:* `"Mã vé không tồn tại trong hệ thống"`.
5. **Popup `"Quét mã tiếp theo?"`:**
   - Bấm **Xác nhận** để ẩn thẻ kết quả và tiếp tục quét người tiếp theo ngay lập tức.
   - Bấm **Thoát** (hoặc `✕` ở góc trên) để tắt Flash, giải phóng Camera và trở về danh sách (tự động đồng bộ số liệu mới).
6. **Thanh điều khiển ngón cái phía dưới:**
   - **⚡ Flash:** Bật/tắt đèn flash camera sau khi kiểm tra vé ở nơi tối. Khi bật, nút sáng vàng `"⚡ Đang bật Flash"`. Đèn tự động tắt khi bấm Thoát, đổi camera, chuyển ứng dụng hoặc khóa màn hình.
     * *Ghi chú kỹ thuật:* Hoạt động trực tiếp trên **Android Chrome** (và các trình duyệt hỗ trợ chuẩn WebRTC `ImageCapture torch`). Trên **iPhone Safari**, một số phiên bản iOS chưa mở API bật đèn pin từ trình duyệt web — nếu thiết bị không hỗ trợ, nút Flash không báo bật giả mà hiện toast hướng dẫn nhân viên bật đèn pin trong *Trung tâm điều khiển iOS*.
   - **🔄 Đổi Cam:** Tự động xuất hiện khi thiết bị có từ 2 camera trở lên để chuyển đổi camera trước/sau.
   - **✕ Thoát:** Đóng camera an toàn và cập nhật lại danh sách vé.

---

## PHẦN 5. HƯỚNG DẪN SỬ DỤNG TRANG QUẢN TRỊ (`/admin.html`)

Trang dành cho **Trưởng ban tổ chức / Kỹ thuật viên / Giám sát cổng**:

1. Truy cập `https://<IP_LAN>/admin.html`.
2. Nhập **Mã PIN quản trị** (mặc định `123456`, cấu hình qua biến `ADMIN_PIN`). PIN được lưu trong `sessionStorage` suốt phiên làm việc của tab trình duyệt.
3. **Theo dõi trực quan theo thời gian thực:**
   - **4 thẻ tổng quan:** Tổng vé hợp lệ, Đã check-in (kèm `%` khách đã vào), Chưa check-in, Tổng bản ghi vé (bao gồm cả vé hủy).
   - **Thống kê theo Cổng:** Số lượng vé đã soát theo từng cổng (`Cổng chính`, `Thủ công`, ...).
   - **20 Lượt Quét Gần Nhất:** Theo dõi lịch sử quét theo thời gian thực với nhãn màu `OK`, `DUPLICATE`, `UNDO`, `INVALID`, `NOT_VALID_STATUS`.
4. **Tra cứu & Hoàn tác (Undo):**
   - Tìm theo mã vé, họ tên, SĐT, mã đơn và lọc theo trạng thái (*Tất cả vé*, *Chưa check-in*, *Đã check-in*, *Vé hủy / không hợp lệ*).
   - Bấm **Hoàn tác** trên vé đã vào để đưa vé về trạng thái chưa check-in (mọi thao tác hoàn tác đều được ghi vào bảng `scan_log` với kết quả `UNDO`).
5. **Xuất báo cáo & Sao lưu thủ công:**
   - **📥 JSON:** Tải file `tickets_export.json` giữ nguyên cấu trúc gốc kèm trạng thái check-in, thời gian, cổng và ghi chú mới nhất.
   - **📊 CSV:** Tải file `tickets_export.csv` (chuẩn UTF-8 BOM mở thẳng bằng Microsoft Excel không lỗi font tiếng Việt).
   - **💾 Backup DB:** Tải ngay bản sao nhất quán của file `tickets.db` đang chạy (dùng SQLite Online Backup API, không làm khóa DB).

---

## PHẦN 6. ĐẶC TẢ DỮ LIỆU & TÀI LIỆU API HỆ THỐNG

### 6.1. Định dạng file Import CSV
File CSV (UTF-8 hoặc UTF-8 BOM, phân tách dấu phẩy `,`, hỗ trợ chuỗi trong ngoặc kép `"` theo RFC 4180) cần có dòng tiêu đề. Hệ thống tự động nhận diện linh hoạt tên cột (không phân biệt hoa/thường):

| Trường dữ liệu | Tên cột được hỗ trợ | Bắt buộc |
| :--- | :--- | :--- |
| **Mã vé** | `Mã vé`, `ticketCode`, `code`, `mã` | **Có** |
| **Họ tên** | `Họ tên`, `Tên khách hàng`, `Tên`, `customerName`, `name` | Không |
| **Số điện thoại** | `Số điện thoại`, `SĐT`, `phone`, `điện thoại` | Không |
| **Email** | `Email`, `thư điện tử` | Không |
| **Mã đơn hàng** | `Mã đơn hàng`, `orderId`, `đơn hàng` | Không |
| **Số lượng / STT vé** | `Số thứ tự vé`, `Số lượng vé`, `ticketLabel`, `label`, `vé số` | Không |
| **Loại vé** | `Loại vé`, `ticketTypeName`, `type` | Không |
| **Trạng thái vé** | `Trạng thái`, `status` (`VALID`, `CANCELLED`, ...) | Không (mặc định `VALID`) |
| **Đã check-in** | `Đã check-in`, `Đã soát`, `checkedIn`, `checked_in` (`1`/`true`/`đã...`) | Không |
| **Thời gian check-in** | `Thời gian check-in`, `Thời điểm check in`, `checkedInAt`, `checked_at` | Không |
| **Cổng soát vé** | `Cổng soát vé`, `Cổng vào`, `Cổng`, `gate` | Không |
| **Thời điểm mua vé** | `Thời điểm mua vé`, `Thời gian mua vé`, `issuedAt`, `purchaseTime`, `ngày mua` | Không |
| **Ghi chú** | `Ghi chú`, `note`, `voucher` | Không |

### 6.2. Định dạng file Import JSON
Hỗ trợ 3 cấu trúc JSON:
1. Object chuẩn `{ "tickets": { "HVC-001": { ... }, ... } }` (giống `tickets_sample.json` và file xuất ra từ `export.js`).
2. Mảng các đối tượng `[ { "ticketCode": "HVC-001", ... }, ... ]`.
3. Map trực tiếp `{ "HVC-001": { ... }, ... }`.

Các khóa hỗ trợ trên mỗi phần tử: `ticketCode`/`code`, `customerName`/`name`, `phone`, `email`, `orderId`/`order_id`, `ticketLabel`/`label`, `ticketTypeName`/`type`, `status`, `checkedIn`, `checkedInAt`, `gate`, `issuedAt`/`issued_at`, `note`/`notes`/`ghiChu`.

### 6.3. Danh sách REST API (`server.js`)

| Method | Endpoint | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/scan` | Công khai LAN | Quét check-in nguyên tử `{ code, gate }`. Trả về `OK`, `DUPLICATE`, `INVALID`, `NOT_VALID_STATUS`. |
| `POST` | `/api/manual-checkin` | Công khai LAN | Đổi trạng thái thủ công `{ code, gate, toggle }`. |
| `GET` | `/api/stats` | Công khai LAN | Thống kê `all`, `checked`, `unchecked`, `total`, `remaining`, `by_gate`, `recent_scans`. |
| `GET` | `/api/tickets` | Công khai LAN | Phân trang & lọc danh sách (`?status=all\|checked\|unchecked&search=&page=1&limit=20`). |
| `GET` | `/api/tickets/:code` | Công khai LAN | Chi tiết 1 mã vé kèm `paymentInfo` và `note`. |
| `POST` | `/api/tickets/:code/note` | Công khai LAN | Cập nhật ghi chú `{ note }`. |
| `POST` | `/api/import` | Công khai LAN | Nhập danh sách vé `{ filename, content }`. |
| `GET` | `/api/search?q=` | Công khai LAN | Tìm kiếm nhanh tối đa 20 vé khớp mã/tên/SĐT/mã đơn. |
| `GET` | `/api/system-info` | Công khai LAN | Lấy `primaryIp`, `primaryUrl`, `allIps`, `hostname`, `qrDataUrl`. |
| `GET` | `/qr` | Công khai LAN | Trang HTML hiển thị mã QR kết nối toàn màn hình. |
| `GET` | `/api/admin/tickets` | **PIN** (`x-admin-pin` / `?pin=`) | Danh sách vé quản trị lọc theo `all\|checked\|unchecked\|invalid`. |
| `POST` | `/api/undo` | **PIN** (`body.pin`) | Hoàn tác vé đã check-in `{ code, pin }`. |
| `GET` | `/api/export` | **PIN** (`x-admin-pin` / `?pin=`) | Tải file `tickets_export.json` hoặc `tickets_export.csv` (`?format=json\|csv`). |
| `GET` | `/api/backup/download` | **PIN** (`x-admin-pin` / `?pin=`) | Tải bản sao lưu SQLite `tickets.db` trực tiếp. |

---

## PHẦN 7. BỘ KIỂM THỬ TỰ ĐỘNG (AUTOMATED TESTING)

Trước mỗi lần triển khai hoặc cập nhật mã nguồn, chạy toàn bộ bộ test để xác minh hệ thống:

```bash
npm run test:all
```

Chi tiết 3 tầng kiểm thử:
1. **`npm test` (`tests/test.js`):**
   - Import dữ liệu mẫu & đối chiếu số lượng.
   - Kiểm tra phản hồi tuần tự: `OK`, `DUPLICATE`, `INVALID`, vé check-in sẵn, vé `CANCELLED` (`NOT_VALID_STATUS`).
   - Stress-test **20 request song song** cùng 1 mã vé (bắt buộc đúng `1 OK` và `19 DUPLICATE`).
   - Vé cùng đơn hàng (`Vé 1/2` và `Vé 2/2`) check-in độc lập.
   - Kiểm tra tính toàn vẹn Export → Re-import.
   - Xác minh không chứa bất kỳ liên kết Internet/CDN nào.
2. **`npm run test:specs` (`tests/test_drive_specs.js`):**
   - Đối chiếu đầy đủ 4 sơ đồ luồng nghiệp vụ: Import CSV/JSON hợp lệ & lỗi, Dashboard, Soát QR + Note + lỗi, Check-in thủ công, Lọc danh sách, Chi tiết vé.
3. **`npm run test:ui` (`tests/test_ui.js`):**
   - **Tier 1 (Static):** Viewport mobile, offline purity, bảo toàn toàn bộ DOM IDs, đồng bộ màu Crimson `#AF1C2B` & Blush `#FCF1F2` trên 4 file (`index.html`, `admin.html`, `test-qr.html`, `huong-dan-nhan-vien.html`), responsive media queries, viewport-fitted modals, touch target `>= 44px`.
   - **Tier 2 (Runtime Headless Chromium CDP):** Render thật trên Desktop (`1280x800`) và Mobile (`375x667`), kiểm tra modal bounding box, nút **Tải lại**, mô phỏng luồng video canvas stream thật quét QR đo thời gian nhận diện (`< 1500ms`), kiểm tra tỷ lệ cảm biến chống méo (`640x480` và `1280x720`), bật/tắt **⚡ Flash**, chống bật sáng giả khi thiết bị không hỗ trợ Torch, kiểm tra nút popup nằm gọn trong viewport và chụp ảnh xác minh vào `data/screenshots/`.

---

## PHẦN 8. QUY TRÌNH SAO LƯU & XỬ LÝ SỰ CỐ KHẨN CẤP

### 8.1. Cơ chế bảo vệ dữ liệu
- **SQLite WAL Mode:** Mọi lượt check-in được ghi ngay lập tức xuống đĩa an toàn.
- **Auto Backup 5 phút/lần:** Server tự sao lưu nóng vào `data/backup/tickets_backup_YYYYMMDD_HHMMSS.db` và tự động giữ tối đa 20 bản mới nhất.
- **Xuất dữ liệu cuối sự kiện:** Chạy `npm run export` (hoặc bấm nút JSON/CSV/Backup DB trong `/admin.html`) để lưu báo cáo tổng kết.

### 8.2. Bảng xử lý nhanh sự cố hiện trường
| Sự cố | Nguyên nhân thường gặp | Cách xử lý tức thì |
| :--- | :--- | :--- |
| Hiện banner đỏ `⚠ MẤT KẾT NỐI ĐẾN MÁY CHỦ` | Điện thoại rớt Wi-Fi hoặc đổi sang 4G | Kết nối lại đúng Wi-Fi sự kiện, tắt dữ liệu di động nếu cần, rồi bấm **🔄 Tải lại**. |
| Điện thoại không vào được `https://<IP>` | Firewall chặn hoặc Router bật AP Isolation | Mở Firewall cổng `443` & `80` trên Windows; tắt *AP/Client Isolation* trên Router. |
| Camera không bật trên iPhone Safari | Chưa tin cậy cert HTTPS hoặc chưa cấp quyền Camera | Mở lại bằng Safari (không dùng trình duyệt trong Zalo), tin cậy cert (`Hiển thị chi tiết -> Truy cập trang web này`), bật quyền Camera trong *Cài đặt → Safari*. |
| Nút **⚡ Flash** hiện thông báo không hỗ trợ trên iPhone | WebKit Safari iOS giới hạn API bật đèn pin qua web | Dùng tính năng **Đèn pin** trực tiếp từ *Trung tâm điều khiển* của iPhone (vuốt từ góc trên phải xuống). |
| Nhân viên lỡ check-in nhầm vé | Chạm nhầm hoặc quét nhầm vé | Trên bảng chính bấm **`Đã soát ▼`** → xác nhận hoàn tác; hoặc vào `/admin.html` bấm **Hoàn tác**. |
| Hỏng Router Wi-Fi giữa sự kiện | Thiết bị mạng treo hoặc mất nguồn | Bật **Mobile Hotspot** trên Laptop Server, cho điện thoại nhân viên bắt Wi-Fi Hotspot rồi khởi động lại `node server.js`. |
| Laptop Server tắt nguồn đột ngột | Sập nguồn / hết pin | Cắm sạc và chạy lại `start.bat` / `node server.js`. Dữ liệu kiểm soát trước đó được giữ nguyên 100% trong `data/tickets.db`. |
