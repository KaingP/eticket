# HƯỚNG DẪN VẬN HÀNH HỆ THỐNG SOÁT VÉ OFFLINE LAN
## Sự kiện: "Hùng Vương Concert: GAME ON"
### Chuẩn hóa 100% theo quy trình và giao diện Wireframe trong Google Drive

> **Đặc tả hệ thống:** Giao diện thống nhất "Cổng soát vé" • Chạy hoàn toàn Offline trong mạng LAN • **KHÔNG CẦN CÀI ĐẶT IP TĨNH** • Nhân viên chỉ cần mở camera quét mã QR trên màn hình laptop để vào làm việc ngay.

---

## MỤC LỤC
1. [Kiến trúc & Luồng hoạt động theo Google Drive](#1-kiến-trúc--luồng-hoạt-động-theo-google-drive)
2. [Cài đặt & Khởi động hệ thống (3 bước siêu nhanh)](#2-cài-đặt--khởi-động-hệ-thống-3-bước-siêu-nhanh)
3. [Hướng dẫn nhân viên truy cập từ điện thoại (Không gõ IP)](#3-hướng-dẫn-nhân-viên-truy-cập-từ-điện-thoại)
4. [Hướng dẫn sử dụng chi tiết theo 4 biểu đồ](#4-hướng-dẫn-sử-dụng-chi-tiết-theo-4-biểu-đồ)
   - [Biểu đồ 0: Quản lý danh sách mã vé (Nhập file, Xem chi tiết, Đổi trạng thái)](#biểu-đồ-0-quản-lý-danh-sách-mã-vé)
   - [Biểu đồ 1: Soát vé - Quét mã QR (Camera, Chống quét đúp, Tiếp theo)](#biểu-đồ-1-soát-vé---quét-mã-qr)
   - [Biểu đồ 2: Dashboard thẻ đếm (Tất cả, Đã soát, Chưa soát, Refresh)](#biểu-đồ-2-dashboard-thẻ-đếm)
   - [Biểu đồ 3: Lọc danh sách theo thẻ Dashboard](#biểu-đồ-3-lọc-danh-sách-theo-thẻ-dashboard)
5. [Cấu hình Router Wi-Fi & Mở Firewall](#5-cấu-hình-router-wi-fi--mở-firewall)
6. [Kế hoạch xử lý sự cố khẩn cấp (Troubleshooting)](#6-kế-hoạch-xử-lý-sự-cố-khẩn-cấp-troubleshooting)

---

## 1. KIẾN TRÚC & LUỒNG HOẠT ĐỘNG THEO GOOGLE DRIVE

Hệ thống được thiết kế tối giản, tập trung toàn bộ nghiệp vụ vào giao diện duy nhất **"Cổng soát vé"** theo đúng Wireframe:
- **Header:** Tiêu đề "Cổng soát vé", Nút **"Soát vé"** (mở camera quét QR) và Nút **"Nhập danh sách"** (nạp file .csv/.json).
- **Dashboard Thẻ Đếm:** 3 thẻ trạng thái **Tất cả**, **Đã soát**, **Chưa soát** cùng nút **Refresh**.
- **Bộ lọc động:** Nhấp trực tiếp vào từng thẻ để lọc danh sách tương ứng.
- **Tìm kiếm:** Ô **"Tìm kiếm mã vé"**, gõ mã và nhấn **Enter** để tra cứu tức thì (báo lỗi nếu không có).
- **Bảng dữ liệu:** Đầy đủ 9 cột: `STT | Tên khách hàng | Email | Thời điểm mua vé | Mã vé | Số lượng vé | Trạng thái | Thời điểm check in | Note`.
- **Xem chi tiết:** Nhấp vào Mã vé để mở bảng **"Chi tiết mã vé"** kèm nút **"Đóng bảng"**.
- **Soát vé QR:** Tạm dừng 1.5s chống quét đúp, hiển thị **"Thành công!"** kèm **Ghi chú nếu có** hoặc **"Không hợp lệ"**, sau đó mở pop-up **"Quét mã tiếp theo?"** với 2 nút **"Xác nhận"** và **"Thoát"**.

---

## 2. CÀI ĐẶT & KHỞI ĐỘNG HỆ THỐNG (CHẠY TRÊN MỌI MÁY TÍNH)

### Cách 1: Khởi động 1-Click (Khuyên dùng - Nhanh nhất trên mọi máy)
- **Trên Windows:** Chỉ cần click đúp vào file **`start.bat`**.
  - Script tự kiểm tra môi trường Node.js.
  - Tự động cài đặt thư viện (`npm install`) nếu máy mới chưa có `node_modules`.
  - Tự động nạp dữ liệu vé mẫu `tickets_sample.json` nếu CSDL chưa khởi tạo.
  - Tự động khởi chạy Server và in mã QR để quét vào điện thoại!
- **Trên macOS / Linux:** Mở Terminal và chạy:
  ```bash
  chmod +x start.sh && ./start.sh
  ```

### Cách 2: Khởi động thủ công bằng dòng lệnh (3 bước)
```bash
# Bước 1: Cài đặt thư viện (chỉ chạy 1 lần khi mới tải code)
npm install

# Bước 2: Nhập danh sách vé ban đầu vào CSDL
node import.js tickets_sample.json

# Bước 3: Khởi động Server soát vé
node server.js
```
Ngay lập tức, màn hình dòng lệnh của Laptop sẽ hiện **MÃ QR TERMINAL TO RÕ**:
- Tự động nhận diện IP LAN của laptop (ví dụ `192.168.1.10` hoặc `192.168.168.9`).
- Tự động sinh chứng chỉ HTTPS cho chính IP đó.
- Hiển thị link truy cập: `https://<IP_LAN>`
- Hiển thị mã QR để quét ngay trên màn hình đen console!

---

## 3. HƯỚNG DẪN NHÂN VIÊN TRUY CẬP TỪ ĐIỆN THOẠI

Nhân viên **KHÔNG CẦN GÕ BẤT KỲ ĐỊA CHỈ IP NÀO**.

1. Nhân viên kết nối điện thoại vào mạng Wi-Fi sự kiện.
2. Mở ứng dụng **Camera** trên điện thoại (hoặc Zalo / trình duyệt Chrome).
3. Đưa camera soi vào **Mã QR đang hiển thị trên màn hình Laptop** (hoặc mở trang `https://<IP_LAN>/qr`).
4. Bấm vào đường link hiện lên:
   - **Trên Android (Chrome):** Bấm nút **"Nâng cao" (Advanced)** $\rightarrow$ Bấm dòng chữ nhỏ **"Tiếp tục truy cập (không an toàn)"**.
   - **Trên iPhone (Safari):** Bấm nút **"Hiển thị chi tiết" (Show Details)** $\rightarrow$ Bấm **"truy cập trang web này" (visit this website)** $\rightarrow$ Xác nhận.
5. Trang web **"Cổng soát vé"** mở ra ngay lập tức, sẵn sàng làm việc!

---

## 4. HƯỚNG DẪN SỬ DỤNG CHI TIẾT THEO 4 BIỂU ĐỒ

### Biểu đồ 0: Quản lý danh sách mã vé
1. **Nhập danh sách:**
   - Ấn button **"Nhập danh sách"** ở góc trên bên phải.
   - Chọn file `.csv` hoặc `.json` muốn import.
   - Ấn **"Xác nhận"**.
   - Hệ thống tự kiểm tra định dạng và cấu trúc cột:
     - Nếu không hợp lệ $\rightarrow$ Báo **"File lỗi"**.
     - Nếu hợp lệ $\rightarrow$ Lưu CSDL với trạng thái "Chưa soát", cập nhật danh sách và báo **"Nhập thành công"**.
2. **Tìm kiếm mã vé:**
   - Ấn ô **"Tìm kiếm mã vé"** $\rightarrow$ Nhập mã vé $\rightarrow$ Nhấn **"Enter"**.
   - Nếu không thấy vé $\rightarrow$ Hiển thị **"Báo lỗi"** (Không tìm thấy vé trong hệ thống).
   - Nếu thấy vé $\rightarrow$ Hiển thị dòng vé tương ứng trong bảng.
3. **Xem chi tiết thông tin vé:**
   - Ấn vào **Mã vé** màu xanh gạch chân trên bảng.
   - Hiện bảng thông tin chi tiết: Mã vé, Họ tên, Email, Số điện thoại, Thời điểm mua vé, Mã đơn hàng, Thông tin chuyển khoản/thanh toán, Số lượng vé, Trạng thái, Thời điểm check in, Ghi chú.
   - Ấn **"Đóng bảng"** để quay lại.
4. **Thay đổi trạng thái thủ công (Check-in tay khi camera không quét được):**
   - Tại cột **Trạng thái**, ấn vào nút **"⏳ Chưa soát"**.
   - Trình duyệt hiện hộp thoại xác nhận $\rightarrow$ Chọn Đồng ý.
   - Hệ thống lập tức lưu thời gian thực tế, chuyển trạng thái thành **"✔ Đã soát"** và tăng bộ đếm "Đã soát" trên Dashboard.

---

### Biểu đồ 1: Soát vé - Quét mã QR
1. Mở trang chủ $\rightarrow$ Ấn button **"Soát vé"**.
2. Trình duyệt hiện pop-up hỏi quyền Camera $\rightarrow$ Ấn **"Cho phép" / "Xác nhận cấp quyền"**.
3. Giao diện camera quét mã QR bật lên.
4. Đưa Camera quét mã QR trên vé của khách.
5. **Chống quét đúp:** Camera tự động **tạm dừng 1.5 giây** ngay khi bắt được mã.
6. Hệ thống đối chiếu CSDL:
   - **Hợp lệ:** Mã tồn tại và trạng thái là "Chưa soát" $\rightarrow$ Cập nhật "Đã soát", lưu thời gian thực tế, phát tiếng bíp vui tươi, hiện thông báo màu xanh **"Thành công!"** và **Ghi chú nếu có** (ví dụ: `Ghi chú: voucher`).
   - **Không hợp lệ:** Mã không tồn tại hoặc vé đã soát trước đó $\rightarrow$ Rung cảnh báo, phát âm trầm, hiện thông báo màu đỏ **"Không hợp lệ"** kèm lý do (ví dụ: `Vé đã được soát lúc 18:05:30 (Cổng chính)`).
7. Hiện pop-up câu hỏi: **"Quét mã tiếp theo?"**
   - Ấn **"Xác nhận"**: Bật lại camera để quét vé của khách tiếp theo.
   - Ấn **"Thoát"**: Tắt camera, đóng giao diện soát vé, quay về trang danh sách mã vé (tự động cập nhật số liệu mới nhất).

---

### Biểu đồ 2: Dashboard thẻ đếm
- Ngay đầu trang hiển thị 3 thẻ đếm:
  - **Tất cả:** Tổng số lượng vé hiện có trong hệ thống (Mặc định).
  - **Đã soát:** Tổng số khách đã qua cổng check-in thành công.
  - **Chưa soát:** Số khách chưa đến sự kiện.
- **Nút Refresh:** Bấm vào nút Refresh để hệ thống truy vấn CSDL và tính toán cập nhật lại toàn bộ số liệu mới nhất.

---

### Biểu đồ 3: Lọc danh sách theo thẻ Dashboard
- Trạng thái **"Tất cả"** là trạng thái mặc định.
- Ấn vào thẻ **"Đã soát"** $\rightarrow$ Bảng tự động chỉ hiển thị các vé đã check-in.
- Ấn vào thẻ **"Chưa soát"** $\rightarrow$ Bảng tự động chỉ hiển thị các vé chưa check-in.
- Ấn lại thẻ **"Tất cả"** $\rightarrow$ Bảng quay về hiển thị toàn bộ vé.

---

## 5. CẤU HÌNH ROUTER WI-FI & MỞ FIREWALL

### Mở Firewall Windows trên Laptop Server (Chỉ chạy 1 lần):
Mở PowerShell bằng quyền Administrator:
```powershell
New-NetFirewallRule -DisplayName "SoatVe_LAN_443" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
New-NetFirewallRule -DisplayName "SoatVe_LAN_80" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
```

### Cấu hình Router Wi-Fi cục bộ:
1. **Không cắm dây Internet vào cổng WAN:** Giữ mạng cô lập 100% offline.
2. Cắm cáp LAN từ Laptop vào cổng LAN (màu vàng) trên Router.
3. Bật **DHCP Server** trên Router để router tự cấp IP (không cần đặt IP tĩnh).
4. **Tắt AP Isolation / Client Isolation** trong mục Wireless của Router để các điện thoại nhìn thấy Laptop Server.
5. Khuyên dùng băng tần **5GHz** để sóng ổn định, chống nhiễu đám đông.

---

## 6. KẾ HOẠCH XỬ LÝ SỰ CỐ KHẨN CẤP (TROUBLESHOOTING)

| Tình huống | Cách khắc phục tức thì |
| :--- | :--- |
| **Mất kết nối Wi-Fi** | Hệ thống hiện banner đỏ `⚠ MẤT KẾT NỐI ĐẾN MÁY CHỦ` và tạm dừng thao tác để tránh sai lệch dữ liệu. Khi Wi-Fi kết nối lại, hệ thống tự động đồng bộ tiếp. |
| **Laptop bị sập nguồn / Hết pin** | Cắm sạc, bật lại Laptop, chạy `node server.js`. Dữ liệu vé đã soát được bảo toàn 100% nhờ SQLite chế độ WAL. |
| **Router bị hỏng phần cứng** | Bật tính năng **Mobile Hotspot** ngay trên Laptop Server để các điện thoại kết nối trực tiếp vào Laptop. Không cần phụ thuộc Router ngoài! |
| **Xuất báo cáo sau sự kiện** | Chạy `node export.js` để xuất ra 2 file `data/tickets_export.csv` (mở bằng Excel) và `data/tickets_export.json`. |
