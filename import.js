/**
 * import.js - Nhập danh sách vé từ tickets.json vào SQLite
 * Sự kiện: Hùng Vương Concert: GAME ON
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'tickets.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Khởi tạo Database SQLite (WAL Mode)
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Tạo bảng tickets và scan_log
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    code TEXT PRIMARY KEY,
    name TEXT,
    phone TEXT,
    email TEXT,
    order_id TEXT,
    label TEXT,
    type TEXT,
    status TEXT,
    checked_in INTEGER DEFAULT 0,
    checked_at TEXT,
    gate TEXT,
    raw_json TEXT
  );

  CREATE TABLE IF NOT EXISTS scan_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    result TEXT,
    gate TEXT,
    at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tickets_order ON tickets(order_id);
  CREATE INDEX IF NOT EXISTS idx_tickets_search ON tickets(name, phone);
  CREATE INDEX IF NOT EXISTS idx_scan_log_code ON scan_log(code);
  CREATE INDEX IF NOT EXISTS idx_scan_log_at ON scan_log(at);
`);

function runImport(filePath) {
  let targetFile = filePath;
  if (!targetFile) {
    const rootSample = path.join(__dirname, 'tickets_sample.json');
    const dataSample = path.join(DATA_DIR, 'tickets.json');
    if (fs.existsSync(rootSample)) {
      targetFile = rootSample;
    } else {
      targetFile = dataSample;
    }
  }

  console.log(`\n========================================`);
  console.log(`[*] Bắt đầu nhập vé từ: ${targetFile}`);

  if (!fs.existsSync(targetFile)) {
    console.error(`[!] LỖI: Không tìm thấy file: ${targetFile}`);
    process.exit(1);
  }

  let rawContent;
  try {
    rawContent = fs.readFileSync(targetFile, 'utf8');
  } catch (err) {
    console.error(`[!] LỖI đọc file:`, err.message);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(rawContent);
  } catch (err) {
    console.error(`[!] LỖI parse JSON:`, err.message);
    process.exit(1);
  }

  // Hỗ trợ cả { tickets: { ... } }, { ... } hoặc [ ... ]
  let ticketsList = [];
  if (data.tickets && typeof data.tickets === 'object' && !Array.isArray(data.tickets)) {
    ticketsList = Object.entries(data.tickets).map(([code, item]) => ({
      ...item,
      ticketCode: item.ticketCode || code
    }));
  } else if (Array.isArray(data)) {
    ticketsList = data;
  } else if (typeof data === 'object') {
    ticketsList = Object.entries(data).map(([code, item]) => ({
      ...item,
      ticketCode: item.ticketCode || code
    }));
  }

  const upsertStmt = db.prepare(`
    INSERT INTO tickets (
      code, name, phone, email, order_id, label, type, status, checked_in, checked_at, gate, raw_json
    ) VALUES (
      @code, @name, @phone, @email, @order_id, @label, @type, @status, @checked_in, @checked_at, @gate, @raw_json
    )
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      phone = excluded.phone,
      email = excluded.email,
      order_id = excluded.order_id,
      label = excluded.label,
      type = excluded.type,
      status = excluded.status,
      checked_in = CASE WHEN tickets.checked_in = 1 THEN 1 ELSE excluded.checked_in END,
      checked_at = CASE WHEN tickets.checked_in = 1 THEN tickets.checked_at ELSE excluded.checked_at END,
      gate = CASE WHEN tickets.checked_in = 1 THEN tickets.gate ELSE excluded.gate END,
      raw_json = excluded.raw_json
  `);

  let countTotal = 0;
  let countCheckedIn = 0;
  let countNotValid = 0;

  const importTx = db.transaction((items) => {
    for (const item of items) {
      const code = (item.ticketCode || item.code || '').trim().toUpperCase();
      if (!code) continue;

      const status = (item.status || 'VALID').trim().toUpperCase();
      const checkedIn = item.checkedIn ? 1 : 0;
      const checkedAt = item.checkedInAt || null;
      const gate = item.gate || (checkedIn ? 'PRE_CHECKIN' : null);

      if (checkedIn === 1) countCheckedIn++;
      if (status !== 'VALID') countNotValid++;

      upsertStmt.run({
        code,
        name: item.customerName || item.name || '',
        phone: item.phone || '',
        email: item.email || '',
        order_id: item.orderId || item.order_id || '',
        label: item.ticketLabel || item.label || '',
        type: item.ticketTypeName || item.type || '',
        status,
        checked_in: checkedIn,
        checked_at: checkedAt,
        gate,
        raw_json: JSON.stringify(item)
      });
      countTotal++;
    }
  });

  importTx(ticketsList);

  // Thống kê hiện tại trong DB
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN checked_in = 1 THEN 1 ELSE 0 END) AS checked,
      SUM(CASE WHEN status != 'VALID' THEN 1 ELSE 0 END) AS not_valid
    FROM tickets
  `).get();

  console.log(`[+] Nhập dữ liệu thành công!`);
  console.log(`----------------------------------------`);
  console.log(`- File đã đọc:               ${countTotal} vé`);
  console.log(`- Số vé đã check-in sẵn:     ${countCheckedIn} vé`);
  console.log(`- Số vé status khác VALID:   ${countNotValid} vé`);
  console.log(`----------------------------------------`);
  console.log(`[*] Hiện có trong Database:`);
  console.log(`  + Tổng số vé trong DB:     ${stats.total} vé`);
  console.log(`  + Đã check-in:             ${stats.checked} vé`);
  console.log(`  + Còn lại (chưa check-in): ${stats.total - stats.checked} vé`);
  console.log(`  + Vé không hợp lệ (hủy):   ${stats.not_valid} vé`);
  console.log(`========================================\n`);

  return { countTotal, countCheckedIn, countNotValid, dbStats: stats };
}

// Nếu chạy trực tiếp từ dòng lệnh
if (require.main === module) {
  const filePath = process.argv[2];
  runImport(filePath);
}

module.exports = { runImport, db };
