/**
 * make-sample-data.js - Sinh bộ dữ liệu vé MẪU (thông tin khách GIẢ LẬP) để chạy thử hệ thống.
 * Cùng cấu trúc file vé xuất từ PayOS (giống tickets_sample.json bản cũ).
 *
 * Cách dùng:
 *   node scripts/make-sample-data.js            -> tạo samples/tickets_sample.{json,csv,db}
 *   node scripts/make-sample-data.js 120        -> tạo khoảng 120 vé
 *
 * Kết quả:
 *   samples/tickets_sample.json  - Nhập qua nút "Nhập danh sách" hoặc: node import.js samples/tickets_sample.json
 *   samples/tickets_sample.csv   - Bản CSV (mở bằng Excel được) để thử nhập file CSV
 *   samples/tickets_sample.db    - CSDL SQLite dựng sẵn; tắt server rồi chép thành data/tickets.db để dùng ngay
 *
 * Dữ liệu được sinh cố định (cùng số lượng vé -> cùng kết quả) để dễ đối chiếu khi test.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'samples');
const TARGET_COUNT = Math.max(20, parseInt(process.argv[2] || '40', 10) || 40);

// Bộ sinh số giả ngẫu nhiên cố định (mulberry32)
let seed = 20261128;
function rand() {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const pad = (n, w = 2) => String(n).padStart(w, '0');

const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const DEM = ['Văn', 'Thị', 'Hoàng', 'Minh', 'Ngọc', 'Thanh', 'Gia', 'Quốc', 'Bảo', 'Thu', 'Đức', 'Khánh', 'Phương', 'Anh'];
const TEN = ['An', 'Bình', 'Châu', 'Dũng', 'Giang', 'Hà', 'Hải', 'Hân', 'Hiếu', 'Hùng', 'Khoa', 'Linh', 'Long', 'Mai', 'Nam', 'Ngân', 'Phúc', 'Quân', 'Tâm', 'Thảo', 'Trang', 'Tuấn', 'Vy', 'Yến'];
const NOTES = ['', '', '', '', 'voucher', 'voucher nước', 'quà tặng áo', 'khách VIP'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';

function randCode(len) {
  let s = '';
  for (let i = 0; i < len; i++) s += pick(CODE_CHARS);
  return s;
}

function noAccent(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

// ------------------------------------------------------------------
// Sinh đơn hàng & vé
// ------------------------------------------------------------------
const tickets = {};
const usedCodes = new Set();
let orderNo = 0;

while (Object.keys(tickets).length < TARGET_COUNT) {
  orderNo++;
  const ho = pick(HO), dem = pick(DEM), ten = pick(TEN);
  const name = `${ho} ${dem} ${ten}`;
  const email = `${noAccent(ten).toLowerCase()}.${noAccent(ho).toLowerCase()}${orderNo}@example.com`;
  const phone = `09${pad(Math.floor(rand() * 1e8), 8)}`;
  const payosOrderCode = 100000000 + orderNo;
  const day = 1 + Math.floor(rand() * 20);
  const issuedAt = `2026-11-${pad(day)}T${pad(8 + Math.floor(rand() * 14))}:${pad(Math.floor(rand() * 60))}:${pad(Math.floor(rand() * 60))}+07:00`;

  // Phân bố số vé / đơn: phần lớn 1 vé, một số đơn 2-4 vé
  const r = rand();
  const qty = r < 0.55 ? 1 : r < 0.85 ? 2 : r < 0.95 ? 3 : 4;
  const isVip = rand() < 0.12;

  for (let i = 1; i <= qty && Object.keys(tickets).length < TARGET_COUNT; i++) {
    let code;
    do { code = `HVC-${randCode(6)}-${randCode(4)}`; } while (usedCodes.has(code));
    usedCodes.add(code);

    tickets[code] = {
      checkedIn: false,
      checkedInAt: null,
      customerName: name,
      email,
      eventName: 'Hùng Vương Concert: GAME ON',
      issuedAt,
      issuedBy: 'PAYOS_AUTO',
      orderId: `ORD-${payosOrderCode}`,
      payosOrderCode,
      phone,
      status: 'VALID',
      ticketCode: code,
      ticketLabel: `Vé ${i}/${qty}`,
      ticketNumber: i,
      ticketTypeName: 'Vé Điện Tử (Player Pass QR)',
      unitPrice: 1000,
      note: isVip ? 'khách VIP' : pick(NOTES)
    };
  }
}

// ------------------------------------------------------------------
// Các tình huống đặc biệt để test (cố định theo vị trí)
// ------------------------------------------------------------------
const codes = Object.keys(tickets);
const scenarios = [];

// 3 vé đã bị hủy / hoàn tiền -> quét phải báo "Vé không hợp lệ"
for (const idx of [3, 11, 19]) {
  const t = tickets[codes[idx]];
  t.status = 'CANCELLED';
  t.note = 'Đã hoàn tiền';
  scenarios.push([t.ticketCode, 'CANCELLED - quét phải báo vé không hợp lệ']);
}
// 2 vé đã check-in sẵn từ trước -> quét phải báo DUPLICATE
for (const [idx, gate] of [[6, 'Cổng A'], [14, 'Cổng B']]) {
  const t = tickets[codes[idx]];
  t.checkedIn = true;
  t.checkedInAt = '2026-11-28T18:05:12+07:00';
  t.gate = gate;
  scenarios.push([t.ticketCode, `Đã soát sẵn tại ${gate} - quét phải báo DUPLICATE`]);
}

const jsonObj = {
  eventName: 'Hùng Vương Concert: GAME ON',
  note: 'DỮ LIỆU MẪU GIẢ LẬP - chỉ dùng để chạy thử, không phải khách hàng thật',
  totalTickets: codes.length,
  tickets
};

// ------------------------------------------------------------------
// Ghi file
// ------------------------------------------------------------------
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
const jsonPath = path.join(OUT_DIR, 'tickets_sample.json');
const csvPath = path.join(OUT_DIR, 'tickets_sample.csv');
const dbPath = path.join(OUT_DIR, 'tickets_sample.db');

fs.writeFileSync(jsonPath, JSON.stringify(jsonObj, null, 2) + '\n', 'utf8');

const csvEsc = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvHeader = ['Mã vé', 'Họ tên', 'Số điện thoại', 'Email', 'Mã đơn hàng', 'Số thứ tự vé', 'Loại vé', 'Trạng thái', 'Đã check-in', 'Thời gian check-in', 'Cổng soát vé', 'Thời điểm mua vé', 'Ghi chú'];
const csvLines = [csvHeader.join(',')];
for (const t of Object.values(tickets)) {
  csvLines.push([
    t.ticketCode, t.customerName, t.phone, t.email, t.orderId, t.ticketLabel, t.ticketTypeName,
    t.status, t.checkedIn ? 'ĐÃ VÀO' : 'CHƯA VÀO', t.checkedInAt || '', t.gate || '', t.issuedAt, t.note
  ].map(csvEsc).join(','));
}
fs.writeFileSync(csvPath, '﻿' + csvLines.join('\r\n') + '\r\n', 'utf8');

// Dựng sẵn file SQLite bằng chính import.js (chạy tiến trình riêng với DB_PATH trỏ vào samples/)
for (const suffix of ['', '-wal', '-shm']) {
  if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
}
execFileSync(process.execPath, ['-e', `
  const { importTicketsData } = require(${JSON.stringify(path.join(ROOT_DIR, 'import.js'))});
  const { getDb, closeDb } = require(${JSON.stringify(path.join(ROOT_DIR, 'db.js'))});
  importTicketsData(require('fs').readFileSync(${JSON.stringify(jsonPath)}, 'utf8'), 'tickets_sample.json');
  getDb().pragma('wal_checkpoint(TRUNCATE)');
  getDb().pragma('journal_mode = DELETE');
  closeDb();
`], { env: { ...process.env, DB_PATH: dbPath }, stdio: 'pipe' });

// ------------------------------------------------------------------
// Tóm tắt
// ------------------------------------------------------------------
const all = Object.values(tickets);
const orders = new Set(all.map(t => t.orderId)).size;
const withNote = all.filter(t => t.note && t.status === 'VALID').length;
console.log('\n========================================');
console.log(`[+] Đã tạo dữ liệu mẫu GIẢ LẬP: ${all.length} vé / ${orders} đơn hàng`);
console.log(`    - Vé hợp lệ chưa vào:   ${all.filter(t => t.status === 'VALID' && !t.checkedIn).length}`);
console.log(`    - Vé đã soát sẵn:       ${all.filter(t => t.checkedIn).length}`);
console.log(`    - Vé đã hủy:            ${all.filter(t => t.status !== 'VALID').length}`);
console.log(`    - Vé có ghi chú quà:    ${withNote}`);
console.log('----------------------------------------');
console.log('[*] Mã vé tình huống đặc biệt:');
for (const [code, desc] of scenarios) console.log(`    ${code}  ${desc}`);
console.log('----------------------------------------');
console.log(`  JSON: ${path.relative(ROOT_DIR, jsonPath)}`);
console.log(`  CSV:  ${path.relative(ROOT_DIR, csvPath)}`);
console.log(`  DB:   ${path.relative(ROOT_DIR, dbPath)}`);
console.log('========================================\n');
