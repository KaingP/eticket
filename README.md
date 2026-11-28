# HÙNG VƯƠNG CONCERT: GAME ON — HỆ THỐNG SOÁT VÉ OFFLINE LAN

> **Đặc tả hệ thống:** Giao diện **Cổng soát vé** chuẩn nhận diện Đỏ Crimson `#AF1C2B` & Hồng Blush `#FCF1F2` • Chạy hoàn toàn **Offline trong mạng LAN** • **Không cần cài đặt IP tĩnh** • Hỗ trợ quét QR tốc độ cao `30fps` kèm đèn **⚡ Flash** & tối ưu ổn định cho **iPhone Safari / Android Chrome**.

**Phiên bản:** 1.1.0 — xem [CHANGELOG.md](CHANGELOG.md)

### ✅ Checklist trước giờ mở cổng
1. Trên laptop máy chủ: xóa `data/tickets.db*` và `data/backup/` nếu còn dữ liệu chạy thử.
2. Chạy `start.bat` (Windows) hoặc `./start.sh` (macOS/Linux).
3. Bấm **"Nhập danh sách"** trên trang chính → chọn file vé thật xuất từ PayOS (`.json` / `.csv`), kiểm tra số vé trên Dashboard.
4. Đặt mã PIN quản trị riêng bằng biến môi trường `ADMIN_PIN` (không dùng mặc định `123456`). Windows: mở CMD trong thư mục dự án, gõ `set ADMIN_PIN=<mã của bạn>` rồi chạy `start.bat` ngay trong cửa sổ đó.
5. Nhân viên kết nối Wi-Fi sự kiện, quét mã QR trên màn hình máy chủ, chấp nhận cảnh báo chứng chỉ, thử quét 1 vé.
6. Nếu đổi modem / bật Hotspot: khởi động lại server, nhân viên quét lại QR mới.

---

## MỤC LỤC
1. [Kiến trúc & Tính năng nổi bật](#1-kiến-trúc--tính-năng-nổi-bật)
2. [Cài đặt & Khởi động nhanh (1-Click / CLI)](#2-cài-đặt--khởi-động-nhanh)
3. [Hướng dẫn nhân viên kết nối bằng điện thoại](#3-hướng-dẫn-nhân-viên-kết-nối-bằng-điện-thoại)
4. [Hướng dẫn vận hành chi tiết](#4-hướng-dẫn-vận-hành-chi-tiết)
5. [Trang Quản trị (/admin.html) & Bảo mật PIN](#5-trang-quản-trị-adminhtml--bảo-mật-pin)
6. [Cấu hình Router Wi-Fi, SSL & Mở Firewall](#6-cấu-hình-router-wi-fi-ssl--mở-firewall)
7. [Kiểm thử tự động & Xuất báo cáo](#7-kiểm-thử-tự-động--xuất-báo-cáo)
8. [Xử lý sự cố khẩn cấp (Troubleshooting)](#8-xử-lý-sự-cố-khẩn-cấp-troubleshooting)

> 📘 **Tài liệu hướng dẫn hệ thống đầy đủ (Full System Manual + API + Schema):** Xem chi tiết tại [docs/HUONG_DAN_HE_THONG.md](docs/HUONG_DAN_HE_THONG.md).

---

## 1. KIẾN TRÚC & TÍNH NĂNG NỔI BẬT

- **100% Offline LAN:** Toàn bộ HTML/CSS/JS, thư viện `html5-qrcode.min.js`, tạo QR (`qrcode`), CSDL `SQLite` (WAL mode) và âm thanh phản hồi (`WebAudio API`) đều chạy cục bộ, không tải bất kỳ tài nguyên ngoài Internet nào.
- **Chống vào trùng tuyệt đối (Atomic Check-in):** Sử dụng `UPDATE tickets SET checked_in = 1 ... WHERE code = ? AND checked_in = 0 AND status = 'VALID'` trên SQLite WAL nên nhiều điện thoại quét cùng lúc vào 1 vé chỉ có **duy nhất 1 lượt hợp lệ**.
- **Giao diện đồng bộ "HÙNG VƯƠNG CONCERT: GAME ON":**
  - **Trang chính (`/`):** Header đỏ Crimson `#AF1C2B`, nút **Cổng soát vé**, nút **🔄 Tải lại**, nút **Nhập danh sách** (`.csv` / `.json`), 3 thẻ đếm **Tất cả / Đã soát / Chưa soát**, ô **Tìm kiếm mã vé**, bảng vé **8 cột** chuẩn mockup (`STT | Tên khách hàng | Email | Thời điểm mua vé | Mã vé | Số lượng vé | Trạng thái | Thời điểm check in`), modal **Chi tiết mã vé** kèm sửa **Ghi chú (Note)**.
  - **Trình quét Camera QR tốc độ cao:** Tần số quét `30fps`, chỉ giải mã chuẩn `QR_CODE`, tự động lấy nét liên tục trên Android, tắt bước lật ảnh thừa ở camera sau, giữ tỉ lệ cảm biến gốc chống méo QR, hỗ trợ bật/tắt **⚡ Flash**, **🔄 Đổi Cam** (khi có ≥ 2 camera), tự tắt Flash khi thoát hoặc chuyển ứng dụng.
  - **Tương thích ổn định trên iPhone Safari:** Giữ nguyên ngữ cảnh chạm của người dùng khi gọi `getUserMedia`, không mở luồng camera thứ hai gây đen màn hình, tắt `BarcodeDetector` thử nghiệm trên WebKit iOS, và tự động co giãn video vừa khung không phóng to quá khổ.
  - **Trang QR kết nối (`/qr`):** Hiển thị mã QR lớn để nhân viên quét mở app ngay.
  - **Trang Quản trị (`/admin.html`):** Xác thực PIN, thống kê theo cổng, 20 lượt quét gần nhất, hoàn tác check-in, xuất JSON/CSV và tải bản sao lưu SQLite `.db`.
  - **Trang QR kiểm thử (`/test-qr.html`):** Sinh sẵn bộ mã QR mẫu (vé hợp lệ có ghi chú, vé đã vào, vé bị hủy, mã giả) để test trực tiếp.

---

## 2. CÀI ĐẶT & KHỞI ĐỘNG NHANH

### Yêu cầu môi trường
- **Node.js LTS** (khuyến nghị Node 18+ hoặc 20+).
- **OpenSSL** (có sẵn trên macOS/Linux hoặc đi kèm Git for Windows / OpenSSL-Win64 nếu cần tự động tạo SSL theo IP mới).

### Cách 1: Khởi động 1-Click (Khuyên dùng)
- **Trên Windows:** Click đúp vào file **`start.bat`**.
  - Tự động kiểm tra Node.js.
  - Tự động cài đặt thư viện (`npm install --omit=dev`) nếu chưa có `node_modules`.
  - Nếu chưa có `data/tickets.db` sẽ nhắc nhập file vé thật (hệ thống **không** kèm dữ liệu mẫu).
  - Tự động kiểm tra/cập nhật chứng chỉ SSL theo IP LAN, khởi chạy máy chủ và in **mã QR truy cập** ngay trên màn hình console.
- **Trên macOS / Linux:**
  ```bash
  chmod +x start.sh && ./start.sh
  ```

### Cách 2: Khởi động thủ công bằng dòng lệnh
```bash
# Bước 1: Cài đặt thư viện (chỉ chạy 1 lần)
npm install

# Bước 2: Nhập danh sách vé thật (CSV hoặc JSON)
node import.js duong-dan/file-ve-payos.json

# Bước 3: Khởi động Server soát vé
npm start
```
*(Ghi chú: Trên macOS/Linux không chạy quyền root, có thể chạy cổng cao hơn như `PORT=8443 node server.js`)*

---

## 3. HƯỚNG DẪN NHÂN VIÊN KẾT NỐI BẰNG ĐIỆN THOẠI

Nhân viên **không cần nhớ hay gõ địa chỉ IP**:
1. Kết nối điện thoại vào đúng mạng Wi-Fi sự kiện (hoặc Wi-Fi Hotspot do Laptop Server phát).
2. Mở ứng dụng **Camera** (hoặc Zalo) quét **Mã QR** hiển thị trên cửa sổ console Laptop (hoặc mở `https://<IP_LAN>/qr` trên màn hình Laptop).
3. Chạm vào đường dẫn `https://<IP_LAN>` vừa hiện lên để mở bằng trình duyệt:
   - **iPhone (Safari):** Nếu hiện cảnh báo chứng chỉ nội bộ, bấm **"Hiển thị chi tiết" (Show Details)** → **"Truy cập trang web này" (Visit this website)** → xác nhận.
   - **Android (Chrome):** Bấm **"Nâng cao" (Advanced)** → **"Tiếp tục truy cập (không an toàn)"**.
4. Khi bấm **Cổng soát vé** lần đầu, chọn **"Cho phép" (Allow)** quyền Camera.

---

## 4. HƯỚNG DẪN VẬN HÀNH CHI TIẾT

### A. Quản lý danh sách vé (Trang chính `/`)
1. **Nhập danh sách:** Bấm **Nhập danh sách** (góc trên bên phải) → chọn file `.csv` hoặc `.json` → bấm **Xác nhận**.
   - Nếu hợp lệ: Lưu/cập nhật vào DB (bảo toàn các vé đã check-in trước đó) và báo **"Nhập thành công"**.
   - Nếu sai định dạng / thiếu cột Mã vé: Báo **"File lỗi"**.
2. **Làm mới dữ liệu:** Bấm nút **🔄 Tải lại** ngay cạnh nút **Cổng soát vé** để đồng bộ tức thì số liệu Dashboard và bảng vé.
3. **Lọc theo Dashboard:** Nhấp trực tiếp vào 3 thẻ **Tất cả**, **Đã soát**, **Chưa soát**.
4. **Tìm kiếm mã vé:** Nhập mã vé, họ tên, SĐT hoặc mã đơn vào ô **"Tìm kiếm mã vé"** và nhấn **Enter** (bấm `✕` để xóa tìm kiếm).
5. **Xem chi tiết & Sửa ghi chú:** Nhấp vào **Mã vé** màu đỏ trong bảng để mở popup **Chi tiết mã vé**. Tại dòng **Ghi chú (Note)**, bấm **✏ Sửa** để thêm hoặc cập nhật ghi chú (ví dụ: `voucher nước`, `quà tặng áo`).
6. **Check-in / Hoàn tác thủ công:** Nhấp vào nút **`Chưa soát ▼`** hoặc **`Đã soát ▼`** ở cột Trạng thái và xác nhận (dùng khi điện thoại khách bị nứt vỡ không quét được mã QR).

### B. Soát vé bằng Camera QR
1. Bấm **Cổng soát vé** để mở giao diện quét toàn màn hình.
2. Đưa mã QR của khách vào khung ngắm giữa màn hình:
   - **Hợp lệ:** Màn hình kết quả bật màu **Xanh lá `"Thành công!"`**, phát tiếng bíp cao, rung ngắn, hiện tên khách, loại vé, mã vé và **huy hiệu Ghi chú màu vàng** (nếu vé có ghi chú/quà tặng).
   - **Không hợp lệ:** Màn hình kết quả bật màu **Đỏ `"Không hợp lệ"`**, phát âm trầm cảnh báo, rung dài và ghi rõ lý do (`Vé đã được soát lúc ...`, `Vé không hợp lệ (Trạng thái: CANCELLED)`, hoặc `Mã vé không tồn tại trong hệ thống`).
3. Trên popup **"Quét mã tiếp theo?"**:
   - Bấm **Xác nhận** để tiếp tục quét khách kế tiếp ngay.
   - Bấm **Thoát** để tắt đèn Flash, đóng camera và tự động cập nhật lại bảng dữ liệu.
4. **Sử dụng ⚡ Flash & 🔄 Đổi Cam:**
   - Khi thiếu sáng, bấm **⚡ Flash** ở thanh điều khiển dưới màn hình (nút sáng vàng `"⚡ Đang bật Flash"`). Đèn tự động tắt khi bấm Thoát, đổi camera hoặc khóa màn hình.
   - *Lưu ý riêng cho iPhone Safari:* Một số phiên bản iOS không cấp API bật đèn Flash qua trình duyệt web; nếu thiết bị không hỗ trợ hệ thống sẽ hiện thông báo nhắc bật đèn pin từ Trung tâm điều khiển iOS.

---

## 5. TRANG QUẢN TRỊ (`/admin.html`) & BẢO MẬT PIN

- Truy cập `https://<IP_LAN>/admin.html`.
- Nhập **Mã PIN quản trị** (mặc định: `123456`, có thể đổi qua biến môi trường `ADMIN_PIN=xxxxxx`).
- Các chức năng chính:
  - Theo dõi tỷ lệ khách đã check-in, thống kê theo **Cổng** và **20 lượt quét gần nhất**.
  - Tìm kiếm, lọc vé và **Hoàn tác** trạng thái check-in nếu nhân viên quét nhầm.
  - Tải báo cáo tức thì: **📥 JSON**, **📊 CSV** (mở thẳng bằng Excel không lỗi tiếng Việt), và **💾 Backup DB** (tải nguyên file `tickets.db` an toàn).

---

## 6. CẤU HÌNH ROUTER WI-FI, SSL & MỞ FIREWALL

### Mở Firewall Windows (chạy 1 lần với PowerShell Administrator):
```powershell
New-NetFirewallRule -DisplayName "SoatVe_LAN_443" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
New-NetFirewallRule -DisplayName "SoatVe_LAN_80" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
```

### Cấu hình Router Wi-Fi cục bộ:
1. Không cần cắm dây mạng vào cổng WAN (giữ mạng nội bộ cô lập ổn định).
2. Nối dây LAN từ Laptop Server vào cổng LAN của Router (hoặc bật Mobile Hotspot trên Laptop).
3. Bật **DHCP Server** để tự cấp IP cho điện thoại nhân viên.
4. **Tắt AP Isolation / Client Isolation** để điện thoại nhìn thấy Laptop Server.
5. Ưu tiên băng tần **5GHz** tại khu vực cổng check-in đông người.

---

## 7. KIỂM THỬ TỰ ĐỘNG & XUẤT BÁO CÁO

| Lệnh NPM | Chức năng |
| :--- | :--- |
| `npm start` | Khởi chạy Server HTTPS (443) + HTTP redirect (80) |
| `npm run import -- <file>` | Nhập danh sách vé thật từ file `.json` / `.csv` |
| `npm run export` | Xuất báo cáo ra `data/tickets_export.json` & `data/tickets_export.csv` |
| `npm run make-qr` | Tạo bộ mã QR mẫu từ dữ liệu giả `tests/fixtures/tickets.json` (`data/test_qrs/`, `public/test-qr.html`) |
| `npm run make-card` | Tạo phiếu hướng dẫn in A4 (`docs/huong-dan-nhan-vien.html`) |
| `npm test` | Chạy 6 bài test lõi (`tests/test.js`) |
| `npm run test:specs` | Chạy kiểm thử theo 4 biểu đồ spec (`tests/test_drive_specs.js`) |
| `npm run test:ui` | Chạy kiểm thử UI tĩnh + Headless Chromium CDP (`tests/test_ui.js`) |
| `npm run test:fixes` | Kiểm thử hồi quy: import dữ liệu PayOS lạ, check-in tay, thống kê (`tests/test_fixes.js`) |
| `npm run test:all` | Chạy toàn bộ tất cả bộ kiểm thử (`test` + `test:specs` + `test:fixes` + `test:ui`) |

> Bộ test luôn chạy trên **file SQLite tạm** (biến `DB_PATH`), không bao giờ đụng vào `data/tickets.db` thật — an toàn khi chạy ngay trên laptop máy chủ sự kiện.

---

## 8. XỬ LÝ SỰ CỐ KHẨN CẤP (TROUBLESHOOTING)

| Tình huống | Cách xử lý ngay tại chỗ |
| :--- | :--- |
| **Banner đỏ `⚠ MẤT KẾT NỐI ĐẾN MÁY CHỦ`** | Kiểm tra lại Wi-Fi sự kiện trên điện thoại. Khi kết nối lại, bấm **🔄 Tải lại** để đồng bộ. |
| **iPhone Safari báo không mở được Camera** | Đảm bảo mở đúng link `https://...`, đã bấm *"Truy cập trang web này"*, và kiểm tra *Cài đặt → Safari → Camera → Cho phép*. |
| **Laptop Server hết pin / khởi động lại** | Bật lại máy và chạy `start.bat` / `node server.js`. Toàn bộ lượt check-in đã ghi được bảo toàn 100% nhờ SQLite WAL + tự động backup 5 phút/lần vào `data/backup/`. |
| **Router Wi-Fi gặp sự cố** | Bật **Mobile Hotspot** trực tiếp trên Laptop Server, cho điện thoại nhân viên kết nối vào Hotspot và khởi động lại `server.js` (server tự nhận IP Hotspot mới). |
| **Không quét được QR do màn hình khách vỡ** | Gõ tên/SĐT/mã vé vào ô tìm kiếm trên trang chính, mở chi tiết đối chiếu và bấm **`Chưa soát ▼`** để check-in thủ công. |
