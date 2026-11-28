/**
 * import.js - Nhập danh sách vé từ JSON hoặc CSV vào SQLite
 * Sự kiện: Hùng Vương Concert: GAME ON
 */

const fs = require('fs');
const path = require('path');
const { getDb } = require('./db');

const db = getDb();

// ------------------------------------------------------------------
// Chuẩn hóa dữ liệu đầu vào (file PayOS / Excel có thể chứa số, null,
// boolean dạng chuỗi...) để import không bị crash và không hiểu sai.
// ------------------------------------------------------------------

// Chuyển mọi kiểu giá trị về chuỗi đã trim ('' nếu null/undefined/object)
function toStr(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'bigint' || typeof val === 'boolean') return String(val);
  return '';
}

// Lấy giá trị đầu tiên không rỗng trong danh sách
function firstStr(...vals) {
  for (const v of vals) {
    const s = toStr(v);
    if (s) return s;
  }
  return '';
}

// Hiểu đúng trạng thái đã check-in: true, 1, "true", "1", "yes", "x", "đã soát"...
// Lưu ý: chuỗi "false" / "0" / "chưa soát" phải là CHƯA check-in.
function toBool(val) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  const s = toStr(val).toLowerCase();
  if (!s) return false;
  if (['1', 'true', 'yes', 'y', 'x', 'có', 'co'].includes(s)) return true;
  if (s.startsWith('chưa') || s.startsWith('chua') || s.startsWith('không') || s.startsWith('khong')) return false;
  return s.startsWith('đã') || s.startsWith('da ');
}

// Chuẩn hóa trạng thái vé về VALID / CANCELLED / giá trị gốc (viết hoa)
const VALID_ALIASES = ['VALID', 'HỢP LỆ', 'HOP LE', 'ACTIVE'];
const CANCELLED_ALIASES = ['CANCELLED', 'CANCELED', 'ĐÃ HỦY', 'DA HUY', 'HỦY', 'HUY', 'ĐÃ HUỶ', 'HUỶ', 'REFUNDED', 'HOÀN TIỀN', 'ĐÃ HOÀN TIỀN'];
function normalizeStatus(val) {
  const s = toStr(val).toUpperCase().replace(/\s+/g, ' ');
  if (!s || VALID_ALIASES.includes(s)) return 'VALID';
  if (CANCELLED_ALIASES.includes(s)) return 'CANCELLED';
  return s;
}

// Số điện thoại bị Excel/JSON lưu dạng số sẽ mất số 0 đầu (912345678 -> 0912345678)
function normalizePhone(val) {
  const s = toStr(val);
  if (/^[1-9]\d{8}$/.test(s)) return '0' + s;
  return s;
}

// Lấy danh sách vé từ các cấu trúc JSON hay gặp:
//  { tickets: { CODE: {...} } }, { tickets: [...] }, { data: [...] }, [...], { CODE: {...} }
function extractJsonTickets(data) {
  const fromMap = (obj) => Object.entries(obj)
    .filter(([, item]) => item && typeof item === 'object' && !Array.isArray(item))
    .map(([code, item]) => ({ ...item, ticketCode: firstStr(item.ticketCode, item.code, code) }));

  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const key of ['tickets', 'data', 'items']) {
    const v = data[key];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return fromMap(v);
  }
  return fromMap(data);
}

// Phát hiện dấu phân cách CSV: Excel tiếng Việt thường lưu bằng dấu chấm phẩy ';'
function detectDelimiter(text) {
  const firstLine = (text.replace(/^\uFEFF/, '').split(/\r?\n/)[0]) || '';
  const count = (ch) => firstLine.split(ch).length - 1;
  const candidates = [[',', count(',')], [';', count(';')], ['\t', count('\t')]];
  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0][1] > 0 ? candidates[0][0] : ',';
}

/**
 * Hàm phân tích file CSV thuần (RFC 4180) không phụ thuộc thư viện ngoài
 */
function parseCSV(text, delimiter = detectDelimiter(text)) {
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
      } else if (c === delimiter) {
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
  if (typeof rawContent !== 'string' || !rawContent.trim()) {
    throw new Error('Dữ liệu rỗng');
  }
  filename = toStr(filename);

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
      const code = toStr(row[codeIdx]).toUpperCase();
      if (!code) continue;

      const isChecked = checkedInIdx !== -1 ? toBool(row[checkedInIdx]) : false;

      ticketsList.push({
        ticketCode: code,
        customerName: nameIdx !== -1 ? row[nameIdx] : '',
        phone: phoneIdx !== -1 ? row[phoneIdx] : '',
        email: emailIdx !== -1 ? row[emailIdx] : '',
        orderId: orderIdIdx !== -1 ? row[orderIdIdx] : '',
        ticketLabel: labelIdx !== -1 ? row[labelIdx] : 'Vé 1/1',
        ticketTypeName: typeIdx !== -1 ? row[typeIdx] : 'Vé Sự Kiện',
        status: statusIdx !== -1 ? row[statusIdx] : 'VALID',
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

    ticketsList = extractJsonTickets(data);
  }

  // Bỏ các phần tử không phải object (null, số, chuỗi...) trong mảng JSON
  ticketsList = ticketsList.filter(item => item && typeof item === 'object' && !Array.isArray(item));

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
      const code = firstStr(item.ticketCode, item.code).toUpperCase();
      if (!code) continue;

      const rawStatus = normalizeStatus(item.status);
      const checkedIn = toBool(item.checkedIn !== undefined ? item.checkedIn : item.checked_in) ? 1 : 0;
      const checkedAt = checkedIn ? (firstStr(item.checkedInAt, item.checked_at) || null) : null;
      const gate = checkedIn ? (firstStr(item.gate) || 'PRE_CHECKIN') : null;
      const issuedAt = firstStr(item.issuedAt, item.issued_at) || null;
      const note = firstStr(item.note, item.notes, item.ghiChu);

      if (checkedIn === 1) countCheckedIn++;
      if (rawStatus !== 'VALID') countNotValid++;

      upsertStmt.run({
        code,
        name: firstStr(item.customerName, item.name),
        phone: normalizePhone(item.phone),
        email: firstStr(item.email),
        order_id: firstStr(item.orderId, item.order_id),
        label: firstStr(item.ticketLabel, item.label) || 'Vé 1/1',
        type: firstStr(item.ticketTypeName, item.type) || 'Vé Sự Kiện',
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
      SUM(CASE WHEN status != 'VALID' THEN 1 ELSE 0 END) AS not_valid,
      SUM(CASE WHEN status = 'VALID' AND checked_in = 0 THEN 1 ELSE 0 END) AS remaining
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
  const targetFile = filePath;
  if (!targetFile) {
    console.error('[!] Cách dùng: node import.js <đường dẫn file vé .json hoặc .csv>');
    process.exit(1);
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
    console.log(`  + Còn lại (VALID, chưa vào): ${result.dbStats.remaining} vé`);
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

module.exports = { runImport, importTicketsData, parseCSV, db, toStr, toBool, normalizeStatus };
