/**
 * test_fixes.js - Kiểm thử hồi quy cho các lỗi đã sửa:
 *  - Import dữ liệu PayOS "bẩn" (số, null, boolean dạng chuỗi, CSV dấu ;)
 *  - Check-in thủ công tuân theo đúng quy tắc quét QR
 *  - Thống kê Dashboard không tính vé hủy vào "Chưa soát"
 *  - Bộ test không đụng vào data/tickets.db thật
 */

const { TEST_DB_PATH } = require('./setup-test-db'); // PHẢI đứng đầu
const path = require('path');
const http = require('http');
const ROOT_DIR = path.resolve(__dirname, '..');
const { app, db } = require(path.join(ROOT_DIR, 'server'));
const { importTicketsData } = require(path.join(ROOT_DIR, 'import'));

let passed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error(`  ❌ THẤT BẠI: ${msg}`);
    throw new Error(msg);
  }
  passed++;
  console.log(`  ✔ ĐẠT: ${msg}`);
}

function request(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1', port, method, path: urlPath,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
    }, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch (e) { json = raw; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const get = (code) => db.prepare('SELECT * FROM tickets WHERE code = ?').get(code);

async function run() {
  console.log('\n=====================================================================');
  console.log('🚀 KIỂM THỬ HỒI QUY CÁC LỖI ĐÃ SỬA');
  console.log('=====================================================================\n');

  console.log('[F0] Bộ test chạy trên DB tạm...');
  assert(!path.resolve(TEST_DB_PATH).startsWith(path.join(ROOT_DIR, 'data')), `DB test nằm ngoài thư mục data/ (${TEST_DB_PATH})`);
  db.exec('DELETE FROM scan_log; DELETE FROM tickets;');

  // ---------------------------------------------------------------
  console.log('\n[F1] Import JSON PayOS có kiểu dữ liệu lạ...');
  const dirtyJson = JSON.stringify({
    tickets: [
      { ticketCode: 'hvc-num-001 ', customerName: 'Khách Số', phone: 912345678, status: 'valid', checkedIn: 'false', orderId: 123456, payosOrderCode: 123456 },
      { ticketCode: 'HVC-NUM-002', customerName: 'Khách Hủy', status: 'Đã hủy', checkedIn: 0 },
      { ticketCode: 'HVC-NUM-003', customerName: 'Khách Vào Sẵn', status: null, checkedIn: 'true', checkedInAt: '2026-11-20T18:00:00+07:00' },
      { ticketCode: 'HVC-NUM-004', customerName: null, status: 'VALID', note: 42 },
      null,
      'rác',
      { ticketCode: null, customerName: 'Không có mã' },
      { ticketCode: { nested: true }, customerName: 'Mã sai kiểu' }
    ]
  });
  const r1 = importTicketsData(dirtyJson, 'payos.json');
  assert(r1.countTotal === 4, 'Import 4 vé hợp lệ, bỏ qua phần tử null/chuỗi/thiếu mã (không crash)');
  assert(get('HVC-NUM-001') && get('HVC-NUM-001').checked_in === 0, 'checkedIn: "false" (chuỗi) được hiểu là CHƯA soát');
  assert(get('HVC-NUM-001').status === 'VALID', 'status "valid" viết thường được chuẩn hóa thành VALID');
  assert(get('HVC-NUM-001').phone === '0912345678', 'Số điện thoại dạng số bị mất số 0 được khôi phục');
  assert(get('HVC-NUM-001').order_id === '123456', 'orderId dạng số được lưu thành chuỗi');
  assert(get('HVC-NUM-002').status === 'CANCELLED', 'status "Đã hủy" được chuẩn hóa thành CANCELLED');
  assert(get('HVC-NUM-003').checked_in === 1 && get('HVC-NUM-003').status === 'VALID', 'checkedIn: "true" + status null -> đã soát, VALID');
  assert(get('HVC-NUM-004').note === '42' && get('HVC-NUM-004').name === '', 'note dạng số và tên null không gây lỗi');

  let threw = false;
  try { importTicketsData(JSON.stringify([null, 1, 'x']), 'bad.json'); } catch (e) { threw = /Không tìm thấy vé/.test(e.message); }
  assert(threw, 'File JSON không có vé nào hợp lệ báo lỗi rõ ràng thay vì crash');

  // ---------------------------------------------------------------
  console.log('\n[F2] Import CSV từ Excel tiếng Việt (dấu chấm phẩy ;)...');
  const semicolonCsv = '﻿Mã vé;Họ tên;Số điện thoại;Trạng thái;Đã check-in;Ghi chú\r\n' +
    'HVC-SEMI-001;Nguyễn Văn Chấm;987654321;Hợp lệ;Chưa vào;voucher nước\r\n' +
    'HVC-SEMI-002;Trần Phẩy;0901111222;CANCELLED;;\r\n';
  const r2 = importTicketsData(semicolonCsv, 'excel.csv');
  assert(r2.countTotal === 2, 'CSV dùng dấu ; đọc đúng 2 vé');
  const semi1 = get('HVC-SEMI-001');
  assert(semi1 && semi1.name === 'Nguyễn Văn Chấm' && semi1.note === 'voucher nước', 'Tách cột đúng với dấu ;');
  assert(semi1.status === 'VALID' && semi1.checked_in === 0, '"Hợp lệ" -> VALID, "Chưa vào" -> chưa soát');
  assert(semi1.phone === '0987654321', 'SĐT bị Excel cắt số 0 được khôi phục');

  // ---------------------------------------------------------------
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  try {
    console.log('\n[F3] Check-in thủ công tuân theo quy tắc quét QR...');
    const cancelled = await request(port, 'POST', '/api/manual-checkin', { code: 'HVC-NUM-002' });
    assert(cancelled.body.status === 'NOT_VALID_STATUS', 'Check-in tay vé CANCELLED bị từ chối');
    assert(get('HVC-NUM-002').checked_in === 0, 'Vé CANCELLED vẫn chưa được đánh dấu đã soát');

    const first = await request(port, 'POST', '/api/manual-checkin', { code: 'hvc-num-001', gate: 'Cổng A' });
    assert(first.status === 200 && first.body.status === 'OK' && first.body.checked_in === 1, 'Check-in tay vé hợp lệ thành công');
    const firstAt = get('HVC-NUM-001').checked_at;

    const again = await request(port, 'POST', '/api/manual-checkin', { code: 'HVC-NUM-001', gate: 'Cổng B', toggle: false });
    assert(again.body.status === 'DUPLICATE', 'Check-in tay lần 2 báo DUPLICATE');
    assert(again.body.gate === 'Cổng A', 'DUPLICATE chỉ rõ cổng đã soát trước đó');
    const after = get('HVC-NUM-001');
    assert(after.checked_at === firstAt && after.gate === 'Cổng A', 'Lượt soát cũ KHÔNG bị ghi đè giờ/cổng');

    const logs = db.prepare('SELECT result FROM scan_log WHERE code = ? ORDER BY id').all('HVC-NUM-001').map(r => r.result);
    assert(JSON.stringify(logs) === JSON.stringify(['OK', 'DUPLICATE']), `Nhật ký ghi đúng OK rồi DUPLICATE (${logs.join(', ')})`);

    const scanAfterManual = await request(port, 'POST', '/api/scan', { code: 'HVC-NUM-001', gate: 'Cổng C' });
    assert(scanAfterManual.body.status === 'DUPLICATE', 'Quét QR sau khi check-in tay báo DUPLICATE');

    const undo = await request(port, 'POST', '/api/manual-checkin', { code: 'HVC-NUM-001', toggle: true });
    assert(undo.body.status === 'OK' && get('HVC-NUM-001').checked_in === 0, 'Hoàn tác thủ công vẫn hoạt động như cũ');

    const unknown = await request(port, 'POST', '/api/manual-checkin', { code: 'HVC-KHONG-CO' });
    assert(unknown.status === 404, 'Mã không tồn tại trả về 404');

    console.log('\n[F4] Request có kiểu dữ liệu lạ không làm sập server...');
    const numCode = await request(port, 'POST', '/api/scan', { code: 12345 });
    assert(numCode.status === 200 && numCode.body.status === 'INVALID', 'Quét với code dạng số trả INVALID thay vì lỗi 500');
    const objCode = await request(port, 'POST', '/api/manual-checkin', { code: { a: 1 } });
    assert(objCode.status === 400, 'Check-in tay với code dạng object trả 400');
    const numNote = await request(port, 'POST', '/api/tickets/HVC-NUM-004/note', { note: 99 });
    assert(numNote.status === 200 && get('HVC-NUM-004').note === '99', 'Sửa ghi chú với giá trị số không lỗi');
    const badImport = await request(port, 'POST', '/api/import', { content: 123 });
    assert(badImport.status === 400, 'Import với content không phải chuỗi trả 400');
    const arrSearch = await request(port, 'GET', '/api/tickets?search=a&search=b&status=all');
    assert(arrSearch.status === 200, 'Tham số search lặp lại không gây lỗi 500');

    console.log('\n[F5] Thống kê Dashboard...');
    // Dữ liệu hiện tại: NUM-001 (VALID, chưa), NUM-002 (CANCELLED), NUM-003 (VALID, đã), NUM-004 (VALID, chưa),
    //                   SEMI-001 (VALID, chưa), SEMI-002 (CANCELLED)
    const stats = (await request(port, 'GET', '/api/stats')).body;
    assert(stats.all === 6, 'Tất cả = 6 vé');
    assert(stats.checked === 1, 'Đã soát = 1 vé');
    assert(stats.unchecked === 3, 'Chưa soát = 3 vé (KHÔNG tính 2 vé đã hủy)');
    assert(stats.cancelled === 2, 'Trả về số vé đã hủy = 2');
    assert(stats.all === stats.checked + stats.unchecked + stats.cancelled, 'Tất cả = Đã soát + Chưa soát + Đã hủy');

    const uncheckedList = (await request(port, 'GET', '/api/tickets?status=unchecked')).body;
    assert(uncheckedList.total === stats.unchecked, 'Bộ lọc "Chưa soát" khớp với số trên thẻ Dashboard');
    assert(uncheckedList.tickets.every(t => t.status === 'VALID'), 'Bộ lọc "Chưa soát" không chứa vé đã hủy');
  } finally {
    server.close();
  }

  console.log('\n=====================================================================');
  console.log(`🎉 ĐÃ ĐẠT ${passed} KIỂM TRA HỒI QUY`);
  console.log('=====================================================================\n');
  process.exit(0);
}

run().catch(err => {
  console.error('\n❌ LỖI KIỂM THỬ:', err);
  process.exit(1);
});
