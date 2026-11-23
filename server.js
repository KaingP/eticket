/**
 * server.js - Server soát vé offline (HTTPS + SQLite WAL + Express)
 * Sự kiện: Hùng Vương Concert: GAME ON
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const https = require('https');
const http = require('http');
const express = require('express');
const QRCode = require('qrcode');
const Database = require('better-sqlite3');
const { exportData } = require('./export');
const { importTicketsData } = require('./import');

// Biến môi trường
const PORT = parseInt(process.env.PORT || '443', 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '80', 10);
const ADMIN_PIN = process.env.ADMIN_PIN || '123456';

const DATA_DIR = path.join(__dirname, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backup');
const DB_PATH = path.join(DATA_DIR, 'tickets.db');
const CERTS_DIR = path.join(__dirname, 'certs');
const CERT_PATH = path.join(CERTS_DIR, 'cert.pem');
const KEY_PATH = path.join(CERTS_DIR, 'key.pem');

// Đảm bảo thư mục tồn tại
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// Kết nối SQLite (WAL mode)
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Khởi tạo bảng nếu chưa có
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

// Thêm cột nếu DB cũ chưa có
try { db.exec(`ALTER TABLE tickets ADD COLUMN issued_at TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE tickets ADD COLUMN note TEXT`); } catch (e) {}

// Prepared Statements tối ưu tốc độ
const stmtUpdateCheckin = db.prepare(`
  UPDATE tickets
  SET checked_in = 1, checked_at = ?, gate = ?
  WHERE code = ? AND checked_in = 0 AND status = 'VALID'
`);

const stmtUpdateCheckinAny = db.prepare(`
  UPDATE tickets
  SET checked_in = 1, checked_at = ?, gate = ?
  WHERE code = ?
`);

const stmtGetTicket = db.prepare(`SELECT * FROM tickets WHERE code = ?`);

const stmtInsertLog = db.prepare(`
  INSERT INTO scan_log (code, result, gate, at)
  VALUES (?, ?, ?, ?)
`);

const stmtUndoCheckin = db.prepare(`
  UPDATE tickets
  SET checked_in = 0, checked_at = NULL, gate = NULL
  WHERE code = ? AND checked_in = 1
`);

// Hàm chuẩn hóa giờ ISO theo giờ Việt Nam (UTC+7)
function getVietnamISOString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const vnDate = new Date(utc + (7 * 3600000));

  const year = vnDate.getFullYear();
  const month = pad(vnDate.getMonth() + 1);
  const day = pad(vnDate.getDate());
  const hours = pad(vnDate.getHours());
  const minutes = pad(vnDate.getMinutes());
  const seconds = pad(vnDate.getSeconds());

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+07:00`;
}

// Phát hiện danh sách IP mạng LAN cục bộ của máy tính
function getLanIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const ip = iface.address;
        if (!ip.startsWith('169.254.')) {
          ips.push(ip);
        }
      }
    }
  }
  return ips;
}

// Lấy IP LAN chính xác nhất của máy chủ
function getPrimaryIp() {
  const ips = getLanIps();
  const lanIp = ips.find(ip => ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.'));
  return lanIp || ips[0] || '127.0.0.1';
}

// Tự động kiểm tra và sinh chứng chỉ SSL phù hợp với IP hiện tại
function ensureSslCert(primaryIp, allIps) {
  let needsGen = false;

  if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
    needsGen = true;
  } else {
    try {
      const certContent = fs.readFileSync(CERT_PATH, 'utf8');
      if (!certContent.includes(primaryIp) && primaryIp !== '127.0.0.1') {
        needsGen = true;
      }
    } catch (e) {
      needsGen = true;
    }
  }

  if (needsGen) {
    let opensslCmd = 'openssl';
    if (fs.existsSync('E:\\SBP\\c\\bin\\openssl.exe')) {
      opensslCmd = '"E:\\SBP\\c\\bin\\openssl.exe"';
    }

    try {
      const altNames = [
        `IP.1 = ${primaryIp}`,
        `IP.2 = 192.168.1.10`,
        `IP.3 = 192.168.137.1`,
        `IP.4 = 127.0.0.1`
      ];
      let ipIdx = 5;
      for (const ip of allIps) {
        if (!altNames.some(a => a.includes(ip))) {
          altNames.push(`IP.${ipIdx++} = ${ip}`);
        }
      }

      altNames.push(`DNS.1 = localhost`);
      altNames.push(`DNS.2 = soatve.local`);
      altNames.push(`DNS.3 = ${os.hostname().toLowerCase()}.local`);
      altNames.push(`DNS.4 = ${os.hostname().toLowerCase()}`);

      const cnfContent = `
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
C = VN
ST = Hanoi
L = Hanoi
O = Hung Vuong Concert
OU = Soat Ve LAN
CN = ${primaryIp}

[v3_req]
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
${altNames.join('\n')}
`;
      const tempCnf = path.join(CERTS_DIR, 'temp_openssl.cnf');
      fs.writeFileSync(tempCnf, cnfContent, 'utf8');
      execSync(`${opensslCmd} req -x509 -nodes -days 365 -newkey rsa:2048 -keyout "${KEY_PATH}" -out "${CERT_PATH}" -config "${tempCnf}"`, { stdio: 'pipe' });
      try { fs.unlinkSync(tempCnf); } catch(e) {}
      console.log(`[+] Đã tự động cập nhật chứng chỉ SSL cho IP: ${primaryIp}`);
    } catch (err) {
      // Bỏ qua nếu môi trường không có openssl
    }
  }
}

// Khởi tạo Express App
const app = express();

// Giới hạn body payload (cho phép upload file CSV/JSON lên đến 20MB)
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Phục vụ tĩnh thư mục public (HTML/JS/CSS cục bộ hoàn toàn)
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0 // Đảm bảo client luôn nhận code mới nhất khi tải trang
}));

// Logic xử lý check-in chung cho quét QR và nhập tay
function handleCheckin(rawCode, rawGate) {
  const code = (rawCode || '').trim().toUpperCase();
  const gate = (rawGate || 'Cổng chính').trim();
  const now = getVietnamISOString();

  if (!code) {
    return {
      httpStatus: 400,
      body: { status: 'INVALID', valid: false, message: 'Mã vé không được để trống' }
    };
  }

  // ATOMIC UPDATE: Chỉ 1 request duy nhất thắng nếu gửi đồng thời
  const updateResult = stmtUpdateCheckin.run(now, gate, code);

  if (updateResult.changes === 1) {
    // Check-in thành công
    const ticket = stmtGetTicket.get(code);
    stmtInsertLog.run(code, 'OK', gate, now);
    console.log(`[SCAN OK] Cổng: ${gate} | Mã: ${code} | Vé: ${ticket.label} | Tên: ${ticket.name}`);
    return {
      httpStatus: 200,
      body: {
        status: 'OK',
        valid: true,
        code: ticket.code,
        name: ticket.name,
        label: ticket.label,
        type: ticket.type,
        orderId: ticket.order_id,
        note: ticket.note || '',
        at: now,
        gate: gate,
        message: 'Thành công!'
      }
    };
  }

  // Update không thành công -> Phân tích nguyên nhân
  const ticket = stmtGetTicket.get(code);

  if (!ticket) {
    // Mã không tồn tại
    stmtInsertLog.run(code, 'INVALID', gate, now);
    console.log(`[SCAN INVALID] Cổng: ${gate} | Mã không tồn tại: ${code}`);
    return {
      httpStatus: 200,
      body: {
        status: 'INVALID',
        valid: false,
        code: code,
        message: 'Mã vé không tồn tại trong hệ thống'
      }
    };
  }

  if (ticket.status !== 'VALID') {
    // Vé bị hủy / hoàn tiền / không hợp lệ
    stmtInsertLog.run(code, 'NOT_VALID_STATUS', gate, now);
    console.log(`[SCAN NOT_VALID] Cổng: ${gate} | Mã: ${code} | Trạng thái vé: ${ticket.status}`);
    return {
      httpStatus: 200,
      body: {
        status: 'NOT_VALID_STATUS',
        valid: false,
        code: code,
        name: ticket.name,
        ticketStatus: ticket.status,
        message: `Vé không hợp lệ (Trạng thái: ${ticket.status})`
      }
    };
  }

  if (ticket.checked_in === 1) {
    // Vé đã vào trước đó
    stmtInsertLog.run(code, 'DUPLICATE', gate, now);
    console.log(`[SCAN DUPLICATE] Cổng: ${gate} | Mã: ${code} | Đã vào lúc: ${ticket.checked_at} tại ${ticket.gate}`);
    return {
      httpStatus: 200,
      body: {
        status: 'DUPLICATE',
        valid: false,
        code: code,
        name: ticket.name,
        label: ticket.label,
        at: ticket.checked_at,
        gate: ticket.gate,
        message: `Vé đã được soát lúc ${ticket.checked_at || ''} ${ticket.gate ? '(' + ticket.gate + ')' : ''}`
      }
    };
  }

  // Trường hợp dự phòng
  stmtInsertLog.run(code, 'ERROR', gate, now);
  return {
    httpStatus: 500,
    body: { status: 'ERROR', valid: false, message: 'Lỗi không xác định khi soát vé' }
  };
}

// 1. API Quét QR (Diagram 1)
app.post('/api/scan', (req, res) => {
  const { code, gate } = req.body;
  const result = handleCheckin(code, gate);
  res.status(result.httpStatus).json(result.body);
});

// 2. API Check-in thủ công (Diagram 0: Thay đổi trạng thái thủ công từ "Chưa soát" -> "Đã soát")
app.post('/api/manual-checkin', (req, res) => {
  const { code, gate, toggle } = req.body;
  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode) {
    return res.status(400).json({ status: 'INVALID', message: 'Mã vé không được để trống' });
  }

  const ticket = stmtGetTicket.get(cleanCode);
  if (!ticket) {
    return res.status(404).json({ status: 'INVALID', message: 'Mã vé không tồn tại trong hệ thống' });
  }

  const now = getVietnamISOString();
  const gateName = (gate || 'Thủ công').trim();

  if (ticket.checked_in === 1 && toggle) {
    // Hoàn tác về Chưa soát
    stmtUndoCheckin.run(cleanCode);
    stmtInsertLog.run(cleanCode, 'UNDO', gateName, now);
    console.log(`[MANUAL UNDO] Mã: ${cleanCode} -> Chưa soát`);
    return res.json({ status: 'OK', checked_in: 0, checked_at: null, message: 'Đã hoàn tác trạng thái Chưa soát' });
  } else {
    // Đánh dấu Đã soát
    stmtUpdateCheckinAny.run(now, gateName, cleanCode);
    stmtInsertLog.run(cleanCode, 'OK', gateName, now);
    console.log(`[MANUAL CHECKIN] Mã: ${cleanCode} -> Đã soát`);
    return res.json({ status: 'OK', checked_in: 1, checked_at: now, message: 'Đã chuyển sang Đã soát' });
  }
});

// 3. API Thống kê Dashboard (Diagram 2 & 3: Tất cả, Đã soát, Chưa soát + Refresh)
app.get('/api/stats', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_all,
        SUM(CASE WHEN checked_in = 1 THEN 1 ELSE 0 END) AS checked,
        SUM(CASE WHEN checked_in = 0 THEN 1 ELSE 0 END) AS unchecked,
        SUM(CASE WHEN status = 'VALID' THEN 1 ELSE 0 END) AS total_valid,
        SUM(CASE WHEN status = 'VALID' AND checked_in = 0 THEN 1 ELSE 0 END) AS remaining
      FROM tickets
    `).get();

    // Thống kê theo cổng
    const gateRows = db.prepare(`
      SELECT gate, COUNT(*) AS count
      FROM tickets
      WHERE checked_in = 1 AND gate IS NOT NULL
      GROUP BY gate
      ORDER BY count DESC
    `).all();

    const by_gate = {};
    for (const g of gateRows) {
      by_gate[g.gate] = g.count;
    }

    // 20 lượt quét gần nhất kèm thông tin vé
    const recent_scans = db.prepare(`
      SELECT
        l.id,
        l.code,
        l.result,
        l.gate,
        l.at,
        t.name,
        t.label,
        t.type
      FROM scan_log l
      LEFT JOIN tickets t ON l.code = t.code
      ORDER BY l.id DESC
      LIMIT 20
    `).all();

    res.json({
      all: stats.total_all || 0,
      checked: stats.checked || 0,
      unchecked: stats.unchecked || 0,
      total: stats.total_valid || 0,
      totalAll: stats.total_all || 0,
      remaining: stats.remaining || 0,
      by_gate,
      recent_scans
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. API Lấy danh sách vé có lọc theo Dashboard, tìm kiếm mã vé, phân trang (Diagram 0, 2, 3)
app.get('/api/tickets', (req, res) => {
  try {
    const status = req.query.status || 'all'; // 'all', 'checked', 'unchecked'
    const search = (req.query.search || '').trim();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(Math.max(1, parseInt(req.query.limit || '8', 10)), 100);
    const offset = (page - 1) * limit;

    let whereClauses = [];
    let params = [];

    if (status === 'checked') {
      whereClauses.push('checked_in = 1');
    } else if (status === 'unchecked') {
      whereClauses.push('checked_in = 0');
    }

    if (search) {
      whereClauses.push('(code LIKE ? OR name LIKE ? OR phone LIKE ? OR order_id LIKE ?)');
      const p = `%${search}%`;
      params.push(p, p, p, p);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const countSql = `SELECT COUNT(*) AS total FROM tickets ${whereSql}`;
    const total = db.prepare(countSql).get(...params).total;

    const dataSql = `
      SELECT code, name, phone, email, order_id, label, type, status, checked_in, checked_at, gate, issued_at, note, raw_json
      FROM tickets
      ${whereSql}
      ORDER BY 
        CASE WHEN ? = '' THEN 1 ELSE 0 END,
        checked_at DESC, 
        order_id ASC, 
        code ASC
      LIMIT ? OFFSET ?
    `;
    const rows = db.prepare(dataSql).all(search, ...params, limit, offset);

    const tickets = rows.map((r, idx) => ({
      stt: offset + idx + 1,
      code: r.code,
      name: r.name || '',
      email: r.email || '',
      phone: r.phone || '',
      orderId: r.order_id || '',
      label: r.label || 'Vé 1/1',
      type: r.type || 'Vé Sự Kiện',
      status: r.status,
      checkedIn: r.checked_in,
      displayStatus: r.checked_in === 1 ? 'Đã soát' : 'Chưa soát',
      checkedAt: r.checked_at,
      issuedAt: r.issued_at,
      gate: r.gate,
      note: r.note || '',
      rawJson: r.raw_json
    }));

    res.json({
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      tickets
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. API Chi tiết mã vé (Diagram 0: Xem chi tiết thông tin vé)
app.get('/api/tickets/:code', (req, res) => {
  const code = (req.params.code || '').trim().toUpperCase();
  const ticket = stmtGetTicket.get(code);
  if (!ticket) {
    return res.status(404).json({ error: 'Không tìm thấy vé' });
  }

  let paymentInfo = '';
  let customerInfo = {};
  try {
    if (ticket.raw_json) {
      const parsed = JSON.parse(ticket.raw_json);
      customerInfo = parsed;
      const parts = [];
      if (parsed.issuedBy) parts.push(`Nguồn: ${parsed.issuedBy}`);
      if (parsed.payosOrderCode) parts.push(`Mã GD: ${parsed.payosOrderCode}`);
      if (parsed.unitPrice) parts.push(`Giá: ${Number(parsed.unitPrice).toLocaleString('vi-VN')} đ`);
      paymentInfo = parts.join(' | ');
    }
  } catch (e) {}

  res.json({
    code: ticket.code,
    name: ticket.name,
    email: ticket.email,
    phone: ticket.phone,
    orderId: ticket.order_id,
    label: ticket.label,
    type: ticket.type,
    status: ticket.status,
    checkedIn: ticket.checked_in,
    displayStatus: ticket.checked_in === 1 ? 'Đã soát' : 'Chưa soát',
    checkedAt: ticket.checked_at,
    gate: ticket.gate,
    issuedAt: ticket.issued_at,
    note: ticket.note || '',
    paymentInfo: paymentInfo,
    rawDetails: customerInfo
  });
});

// 5.1 API Cập nhật ghi chú (Note) cho vé
app.post('/api/tickets/:code/note', (req, res) => {
  const code = (req.params.code || '').trim().toUpperCase();
  const note = (req.body.note || '').trim();
  const result = db.prepare('UPDATE tickets SET note = ? WHERE code = ?').run(note, code);
  if (result.changes === 1) {
    res.json({ success: true, status: 'OK', code, note });
  } else {
    res.status(404).json({ success: false, message: 'Không tìm thấy vé' });
  }
});

// 6. API Nhập danh sách vé (Diagram 0: Nhập file .csv hoặc .json)
app.post('/api/import', (req, res) => {
  try {
    const { filename, content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'File lỗi: Dữ liệu rỗng' });
    }
    const result = importTicketsData(content, filename || '');
    res.json(result);
  } catch (err) {
    console.error('[IMPORT ERROR]', err.message);
    res.status(400).json({ success: false, message: 'File lỗi: ' + err.message });
  }
});

// 7. API Tìm kiếm tra tay
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) {
    return res.json([]);
  }

  const queryPattern = `%${q}%`;
  const rows = db.prepare(`
    SELECT
      code,
      name,
      phone,
      email,
      order_id,
      label,
      type,
      status,
      checked_in,
      checked_at,
      gate,
      issued_at,
      note
    FROM tickets
    WHERE
      code LIKE ? OR
      name LIKE ? OR
      phone LIKE ? OR
      order_id LIKE ?
    ORDER BY checked_in ASC, name ASC
    LIMIT 20
  `).all(queryPattern, queryPattern, queryPattern, queryPattern);

  res.json(rows);
});

// 8. API Hoàn tác check-in (Yêu cầu PIN)
app.post('/api/undo', (req, res) => {
  const { code, pin } = req.body;
  if (!pin || String(pin) !== String(ADMIN_PIN)) {
    return res.status(403).json({ status: 'FORBIDDEN', message: 'Mã PIN quản trị không chính xác' });
  }

  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode) {
    return res.status(400).json({ status: 'ERROR', message: 'Mã vé không hợp lệ' });
  }

  const now = getVietnamISOString();
  const undoResult = stmtUndoCheckin.run(cleanCode);

  if (undoResult.changes === 1) {
    stmtInsertLog.run(cleanCode, 'UNDO', 'ADMIN', now);
    console.log(`[UNDO] Quản trị viên đã hoàn tác check-in vé: ${cleanCode}`);
    return res.json({ status: 'OK', message: `Đã hoàn tác vé ${cleanCode} thành công` });
  } else {
    return res.status(400).json({ status: 'ERROR', message: 'Vé chưa check-in hoặc không tìm thấy' });
  }
});

// 9. API Xuất dữ liệu vé (CSV hoặc JSON)
app.get('/api/export', (req, res) => {
  const pin = req.headers['x-admin-pin'] || req.query.pin;
  if (!pin || String(pin) !== String(ADMIN_PIN)) {
    return res.status(403).json({ error: 'Mã PIN quản trị không chính xác' });
  }

  const format = (req.query.format || 'json').toLowerCase();
  try {
    const { jsonString, csvString } = exportData(db);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="tickets_export.csv"');
      return res.send(csvString);
    } else {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="tickets_export.json"');
      return res.send(jsonString);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. API Tải file Database SQLite backup
app.get('/api/backup/download', (req, res) => {
  const pin = req.headers['x-admin-pin'] || req.query.pin;
  if (!pin || String(pin) !== String(ADMIN_PIN)) {
    return res.status(403).json({ error: 'Mã PIN quản trị không chính xác' });
  }

  const tempBackupFile = path.join(BACKUP_DIR, `manual_download_${Date.now()}.db`);
  db.backup(tempBackupFile)
    .then(() => {
      res.download(tempBackupFile, 'tickets.db', (err) => {
        try { fs.unlinkSync(tempBackupFile); } catch (e) {}
      });
    })
    .catch((err) => {
      res.status(500).json({ error: err.message });
    });
});

// 11. API Xem danh sách vé cho Admin có phân trang / lọc
app.get('/api/admin/tickets', (req, res) => {
  const pin = req.headers['x-admin-pin'] || req.query.pin;
  if (!pin || String(pin) !== String(ADMIN_PIN)) {
    return res.status(403).json({ error: 'Mã PIN quản trị không chính xác' });
  }

  const filter = req.query.filter || 'all'; // all, checked, unchecked, invalid
  const search = (req.query.search || '').trim();
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
  const offset = parseInt(req.query.offset || '0', 10);

  let whereClauses = [];
  let params = [];

  if (filter === 'checked') {
    whereClauses.push('checked_in = 1');
  } else if (filter === 'unchecked') {
    whereClauses.push("checked_in = 0 AND status = 'VALID'");
  } else if (filter === 'invalid') {
    whereClauses.push("status != 'VALID'");
  }

  if (search) {
    whereClauses.push('(code LIKE ? OR name LIKE ? OR phone LIKE ? OR order_id LIKE ?)');
    const p = `%${search}%`;
    params.push(p, p, p, p);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const countSql = `SELECT COUNT(*) AS total FROM tickets ${whereSql}`;
  const total = db.prepare(countSql).get(...params).total;

  const dataSql = `
    SELECT code, name, phone, email, order_id, label, type, status, checked_in, checked_at, gate, issued_at, note
    FROM tickets
    ${whereSql}
    ORDER BY checked_at DESC, order_id ASC, code ASC
    LIMIT ? OFFSET ?
  `;
  const items = db.prepare(dataSql).all(...params, limit, offset);

  res.json({ total, limit, offset, items });
});

// 12. API Lấy thông tin mạng LAN & Mã QR truy cập
app.get('/api/system-info', async (req, res) => {
  const primaryIp = getPrimaryIp();
  const allIps = getLanIps();
  const portPart = PORT === 443 ? '' : `:${PORT}`;
  const primaryUrl = `https://${primaryIp}${portPart}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(primaryUrl, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M'
    });

    res.json({
      primaryIp,
      primaryUrl,
      port: PORT,
      allIps,
      hostname: os.hostname(),
      qrDataUrl
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 13. Trang QR to toàn màn hình để nhân viên quét trực tiếp
app.get('/qr', async (req, res) => {
  const primaryIp = getPrimaryIp();
  const portPart = PORT === 443 ? '' : `:${PORT}`;
  const primaryUrl = `https://${primaryIp}${portPart}`;
  const adminUrl = `https://${primaryIp}${portPart}/admin.html`;

  try {
    const qrDataUrl = await QRCode.toDataURL(primaryUrl, {
      width: 380,
      margin: 2,
      errorCorrectionLevel: 'M'
    });

    res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mã QR Soát Vé - Hùng Vương Concert</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      text-align: center;
    }
    .card {
      background: #1e293b;
      padding: 32px 24px;
      border-radius: 20px;
      border: 1px solid #334155;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
      max-width: 440px;
      width: 100%;
    }
    h1 {
      font-size: 20px;
      color: #38bdf8;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    p.sub {
      font-size: 14px;
      color: #94a3b8;
      margin-top: 0;
      margin-bottom: 20px;
    }
    .qr-box {
      background: #fff;
      padding: 16px;
      border-radius: 16px;
      display: inline-block;
      margin-bottom: 20px;
    }
    .qr-box img {
      width: 280px;
      height: 280px;
      display: block;
    }
    .url-badge {
      background: #0f172a;
      border: 1px solid #475569;
      color: #38bdf8;
      padding: 10px 16px;
      border-radius: 10px;
      font-family: monospace;
      font-size: 16px;
      font-weight: 700;
      word-break: break-all;
      margin-bottom: 16px;
    }
    .hint {
      font-size: 13px;
      color: #cbd5e1;
      line-height: 1.5;
    }
    .links {
      margin-top: 20px;
      display: flex;
      gap: 12px;
      justify-content: center;
    }
    .btn {
      color: #fff;
      background: #0284c7;
      text-decoration: none;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>HÙNG VƯƠNG CONCERT: GAME ON</h1>
    <p class="sub">Mở Camera điện thoại quét mã dưới đây để vào Soát Vé</p>
    <div class="qr-box">
      <img src="${qrDataUrl}" alt="QR Soat Ve">
    </div>
    <div class="url-badge">${primaryUrl}</div>
    <div class="hint">
      👉 Chỉ cần kết nối Wi-Fi sự kiện rồi quét mã QR ở trên.<br>
      Không cần gõ địa chỉ IP!
    </div>
    <div class="links">
      <a href="/" class="btn">Vào Cổng Soát Vé</a>
    </div>
  </div>
</body>
</html>`);
  } catch (err) {
    res.status(500).send("Lỗi tạo mã QR: " + err.message);
  }
});

// Tự động Backup SQLite mỗi 5 phút (giữ tối đa 20 bản gần nhất)
function performAutoBackup() {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  const dateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const backupFileName = `tickets_backup_${dateStr}.db`;
  const backupFilePath = path.join(BACKUP_DIR, backupFileName);

  db.backup(backupFilePath)
    .then(() => {
      console.log(`[BACKUP] Tự động sao lưu thành công: ${backupFileName}`);

      // Dọn dẹp giữ tối đa 20 file mới nhất
      const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('tickets_backup_') && f.endsWith('.db'))
        .map(f => ({
          name: f,
          path: path.join(BACKUP_DIR, f),
          time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      if (files.length > 20) {
        const toDelete = files.slice(20);
        for (const file of toDelete) {
          try {
            fs.unlinkSync(file.path);
            console.log(`[BACKUP CLEAN] Đã xóa bản sao lưu cũ: ${file.name}`);
          } catch (e) {}
        }
      }
    })
    .catch((err) => {
      console.error(`[BACKUP ERROR] Lỗi tự động sao lưu:`, err.message);
    });
}

async function startServer() {
  const primaryIp = getPrimaryIp();
  const allIps = getLanIps();

  // Đảm bảo chứng chỉ SSL tương thích với IP LAN hiện tại
  ensureSslCert(primaryIp, allIps);

  // Chạy backup định kỳ mỗi 5 phút
  const BACKUP_INTERVAL_MS = 5 * 60 * 1000;
  const backupTimer = setInterval(performAutoBackup, BACKUP_INTERVAL_MS);
  if (backupTimer.unref) backupTimer.unref();

  // Khởi chạy HTTPS Server (bắt buộc cho Camera)
  let sslOptions = {};
  try {
    sslOptions = {
      key: fs.readFileSync(KEY_PATH),
      cert: fs.readFileSync(CERT_PATH)
    };
  } catch (err) {
    console.error(`[!] LỖI SSL CERT: Không đọc được cert.pem hoặc key.pem trong /certs/`);
    console.error(`Vui lòng kiểm tra chứng chỉ SSL.`);
    process.exit(1);
  }

  const httpsServer = https.createServer(sslOptions, app);

  httpsServer.listen(PORT, '0.0.0.0', async () => {
    const portPart = PORT === 443 ? '' : `:${PORT}`;
    const primaryUrl = `https://${primaryIp}${portPart}`;
    const qrPageUrl = `https://${primaryIp}${portPart}/qr`;

    console.log(`\n=====================================================================`);
    console.log(`🎉 HÙNG VƯƠNG CONCERT: GAME ON - CỔNG SOÁT VÉ LAN ĐÃ SẴN SÀNG!`);
    console.log(`=====================================================================`);
    console.log(`[📶 MẠNG LAN TỰ ĐỘNG - KHÔNG CẦN INTERNET, KHÔNG CẦN CÀI IP TĨNH]`);
    console.log(`[*] IP Máy chủ phát hiện được: ${primaryIp}`);
    console.log(`[*] Link Cổng Soát Vé:         ${primaryUrl}`);
    console.log(`---------------------------------------------------------------------`);
    console.log(`📱 MÃ QR DÀNH CHO ĐIỆN THOẠI NHÂN VIÊN (BẬT CAMERA QUÉT ĐỂ VÀO NGAY):`);

    try {
      const qrAscii = await QRCode.toString(primaryUrl, { type: 'terminal', small: true });
      console.log(qrAscii);
    } catch (e) {
      console.log(`[QR Error]: Không render được QR terminal.`);
    }

    console.log(`👉 Nhân viên chỉ cần mở Camera điện thoại quét mã QR ở trên để vào!`);
    console.log(`👉 Hoặc mở màn hình chia sẻ QR to: ${qrPageUrl}`);
    if (allIps.length > 1) {
      console.log(`[*] Các IP phụ khác trên máy: ${allIps.join(', ')}`);
    }
    console.log(`=====================================================================\n`);
  });

  // Chuyển hướng HTTP sang HTTPS (nếu cổng 80 không bị chiếm)
  if (PORT === 443) {
    const httpApp = express();
    httpApp.use((req, res) => {
      const host = req.headers.host ? req.headers.host.split(':')[0] : primaryIp;
      res.redirect(301, `https://${host}${req.url}`);
    });
    const httpServer = http.createServer(httpApp);
    httpServer.on('error', (e) => {
      console.log(`[NOTE] Cổng HTTP 80 không khả dụng (${e.message}), truy cập trực tiếp bằng https://`);
    });
    httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
      console.log(`[+] HTTP Port 80 đang tự động chuyển hướng sang HTTPS.`);
    });
  }

  return { httpsServer };
}

if (require.main === module) {
  startServer();
}

// Xử lý dừng máy chủ an toàn
process.on('SIGINT', () => {
  console.log('\n[!] Đang đóng kết nối cơ sở dữ liệu...');
  db.close();
  console.log('[+] Đã đóng SQLite an toàn. Tạm biệt!');
  process.exit(0);
});

module.exports = { app, db, handleCheckin, startServer };
