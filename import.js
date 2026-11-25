/**
 * import.js - Nhập danh sách vé từ JSON hoặc CSV vào SQLite
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

// Đảm bảo bảng tickets và scan_log đầy đủ các cột
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
    issued_at TEXT,
    note TEXT,
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

// Tự động thêm cột nếu database cũ chưa có
try { db.exec(`ALTER TABLE tickets ADD COLUMN issued_at TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE tickets ADD COLUMN note TEXT`); } catch (e) {}

/**
 * Hàm phân tích file CSV thuần (RFC 4180) không phụ thuộc thư viện ngoài
 */
function parseCSV(text) {
  // Loại bỏ BOM nếu có
  const cleanText = text.replace(/^\uFEFF/, '');
  const lines = [];
  let row = [];
  let inQuotes = false;
  let field = '';

  for (let i = 0; i < cleanText.length; i++) {
    const c = cleanText[i];
    const next = cleanText[i + 1];

    if (inQuotes) {
      if (c === '"') {
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field.trim());
        field = '';
      } else if (c === '\r' || c === '\n') {
        row.push(field.trim());
        field = '';
        if (row.some(f => f.length > 0)) lines.push(row);
        row = [];
        if (c === '\r' && next === '\n') i++;
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some(f => f.length > 0)) lines.push(row);
  }
  return lines;
}

/**
 * Xử lý import dữ liệu vé từ nội dung chuỗi (hỗ trợ cả JSON và CSV)
 * Trả về { success, countTotal, countCheckedIn, countNotValid, message }
 */
function importTicketsData(rawContent, filename = '') {
  if (!rawContent || !rawContent.trim()) {
    throw new Error('Dữ liệu rỗng');
  }

  const trimmed = rawContent.replace(/^\uFEFF/, '').trim();
  const isCsv = filename.toLowerCase().endsWith('.csv') ||
    (!filename.toLowerCase().endsWith('.json') && !trimmed.startsWith('{') && !trimmed.startsWith('['));
  let ticketsList = [];

  if (isCsv) {
    const csvRows = parseCSV(rawContent);
    if (csvRows.length < 2) {
      throw new Error('File CSV không có dữ liệu hoặc thiếu dòng tiêu đề');
    }

    const headers = csvRows[0].map(h => h.trim().toLowerCase());
    
    // Tìm index của các cột phổ biến (ưu tiên khớp chính xác toàn tên cột trước khớp chuỗi con)
    const findIndex = (names) => {
      for (const n of names) {
        const exactIdx = headers.findIndex(h => h === n.toLowerCase());
        if (exactIdx !== -1) return exactIdx;
      }
      for (const n of names) {
        const partialIdx = headers.findIndex(h => h.includes(n.toLowerCase()));
        if (partialIdx !== -1) return partialIdx;
      }
      return -1;
    };

    const codeIdx = findIndex(['mã vé', 'ticketcode', 'ticket_code', 'code', 'mã']);
    const nameIdx = findIndex(['họ tên', 'tên khách hàng', 'customername', 'tên', 'name']);
    const phoneIdx = findIndex(['số điện thoại', 'sđt', 'phone', 'điện thoại']);
    const emailIdx = findIndex(['email', 'thư điện tử']);
    const orderIdIdx = findIndex(['mã đơn hàng', 'orderid', 'order_id', 'đơn hàng']);
    const labelIdx = findIndex(['số thứ tự vé', 'số lượng vé', 'ticketlabel', 'label', 'vé số']);
    const typeIdx = findIndex(['loại vé', 'tickettypename', 'type']);
    const statusIdx = findIndex(['trạng thái', 'status']);
    const checkedInIdx = findIndex(['đã check-in', 'đã soát', 'checkedin', 'checked_in']);
    const checkedAtIdx = findIndex(['thời gian check-in', 'thời điểm check in', 'checkedinat', 'checked_at']);
    const gateIdx = findIndex(['cổng soát vé', 'cổng vào', 'cổng', 'gate']);
    const issuedAtIdx = findIndex(['thời điểm mua vé', 'thời gian mua vé', 'issuedat', 'purchasetime', 'ngày mua']);
    const noteIdx = findIndex(['ghi chú', 'note', 'voucher']);

    if (codeIdx === -1) {
      throw new Error('File CSV thiếu cột Mã vé (ticketCode)');
    }

    for (let r = 1; r < csvRows.length; r++) {
      const row = csvRows[r];
      const code = (row[codeIdx] || '').trim().toUpperCase();
      if (!code) continue;

      const checkedInVal = checkedInIdx !== -1 ? (row[checkedInIdx] || '').trim().toLowerCase() : '';
      const isChecked = checkedInVal === '1' || checkedInVal === 'true' || checkedInVal.includes('đã');

      ticketsList.push({
        ticketCode: code,
        customerName: nameIdx !== -1 ? row[nameIdx] : '',
        phone: phoneIdx !== -1 ? row[phoneIdx] : '',
        email: emailIdx !== -1 ? row[emailIdx] : '',
        orderId: orderIdIdx !== -1 ? row[orderIdIdx] : '',
        ticketLabel: labelIdx !== -1 ? row[labelIdx] : 'Vé 1/1',
        ticketTypeName: typeIdx !== -1 ? row[typeIdx] : 'Vé Sự Kiện',
        status: statusIdx !== -1 ? (row[statusIdx] || 'VALID').trim().toUpperCase() : 'VALID',
        checkedIn: isChecked,
        checkedInAt: checkedAtIdx !== -1 && isChecked ? row[checkedAtIdx] : null,
        gate: gateIdx !== -1 && isChecked ? (row[gateIdx] || null) : null,
        issuedAt: issuedAtIdx !== -1 ? row[issuedAtIdx] : null,
        note: noteIdx !== -1 ? row[noteIdx] : ''
      });
    }
  } else {
    // Xử lý JSON
    let data;
    try {
      data = JSON.parse(rawContent);
    } catch (err) {
      throw new Error('Định dạng JSON không hợp lệ: ' + err.message);
    }

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
  }

  if (ticketsList.length === 0) {
    throw new Error('Không tìm thấy vé nào hợp lệ trong dữ liệu');
  }

  const upsertStmt = db.prepare(`
    INSERT INTO tickets (
      code, name, phone, email, order_id, label, type, status, checked_in, checked_at, gate, issued_at, note, raw_json
    ) VALUES (
      @code, @name, @phone, @email, @order_id, @label, @type, @status, @checked_in, @checked_at, @gate, @issued_at, @note, @raw_json
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
      issued_at = COALESCE(excluded.issued_at, tickets.issued_at),
      note = CASE WHEN excluded.note IS NOT NULL AND excluded.note != '' THEN excluded.note ELSE tickets.note END,
      raw_json = excluded.raw_json
  `);

  let countTotal = 0;
  let countCheckedIn = 0;
  let countNotValid = 0;

  const importTx = db.transaction((items) => {
    for (const item of items) {
      const code = (item.ticketCode || item.code || '').trim().toUpperCase();
      if (!code) continue;

      const rawStatus = (item.status || 'VALID').trim().toUpperCase();
      const checkedIn = item.checkedIn ? 1 : 0;
      const checkedAt = item.checkedInAt || null;
      const gate = item.gate || (checkedIn ? 'PRE_CHECKIN' : null);
      const issuedAt = item.issuedAt || item.issued_at || null;
      const note = item.note || item.notes || item.ghiChu || '';

      if (checkedIn === 1) countCheckedIn++;
      if (rawStatus !== 'VALID') countNotValid++;

      upsertStmt.run({
        code,
        name: item.customerName || item.name || '',
        phone: item.phone || '',
        email: item.email || '',
        order_id: item.orderId || item.order_id || '',
        label: item.ticketLabel || item.label || 'Vé 1/1',
        type: item.ticketTypeName || item.type || 'Vé Sự Kiện',
        status: rawStatus,
        checked_in: checkedIn,
        checked_at: checkedAt,
        gate,
        issued_at: issuedAt,
        note: note,
        raw_json: JSON.stringify(item)
      });
      countTotal++;
    }
  });

  importTx(ticketsList);

  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN checked_in = 1 THEN 1 ELSE 0 END) AS checked,
      SUM(CASE WHEN status != 'VALID' THEN 1 ELSE 0 END) AS not_valid
    FROM tickets
  `).get();

  return {
    success: true,
    countTotal,
    countCheckedIn,
    countNotValid,
    dbStats: stats,
    message: 'Nhập thành công'
  };
}

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

  try {
    const result = importTicketsData(rawContent, targetFile);
    console.log(`[+] ${result.message}!`);
    console.log(`----------------------------------------`);
    console.log(`- File đã đọc:               ${result.countTotal} vé`);
    console.log(`- Số vé đã check-in sẵn:     ${result.countCheckedIn} vé`);
    console.log(`- Số vé status khác VALID:   ${result.countNotValid} vé`);
    console.log(`----------------------------------------`);
    console.log(`[*] Hiện có trong Database:`);
    console.log(`  + Tổng số vé trong DB:     ${result.dbStats.total} vé`);
    console.log(`  + Đã check-in:             ${result.dbStats.checked} vé`);
    console.log(`  + Còn lại (chưa check-in): ${result.dbStats.total - result.dbStats.checked} vé`);
    console.log(`  + Vé không hợp lệ (hủy):   ${result.dbStats.not_valid} vé`);
    console.log(`========================================\n`);
    return result;
  } catch (err) {
    console.error(`[!] LỖI import:`, err.message);
    process.exit(1);
  }
}

// Nếu chạy trực tiếp từ dòng lệnh
if (require.main === module) {
  const filePath = process.argv[2];
  runImport(filePath);
}

module.exports = { runImport, importTicketsData, parseCSV, db };
