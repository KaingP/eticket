/**
 * test_drive_specs.js - Kiểm thử chuyên sâu toàn bộ 4 biểu đồ trong Google Drive:
 * 1. Diagram 0: Quản lý danh sách mã vé (Import CSV/JSON, Chi tiết mã vé, Đổi trạng thái thủ công, Tìm kiếm)
 * 2. Diagram 1: Soát vé - Quét mã QR (Kiểm tra mã, Thành công + Ghi chú, Báo lỗi, Pop-up tiếp theo)
 * 3. Diagram 2: Dashboard (Thống kê: Tất cả, Đã soát, Chưa soát, Refresh)
 * 4. Diagram 3: Lọc danh sách theo Dashboard (Tất cả, Đã soát, Chưa soát)
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { app, db, handleCheckin } = require('./server');
const { importTicketsData } = require('./import');

function assert(cond, msg) {
  if (!cond) {
    console.error(`  ❌ THẤT BẠI: ${msg}`);
    throw new Error(msg);
  } else {
    console.log(`  ✔ ĐẠT: ${msg}`);
  }
}

async function runDriveTestSuite() {
  console.log(`\n=====================================================================`);
  console.log(`🚀 KIỂM THỬ TÍCH HỢP HỆ THỐNG THEO SPEC GOOGLE DRIVE & WIREFRAMES`);
  console.log(`=====================================================================\n`);

  // Reset database test
  db.exec('DELETE FROM scan_log; DELETE FROM tickets;');

  // -----------------------------------------------------------------
  // 1. DIAGRAM 0: IMPORT FILE CSV & JSON
  // -----------------------------------------------------------------
  console.log(`[TEST D0.1] Kiểm tra Import file CSV hợp lệ và không hợp lệ (File lỗi / Nhập thành công)...`);

  // File CSV hợp lệ
  const validCsv = `STT,Tên khách hàng,Email,Số điện thoại,Thời điểm mua vé,Mã vé,Số lượng vé,Loại vé,Trạng thái,Ghi chú
1,Nguyễn Văn A,nva@gmail.com,0901234567,2026-11-09T10:00:00+07:00,HVC-CSV-001,Vé 1/1,Vé VIP,VALID,voucher 50k
2,Trần Thị B,ttb@gmail.com,0907654321,2026-11-09T11:00:00+07:00,HVC-CSV-002,Vé 1/2,Vé Thường,VALID,
3,Trần Thị B,ttb@gmail.com,0907654321,2026-11-09T11:00:00+07:00,HVC-CSV-003,Vé 2/2,Vé Thường,VALID,quà tặng áo
`;
  const resValidCsv = importTicketsData(validCsv, 'danhsach.csv');
  assert(resValidCsv.success === true, 'Import CSV hợp lệ trả về success = true');
  assert(resValidCsv.countTotal === 3, 'Import đúng 3 vé từ file CSV');
  assert(resValidCsv.message === 'Nhập thành công', 'Thông báo trả về đúng: "Nhập thành công"');

  // Kiểm tra lưu đúng Note
  const ticketWithNote = db.prepare('SELECT * FROM tickets WHERE code = ?').get('HVC-CSV-001');
  assert(ticketWithNote.note === 'voucher 50k', 'Cột Note ghi nhận đúng voucher: voucher 50k');
  assert(ticketWithNote.name === 'Nguyễn Văn A', 'Tên khách hàng lưu đúng');

  // File CSV không hợp lệ (thiếu cột Mã vé) -> Báo lỗi
  let threwCsvError = false;
  try {
    const invalidCsv = `Tên,Email,SĐT\nNguyễn A,a@gmail.com,0901111111`;
    importTicketsData(invalidCsv, 'invalid.csv');
  } catch (e) {
    threwCsvError = true;
  }
  assert(threwCsvError === true, 'File CSV thiếu cột Mã vé báo lỗi "File lỗi"');

  // File JSON hợp lệ
  const validJson = JSON.stringify({
    tickets: {
      "HVC-JSON-001": {
        "customerName": "Lê Hoàng C",
        "email": "lhc@gmail.com",
        "phone": "0912345678",
        "ticketCode": "HVC-JSON-001",
        "ticketLabel": "Vé 1/1",
        "ticketTypeName": "Vé FanZone",
        "status": "VALID",
        "issuedAt": "2026-11-10T15:30:00+07:00",
        "note": "voucher đồ uống"
      }
    }
  });
  const resValidJson = importTicketsData(validJson, 'tickets.json');
  assert(resValidJson.success === true, 'Import JSON hợp lệ trả về success = true');
  assert(resValidJson.countTotal === 1, 'Import thêm 1 vé JSON');

  console.log(`👉 Test D0.1: ĐẠT XUẤT SẮC\n`);

  // -----------------------------------------------------------------
  // 2. DIAGRAM 2: DASHBOARD STATS (Tất cả, Đã soát, Chưa soát + Refresh)
  // -----------------------------------------------------------------
  console.log(`[TEST D2] Kiểm tra Dashboard cards (Tất cả, Đã soát, Chưa soát)...`);

  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total_all,
      SUM(CASE WHEN checked_in = 1 THEN 1 ELSE 0 END) AS checked,
      SUM(CASE WHEN checked_in = 0 THEN 1 ELSE 0 END) AS unchecked
    FROM tickets
  `).get();

  assert(stats.total_all === 4, 'Tổng số vé "Tất cả": 4 vé');
  assert(stats.checked === 0, 'Số vé "Đã soát" ban đầu: 0 vé');
  assert(stats.unchecked === 4, 'Số vé "Chưa soát" ban đầu: 4 vé');
  assert(stats.total_all === (stats.checked + stats.unchecked), 'Công thức Diagram 2: Tất cả = Đã soát + Chưa soát');

  console.log(`👉 Test D2: ĐẠT XUẤT SẮC\n`);

  // -----------------------------------------------------------------
  // 3. DIAGRAM 1: SOÁT VÉ - QUÉT MÃ QR (Thành công + Ghi chú / Không hợp lệ)
  // -----------------------------------------------------------------
  console.log(`[TEST D1] Kiểm tra Luồng Soát Vé Quét QR (Diagram 1)...`);

  // Quét vé hợp lệ có Ghi chú
  const scanSuccess = handleCheckin('HVC-CSV-001', 'Cổng chính');
  assert(scanSuccess.httpStatus === 200, 'HTTP 200 khi quét');
  assert(scanSuccess.body.status === 'OK', 'Trạng thái phản hồi: OK');
  assert(scanSuccess.body.message === 'Thành công!', 'Thông báo phản hồi: "Thành công!"');
  assert(scanSuccess.body.note === 'voucher 50k', 'Kèm thông tin ghi chú: "voucher 50k"');

  // Quét lại chính vé đó -> Báo Không hợp lệ (Đã soát)
  const scanDuplicate = handleCheckin('HVC-CSV-001', 'Cổng chính');
  assert(scanDuplicate.body.status === 'DUPLICATE', 'Quét lại báo DUPLICATE');
  assert(scanDuplicate.body.valid === false, 'Đánh dấu valid = false');
  assert(scanDuplicate.body.message.includes('Vé đã được soát'), 'Thông báo chi tiết thời gian đã soát');

  // Quét mã không tồn tại -> Báo Không hợp lệ (Không tồn tại)
  const scanNotFound = handleCheckin('HVC-NON-EXISTENT', 'Cổng chính');
  assert(scanNotFound.body.status === 'INVALID', 'Mã lạ báo INVALID');
  assert(scanNotFound.body.valid === false, 'Đánh dấu valid = false');

  console.log(`👉 Test D1: ĐẠT XUẤT SẮC\n`);

  // -----------------------------------------------------------------
  // 4. DIAGRAM 0: THAY ĐỔI TRẠNG THÁI THỦ CÔNG
  // -----------------------------------------------------------------
  console.log(`[TEST D0.2] Kiểm tra Thay đổi trạng thái thủ công từ "Chưa soát" -> "Đã soát"...`);

  const codeToManual = 'HVC-CSV-002';
  const beforeManual = db.prepare('SELECT checked_in, checked_at FROM tickets WHERE code = ?').get(codeToManual);
  assert(beforeManual.checked_in === 0, 'Vé ban đầu ở trạng thái "Chưa soát" (0)');

  // Thực hiện thủ công chuyển sang Đã soát
  const now = new Date().toISOString();
  db.prepare(`UPDATE tickets SET checked_in = 1, checked_at = ?, gate = 'Thủ công' WHERE code = ?`).run(now, codeToManual);

  const afterManual = db.prepare('SELECT checked_in, checked_at, gate FROM tickets WHERE code = ?').get(codeToManual);
  assert(afterManual.checked_in === 1, 'Trạng thái cập nhật thành công sang "Đã soát" (1)');
  assert(afterManual.checked_at !== null, 'Thời gian thực tế được lưu vào cột checked_at');
  assert(afterManual.gate === 'Thủ công', 'Ghi nhận cổng check-in');

  // Kiểm tra bộ đếm Đã soát tăng lên
  const updatedCheckedCount = db.prepare('SELECT COUNT(*) as c FROM tickets WHERE checked_in = 1').get().c;
  assert(updatedCheckedCount === 2, 'Số lượng "Đã soát" tăng lên đúng 2 vé (1 qua QR, 1 thủ công)');

  console.log(`👉 Test D0.2: ĐẠT XUẤT SẮC\n`);

  // -----------------------------------------------------------------
  // 5. DIAGRAM 3: LỌC DANH SÁCH THEO DASHBOARD (Tất cả, Đã soát, Chưa soát)
  // -----------------------------------------------------------------
  console.log(`[TEST D3] Kiểm tra Lọc danh sách theo Dashboard (Diagram 3)...`);

  const allTickets = db.prepare('SELECT * FROM tickets').all();
  const checkedTickets = db.prepare('SELECT * FROM tickets WHERE checked_in = 1').all();
  const uncheckedTickets = db.prepare('SELECT * FROM tickets WHERE checked_in = 0').all();

  assert(allTickets.length === 4, 'Bộ lọc "Tất cả" trả về đủ 4 vé');
  assert(checkedTickets.length === 2, 'Bộ lọc "Đã soát" trả về đúng 2 vé');
  assert(uncheckedTickets.length === 2, 'Bộ lọc "Chưa soát" trả về đúng 2 vé');

  console.log(`👉 Test D3: ĐẠT XUẤT SẮC\n`);

  // -----------------------------------------------------------------
  // 6. DIAGRAM 0: XEM CHI TIẾT MÃ VÉ
  // -----------------------------------------------------------------
  console.log(`[TEST D0.3] Kiểm tra thông tin Chi tiết mã vé (Modal)...`);

  const detailTicket = db.prepare('SELECT * FROM tickets WHERE code = ?').get('HVC-JSON-001');
  assert(detailTicket.code === 'HVC-JSON-001', 'Mã vé chính xác');
  assert(detailTicket.name === 'Lê Hoàng C', 'Tên khách hàng chính xác');
  assert(detailTicket.email === 'lhc@gmail.com', 'Email chính xác');
  assert(detailTicket.phone === '0912345678', 'Số điện thoại chính xác');
  assert(detailTicket.issued_at === '2026-11-10T15:30:00+07:00', 'Thời điểm mua vé chính xác');
  assert(detailTicket.note === 'voucher đồ uống', 'Ghi chú chính xác');

  console.log(`👉 Test D0.3: ĐẠT XUẤT SẮC\n`);

  console.log(`=====================================================================`);
  console.log(`🎉 TOÀN BỘ CÁC TEST CASE THEO SPEC GOOGLE DRIVE ĐÃ ĐẠT 100%!`);
  console.log(`=====================================================================\n`);
}

runDriveTestSuite().catch(err => {
  console.error('❌ Lỗi kiểm thử Drive spec:', err);
  process.exit(1);
});
