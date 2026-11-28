# Nhật ký thay đổi

## [1.1.0] - 2026-11-28 — Bản chính thức cho sự kiện

### Sửa lỗi nhập dữ liệu PayOS
- Import không còn bị lỗi khi mã vé / trạng thái / SĐT / mã đơn là **số** hoặc `null`.
- `checkedIn` dạng chuỗi `"false"`, `"0"`, `"Chưa vào"` được hiểu đúng là **chưa soát** (trước đây bị hiểu nhầm là đã vào).
- Chuẩn hóa trạng thái: không phân biệt hoa thường; `Hợp lệ` → `VALID`; `Đã hủy` / `Hoàn tiền` / `CANCELED` → `CANCELLED`.
- Khôi phục số `0` đầu SĐT bị Excel/JSON cắt mất.
- Tự nhận diện CSV lưu từ Excel tiếng Việt (dấu chấm phẩy `;`).
- Hỗ trợ thêm cấu trúc JSON `{ "tickets": [...] }` và `{ "data": [...] }`; bỏ qua phần tử rỗng/sai kiểu thay vì hỏng cả file.

### Sửa lỗi soát vé
- **Check-in thủ công** dùng chung quy tắc với quét QR: chặn vé đã hủy, báo `DUPLICATE` kèm giờ/cổng đã soát, không ghi đè lượt soát cũ.
- Cập nhật vé và ghi nhật ký quét trong cùng 1 transaction.
- Tham số request sai kiểu (số, mảng, object) không còn gây lỗi 500.

### Dashboard
- Thẻ **"Chưa soát"** chỉ tính vé hợp lệ chưa vào (không tính vé đã hủy); thẻ **"Tất cả"** hiển thị thêm số vé đã hủy.
- Bộ lọc "Chưa soát" khớp với số trên thẻ.

### Vận hành
- Xử lý an toàn khi đóng cửa sổ / `SIGTERM` / `SIGHUP`: dừng backup, đóng SQLite đúng cách.
- Thông báo rõ khi chứng chỉ SSL được tạo lại do đổi IP/mạng (nhân viên cần quét lại QR); báo lỗi rõ nếu thiếu OpenSSL hoặc cổng 443 bị chiếm.
- Các lỗi trước đây bị bỏ qua im lặng nay được ghi ra log.
- `start.bat` / `start.sh` không tự nạp dữ liệu mẫu; nhắc nhập file vé thật.

### Dữ liệu & bảo mật
- Xóa toàn bộ dữ liệu vé mẫu chứa thông tin khách hàng; bộ test và trang QR test dùng dữ liệu giả lập (`tests/fixtures/tickets.json`).
- Chứng chỉ SSL (`certs/`) không còn được commit; tự sinh khi chạy server.

### Kiểm thử
- Bộ test chạy trên **file SQLite tạm** (`DB_PATH`), không bao giờ xóa `data/tickets.db` thật.
- Thêm `tests/test_fixes.js` (36 kiểm tra hồi quy); `npm run test:all` chạy cả 4 bộ test.

## [1.0.0]
- Phát hành đầu tiên: soát vé QR offline LAN, chống check-in trùng bằng SQLite WAL, HTTPS tự động theo IP LAN, trang quản trị PIN, sao lưu tự động 5 phút, xuất báo cáo JSON/CSV.
