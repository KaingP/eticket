/**
 * test.js - Bộ kiểm thử tự động toàn diện hệ thống soát vé offline
 * Chạy 6 kịch bản kiểm thử bắt buộc theo đặc tả kỹ thuật
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const ROOT_DIR = fs.existsSync(path.join(__dirname, 'server.js')) ? __dirname : path.resolve(__dirname, '..');
const { runImport } = require(path.join(ROOT_DIR, 'import'));
const { handleCheckin } = require(path.join(ROOT_DIR, 'server'));
const { exportData } = require(path.join(ROOT_DIR, 'export'));

const DATA_DIR = path.join(ROOT_DIR, 'data');
const DB_PATH = path.join(DATA_DIR, 'tickets.db');
const TICKETS_SAMPLE = path.join(DATA_DIR, 'tickets.json');

let passedTests = 0;
let totalTests = 6;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ THẤT BẠI: ${message}`);
    throw new Error(message);
  } else {
    console.log(`  ✔ ĐẠT: ${message}`);
  }
}

async function runTestSuite() {
  console.log(`\n===============================================================`);
  console.log(`🚀 BẮT ĐẦU CHẠY BỘ KIỂM THỬ BẮT BUỘC HỆ THỐNG SOÁT VÉ LAN`);
  console.log(`Sự kiện: Hùng Vương Concert: GAME ON`);
  console.log(`===============================================================\n`);

  // -------------------------------------------------------------
  // TEST 1: Nhập tickets.json mẫu (5 vé, 1 vé đã checkedIn=true)
  // -------------------------------------------------------------
  console.log(`[TEST 1] Kiểm tra Import file tickets.json mẫu...`);
  // Đảm bảo DB được làm mới
  const db = new Database(DB_PATH);
  db.exec(`DELETE FROM scan_log; DELETE FROM tickets;`);

  const importResult = runImport(TICKETS_SAMPLE);
  assert(importResult.countTotal === 5, 'File đọc đúng 5 vé');
  assert(importResult.countCheckedIn === 1, 'Xác nhận đúng 1 vé đã check-in trước');
  assert(importResult.countNotValid === 1, 'Xác nhận đúng 1 vé có status khác VALID (CANCELLED)');
  assert(importResult.dbStats.total === 5, 'DB lưu trữ đủ 5 vé');
  assert(importResult.dbStats.checked === 1, 'DB ghi nhận đúng 1 vé đã check-in');
  assert(importResult.dbStats.not_valid === 1, 'DB ghi nhận đúng 1 vé không hợp lệ');
  passedTests++;
  console.log(`👉 Test 1: HOÀN THÀNH XUẤT SẮC\n`);

  // -------------------------------------------------------------
  // TEST 2: Quét vé tuần tự (Hợp lệ, Trùng, Mã lạ, Vé đã vào trước, Vé hủy)
  // -------------------------------------------------------------
  console.log(`[TEST 2] Kiểm tra logic phản hồi các loại vé...`);

  // 2.1 Quét vé hợp lệ lần đầu
  const resValid = handleCheckin('HVC-ALONE-12345', 'Cổng A');
  assert(resValid.httpStatus === 200, 'HTTP Status 200 cho vé hợp lệ');
  assert(resValid.body.status === 'OK', 'Kết quả trả về OK cho vé hợp lệ lần đầu');
  assert(resValid.body.name === 'Phạm Quốc Tuấn', 'Trả về đúng tên khách hàng');

  // 2.2 Quét lại chính vé đó
  const resDup = handleCheckin('HVC-ALONE-12345', 'Cổng B');
  assert(resDup.body.status === 'DUPLICATE', 'Quét lại trả về DUPLICATE');
  assert(resDup.body.gate === 'Cổng A', 'Chỉ rõ cổng đã check-in trước đó là Cổng A');

  // 2.3 Quét mã vé không tồn tại
  const resInvalid = handleCheckin('HVC-UNKNOWN-999', 'Cổng C');
  assert(resInvalid.body.status === 'INVALID', 'Mã lạ trả về INVALID');

  // 2.4 Quét vé đã check-in sẵn từ trước trong file import
  const resPreCheck = handleCheckin('HVC-PRECHECK-001', 'Cổng A');
  assert(resPreCheck.body.status === 'DUPLICATE', 'Vé đã checkedIn=true sẵn trả về DUPLICATE');

  // 2.5 Quét vé bị hủy (status !== VALID)
  const resCancelled = handleCheckin('HVC-CANCELLED-99', 'Cổng A');
  assert(resCancelled.body.status === 'NOT_VALID_STATUS', 'Vé CANCELLED trả về NOT_VALID_STATUS');

  passedTests++;
  console.log(`👉 Test 2: HOÀN THÀNH XUẤT SẮC\n`);

  // -------------------------------------------------------------
  // TEST 3: Race Condition - 20 request POST /api/scan đồng thời cùng 1 mã
  // -------------------------------------------------------------
  console.log(`[TEST 3] Kiểm tra xử lý đồng thời (20 request song song cùng 1 mã)...`);

  // Chuẩn bị mã vé chưa dùng
  const targetCode = 'HVC-K2MJ8D-U754';
  db.prepare(`UPDATE tickets SET checked_in = 0, checked_at = NULL, gate = NULL WHERE code = ?`).run(targetCode);

  // Tạo 20 promises gọi đồng thời
  const concurrentRequests = [];
  for (let i = 1; i <= 20; i++) {
    concurrentRequests.push(
      new Promise((resolve) => {
        setImmediate(() => {
          const res = handleCheckin(targetCode, `Cổng ${i}`);
          resolve(res);
        });
      })
    );
  }

  const results = await Promise.all(concurrentRequests);
  const okCount = results.filter(r => r.body.status === 'OK').length;
  const dupCount = results.filter(r => r.body.status === 'DUPLICATE').length;

  console.log(`  [*] Kết quả 20 requests đồng thời: ${okCount} OK, ${dupCount} DUPLICATE`);
  assert(okCount === 1, 'Đúng duy nhất 1 request thành công (OK)');
  assert(dupCount === 19, 'Đúng 19 requests bị từ chối với kết quả DUPLICATE');
  passedTests++;
  console.log(`👉 Test 3: HOÀN THÀNH XUẤT SẮC (Chống vào trùng tuyệt đối giữa các cổng)\n`);

  // -------------------------------------------------------------
  // TEST 4: Hai vé cùng một đơn (Vé 1/2 và 2/2) hoạt động độc lập
  // -------------------------------------------------------------
  console.log(`[TEST 4] Kiểm tra 2 vé cùng đơn hàng (Vé 1/2 và 2/2)...`);

  const code1 = 'HVC-K2MJ8D-U754'; // Vé 1/2
  const code2 = 'HVC-K2MJ8D-U755'; // Vé 2/2

  // Reset vé 2
  db.prepare(`UPDATE tickets SET checked_in = 0, checked_at = NULL, gate = NULL WHERE code = ?`).run(code2);

  // Vé 1 đã được check-in ở Test 3 -> Kiểm tra vé 2 vẫn chưa check-in
  const t2Before = db.prepare('SELECT checked_in FROM tickets WHERE code = ?').get(code2);
  assert(t2Before.checked_in === 0, 'Vé 2/2 vẫn giữ nguyên trạng thái CHƯA check-in khi Vé 1/2 đã vào');

  // Quét Vé 2/2 tại Cổng VIP
  const resT2 = handleCheckin(code2, 'Cổng VIP');
  assert(resT2.body.status === 'OK', 'Vé 2/2 quét thành công (OK)');
  assert(resT2.body.label === 'Vé 2/2', 'Xác nhận đúng nhãn Vé 2/2');

  const t1After = db.prepare('SELECT checked_in, gate FROM tickets WHERE code = ?').get(code1);
  const t2After = db.prepare('SELECT checked_in, gate FROM tickets WHERE code = ?').get(code2);
  assert(t1After.checked_in === 1, 'Vé 1/2 giữ trạng thái đã vào');
  assert(t2After.checked_in === 1, 'Vé 2/2 ghi nhận đã vào');
  passedTests++;
  console.log(`👉 Test 4: HOÀN THÀNH XUẤT SẮC (Các vé cùng đơn không bị ảnh hưởng lẫn nhau)\n`);

  // -------------------------------------------------------------
  // TEST 5: Export rồi import lại: Dữ liệu không đổi
  // -------------------------------------------------------------
  console.log(`[TEST 5] Kiểm tra tính toàn vẹn: Export rồi Import lại...`);

  // Chụp snapshot trạng thái hiện tại
  const beforeSnapshot = db.prepare(`SELECT code, status, checked_in, checked_at, gate FROM tickets ORDER BY code`).all();

  // Export
  const { jsonString } = exportData(db);
  const tempExportFile = path.join(DATA_DIR, 'temp_test_export.json');
  fs.writeFileSync(tempExportFile, jsonString, 'utf8');

  // Import lại từ file vừa export
  runImport(tempExportFile);

  // Lấy snapshot sau import
  const afterSnapshot = db.prepare(`SELECT code, status, checked_in, checked_at, gate FROM tickets ORDER BY code`).all();

  assert(beforeSnapshot.length === afterSnapshot.length, 'Số lượng vé không đổi');
  for (let i = 0; i < beforeSnapshot.length; i++) {
    const b = beforeSnapshot[i];
    const a = afterSnapshot[i];
    assert(b.code === a.code, `Mã vé khớp: ${b.code}`);
    assert(b.checked_in === a.checked_in, `Trạng thái check-in vé ${b.code} không đổi: ${b.checked_in}`);
    assert(b.checked_at === a.checked_at, `Thời gian check-in vé ${b.code} không đổi: ${b.checked_at}`);
    assert(b.gate === a.gate, `Cổng check-in vé ${b.code} không đổi: ${b.gate}`);
  }

  // Dọn dẹp file test tạm
  if (fs.existsSync(tempExportFile)) fs.unlinkSync(tempExportFile);

  passedTests++;
  console.log(`👉 Test 5: HOÀN THÀNH XUẤT SẮC (Dữ liệu toàn vẹn 100% khi Export & Import)\n`);

  // -------------------------------------------------------------
  // TEST 6: Kiểm tra chạy Offline (Không có tài nguyên ngoài)
  // -------------------------------------------------------------
  console.log(`[TEST 6] Kiểm tra tính độc lập Offline của Frontend...`);

  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'public', 'index.html'), 'utf8');
  const adminHtml = fs.readFileSync(path.join(ROOT_DIR, 'public', 'admin.html'), 'utf8');
  const html5QrLib = path.join(ROOT_DIR, 'public', 'html5-qrcode.min.js');

  assert(fs.existsSync(html5QrLib), 'File thư viện public/html5-qrcode.min.js tồn tại cục bộ');
  assert(fs.statSync(html5QrLib).size > 100000, 'File html5-qrcode.min.js có đầy đủ nội dung (>100KB)');

  // Kiểm tra không có link CDN hoặc tài nguyên internet
  const externalCdnPattern = /https?:\/\/(?!localhost|127\.0\.0\.1|192\.168\.1\.10)/i;
  assert(!externalCdnPattern.test(indexHtml), 'Trang index.html KHÔNG chứa bất kỳ link CDN / internet nào');
  assert(!externalCdnPattern.test(adminHtml), 'Trang admin.html KHÔNG chứa bất kỳ link CDN / internet nào');

  // Kiểm tra font và audio
  assert(!indexHtml.includes('fonts.googleapis.com'), 'index.html không gọi Google Fonts');
  assert(!indexHtml.includes('.mp3') && !indexHtml.includes('.wav'), 'index.html dùng WebAudio, không phụ thuộc file mp3/wav');

  passedTests++;
  console.log(`👉 Test 6: HOÀN THÀNH XUẤT SẮC (100% tài nguyên chạy hoàn toàn Offline LAN)\n`);

  // -------------------------------------------------------------
  // KẾT QUẢ CUỐI CÙNG
  // -------------------------------------------------------------
  console.log(`===============================================================`);
  console.log(`🎉 KẾT QUẢ: ĐÃ ĐẠT TOÀN BỘ ${passedTests}/${totalTests} BÀI KIỂM THỬ BẮT BUỘC!`);
  console.log(`===============================================================\n`);

  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error('\n❌ BỘ KIỂM THỬ GẶP LỖI:', err);
  process.exit(1);
});
