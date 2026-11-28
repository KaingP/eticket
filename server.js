/**
 * server.js - Server soát vé offline (HTTPS + SQLite WAL + Express)
 * Sự kiện: Hùng Vương Concert: GAME ON
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const https = require('https');
const http = require('http');
const express = require('express');
const QRCode = require('qrcode');
const { getDb, closeDb, DATA_DIR } = require('./db');
const { exportData } = require('./export');
const { importTicketsData } = require('./import');

// Biến môi trường
const PORT = parseInt(process.env.PORT || '443', 10);
const EXPLICIT_PORT = Boolean(process.env.PORT);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '80', 10);
const ADMIN_PIN = process.env.ADMIN_PIN || '123456';
let activePort = PORT;

const BACKUP_DIR = path.join(DATA_DIR, 'backup');
const CERTS_DIR = path.join(__dirname, 'certs');
const CERT_PATH = path.join(CERTS_DIR, 'cert.pem');
const KEY_PATH = path.join(CERTS_DIR, 'key.pem');

// Đảm bảo thư mục tồn tại
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// Kết nối SQLite (WAL mode) - schema khởi tạo trong db.js
const db = getDb();

// Chuẩn hóa giá trị từ request về chuỗi (tránh crash khi client gửi số/mảng/object)
function toStr(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return '';
}

// Prepared Statements tối ưu tốc độ
const stmtUpdateCheckin = db.prepare(`
  UPDATE tickets
  SET checked_in = 1, checked_at = ?, gate = ?
  WHERE code = ? AND checked_in = 0 AND status = 'VALID'
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
  const preferred192 = ips.find(ip => ip.startsWith('192.168.') && !ip.startsWith('192.168.56.'));
  if (preferred192) return preferred192;
  const anyLan = ips.find(ip => ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.'));
  return anyLan || ips[0] || '127.0.0.1';
}

function generateSelfSignedCertNode(primaryIp, ipList, dnsList) {
  const derLen = (len) => {
    if (len < 128) return Buffer.from([len]);
    const bytes = [];
    let n = len;
    while (n > 0) { bytes.unshift(n & 0xff); n >>>= 8; }
    return Buffer.from([0x80 | bytes.length, ...bytes]);
  };
  const derTlv = (tag, content) => {
    const buf = Buffer.isBuffer(content) ? content : Buffer.concat(content);
    return Buffer.concat([Buffer.from([tag]), derLen(buf.length), buf]);
  };
  const derInt = (buf) => {
    let b = Buffer.isBuffer(buf) ? buf : Buffer.from([buf]);
    while (b.length > 1 && b[0] === 0 && !(b[1] & 0x80)) b = b.slice(1);
    if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0x00]), b]);
    return derTlv(0x02, b);
  };
  const derBitString = (buf) => derTlv(0x03, Buffer.concat([Buffer.from([0x00]), buf]));
  const derOid = (bytes) => derTlv(0x06, Buffer.from(bytes));
  const derSeq = (items) => derTlv(0x30, items);
  const derSet = (items) => derTlv(0x31, items);
  const derUtf8 = (str) => derTlv(0x0C, Buffer.from(str, 'utf8'));
  const derUtcTime = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    const yy = String(d.getUTCFullYear()).slice(-2);
    const s = yy + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
    return derTlv(0x17, Buffer.from(s, 'ascii'));
  };

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

  const sigAlg = derSeq([derOid([0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x01, 0x0B]), derTlv(0x05, Buffer.alloc(0))]);
  const rdn = (oid, val) => derSet([derSeq([derOid(oid), derUtf8(val)])]);
  const name = derSeq([rdn([0x55, 0x04, 0x06], 'VN'), rdn([0x55, 0x04, 0x0A], 'Hung Vuong Concert'), rdn([0x55, 0x04, 0x03], primaryIp)]);

  const now = new Date();
  const later = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const validity = derSeq([derUtcTime(now), derUtcTime(later)]);

  const sanEntries = [];
  for (const ip of ipList) {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
      sanEntries.push(derTlv(0x87, Buffer.from(ip.split('.').map(Number))));
    }
  }
  for (const dns of dnsList) {
    if (dns) sanEntries.push(derTlv(0x82, Buffer.from(dns, 'ascii')));
  }

  const extKeyUsageVal = derSeq([derOid([0x2B, 0x06, 0x01, 0x05, 0x05, 0x07, 0x03, 0x01])]);
  const keyUsageBitStr = derTlv(0x03, Buffer.from([0x05, 0xA0]));
  const exts = derSeq([
    derSeq([derOid([0x55, 0x1D, 0x0F]), Buffer.from([0x01, 0x01, 0xFF]), derTlv(0x04, keyUsageBitStr)]),
    derSeq([derOid([0x55, 0x1D, 0x25]), derTlv(0x04, extKeyUsageVal)]),
    derSeq([derOid([0x55, 0x1D, 0x11]), derTlv(0x04, derSeq(sanEntries))])
  ]);

  const serial = crypto.randomBytes(16);
  serial[0] &= 0x7F;
  if (serial[0] === 0) serial[0] = 0x01;

  const tbs = derSeq([
    derTlv(0xA0, derInt(Buffer.from([0x02]))),
    derInt(serial),
    sigAlg,
    name,
    validity,
    name,
    spkiDer,
    derTlv(0xA3, exts)
  ]);

  const signer = crypto.createSign('SHA256');
  signer.update(tbs);
  const sig = signer.sign(privateKey);

  const certDer = derSeq([tbs, sigAlg, derBitString(sig)]);
  const b64 = certDer.toString('base64').match(/.{1,64}/g).join('\n');
  const certPem = `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`;
  return { certPem, keyPem };
}

// Tự động kiểm tra và sinh chứng chỉ SSL phù hợp với IP hiện tại
function ensureSslCert(primaryIp, allIps) {
  let needsGen = false;
  let reason = 'chưa có chứng chỉ';

  if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
    needsGen = true;
  } else {
    try {
      const certContent = fs.readFileSync(CERT_PATH, 'utf8');
      if (typeof crypto.X509Certificate === 'function') {
        const certObj = new crypto.X509Certificate(certContent);
        const sanList = (certObj.subjectAltName || '').split(',').map(s => s.trim());
        const isExpired = Date.parse(certObj.validTo) <= Date.now();
        const hasIp = primaryIp === '127.0.0.1' || sanList.includes(`IP Address:${primaryIp}`);
        if (isExpired || !hasIp) {
          needsGen = true;
          reason = isExpired ? 'chứng chỉ cũ đã hết hạn' : `IP máy chủ đã đổi (chứng chỉ cũ cấp cho: ${certObj.subjectAltName || 'không rõ'})`;
        }
      } else if (!certContent.includes(primaryIp) && primaryIp !== '127.0.0.1') {
        needsGen = true;
        reason = 'IP máy chủ đã đổi';
      }
    } catch (e) {
      needsGen = true;
      reason = `không đọc được chứng chỉ cũ (${e.message})`;
    }
  }

  if (needsGen) {
    let opensslCmd = 'openssl';
    // Kiểm tra openssl trong PATH hoặc các đường dẫn phổ biến trên Windows
    const commonOpensslPaths = [
      'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe',
      'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
      'C:\\OpenSSL-Win64\\bin\\openssl.exe'
    ];
    for (const p of commonOpensslPaths) {
      if (fs.existsSync(p)) {
        opensslCmd = `"${p}"`;
        break;
      }
    }

    try {
      const tempCnf = path.join(CERTS_DIR, 'temp_openssl.cnf');
      if (!fs.existsSync(CERTS_DIR)) {
        fs.mkdirSync(CERTS_DIR, { recursive: true });
      }
      const altNames = [
        `IP.1 = ${primaryIp}`,
        `IP.2 = 192.168.1.10`,
        `IP.3 = 192.168.137.1`,
        `IP.4 = 127.0.0.1`
      ];
      let ipIdx = 5;
      for (const ip of allIps) {
        if (!altNames.some(a => a.endsWith(` = ${ip}`))) {
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
      fs.writeFileSync(tempCnf, cnfContent, 'utf8');
      execSync(`${opensslCmd} req -x509 -nodes -days 365 -newkey rsa:2048 -keyout "${KEY_PATH}" -out "${CERT_PATH}" -config "${tempCnf}"`, { stdio: 'pipe' });
      try { fs.unlinkSync(tempCnf); } catch (e) { /* file tạm, không quan trọng */ }
      console.log(`\n[!] ĐÃ TẠO CHỨNG CHỈ SSL MỚI cho IP ${primaryIp} - Lý do: ${reason}`);
      console.log(`[!] Điện thoại nhân viên đã kết nối trước đó cần QUÉT LẠI mã QR bên dưới`);
      console.log(`    và chấp nhận cảnh báo chứng chỉ một lần nữa.\n`);
    } catch (err) {
      try {
        const tempCnf = path.join(CERTS_DIR, 'temp_openssl.cnf');
        if (fs.existsSync(tempCnf)) fs.unlinkSync(tempCnf);
      } catch (e) {}
      // Máy tính mới không cài sẵn OpenSSL -> tự sinh bằng Node.js crypto thuần (không cần phụ thuộc ngoài)
      try {
        const uniqueIps = Array.from(new Set([primaryIp, '192.168.1.10', '192.168.137.1', '127.0.0.1', ...allIps]));
        const hostLower = os.hostname().toLowerCase();
        const uniqueDns = Array.from(new Set(['localhost', 'soatve.local', `${hostLower}.local`, hostLower]));
        const { certPem, keyPem } = generateSelfSignedCertNode(primaryIp, uniqueIps, uniqueDns);
        fs.writeFileSync(KEY_PATH, keyPem, 'utf8');
        fs.writeFileSync(CERT_PATH, certPem, 'utf8');
        console.log(`\n[!] ĐÃ TẠO CHỨNG CHỈ SSL MỚI (Node.js) cho IP ${primaryIp} - Lý do: ${reason}`);
        console.log(`[!] Điện thoại nhân viên cần QUÉT LẠI mã QR và chấp nhận cảnh báo chứng chỉ 1 lần.\n`);
      } catch (nodeErr) {
        const detail = (err.stderr && err.stderr.toString().trim()) || err.message;
        console.error(`[!] KHÔNG TẠO ĐƯỢC CHỨNG CHỈ SSL (${reason}): ${detail} / ${nodeErr.message}`);
      }
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

const checkinTx = db.transaction((now, gate, code) => {
  const result = stmtUpdateCheckin.run(now, gate, code);
  if (result.changes === 1) stmtInsertLog.run(code, 'OK', gate, now);
  return result;
});

const undoTx = db.transaction((code, gate, now) => {
  const result = stmtUndoCheckin.run(code);
  if (result.changes === 1) stmtInsertLog.run(code, 'UNDO', gate, now);
  return result;
});

// Logic xử lý check-in chung cho quét QR và nhập tay
function handleCheckin(rawCode, rawGate) {
  const code = toStr(rawCode).toUpperCase();
  const gate = toStr(rawGate) || 'Cổng chính';
  const now = getVietnamISOString();

  if (!code) {
    return {
      httpStatus: 400,
      body: { status: 'INVALID', valid: false, message: 'Mã vé không được để trống' }
    };
  }

  // ATOMIC UPDATE: Chỉ 1 request duy nhất thắng nếu gửi đồng thời.
  // Cập nhật vé + ghi log trong cùng 1 transaction để không lệch nhau khi mất điện.
  const updateResult = checkinTx(now, gate, code);

  if (updateResult.changes === 1) {
    // Check-in thành công
    const ticket = stmtGetTicket.get(code);
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
  const { code, gate } = req.body || {};
  const result = handleCheckin(code, gate);
  res.status(result.httpStatus).json(result.body);
});

// 2. API Check-in thủ công (Diagram 0: Thay đổi trạng thái thủ công từ "Chưa soát" -> "Đã soát")
app.post('/api/manual-checkin', (req, res) => {
  const { code, gate, toggle } = req.body || {};
  const cleanCode = toStr(code).toUpperCase();
  if (!cleanCode) {
    return res.status(400).json({ status: 'INVALID', message: 'Mã vé không được để trống' });
  }

  const ticket = stmtGetTicket.get(cleanCode);
  if (!ticket) {
    return res.status(404).json({ status: 'INVALID', message: 'Mã vé không tồn tại trong hệ thống' });
  }

  const now = getVietnamISOString();
  const gateName = toStr(gate) || 'Thủ công';

  if (ticket.checked_in === 1 && toggle) {
    // Hoàn tác về Chưa soát
    const undoResult = undoTx(cleanCode, gateName, now);
    if (undoResult.changes !== 1) {
      return res.status(409).json({ status: 'ERROR', message: 'Vé đã được hoàn tác ở thiết bị khác' });
    }
    console.log(`[MANUAL UNDO] Mã: ${cleanCode} -> Chưa soát`);
    return res.json({ status: 'OK', checked_in: 0, checked_at: null, message: 'Đã hoàn tác trạng thái Chưa soát' });
  }

  // Đánh dấu Đã soát: dùng CHUNG quy tắc với quét QR
  // (chặn vé CANCELLED, báo DUPLICATE kèm giờ/cổng đã soát, không ghi đè lượt soát cũ)
  const result = handleCheckin(cleanCode, gateName);
  if (result.body.status === 'OK') {
    console.log(`[MANUAL CHECKIN] Mã: ${cleanCode} -> Đã soát`);
    return res.json({ ...result.body, checked_in: 1, checked_at: result.body.at, message: 'Đã chuyển sang Đã soát' });
  }
  return res.status(409).json(result.body);
});

// 3. API Thống kê Dashboard (Diagram 2 & 3: Tất cả, Đã soát, Chưa soát + Refresh)
app.get('/api/stats', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_all,
        SUM(CASE WHEN checked_in = 1 THEN 1 ELSE 0 END) AS checked,
        SUM(CASE WHEN status != 'VALID' AND checked_in = 0 THEN 1 ELSE 0 END) AS cancelled,
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
      // "Chưa soát" = vé VALID chưa vào (không tính vé đã hủy/hoàn tiền)
      unchecked: stats.remaining || 0,
      cancelled: stats.cancelled || 0,
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
    const status = toStr(req.query.status) || 'all'; // 'all', 'checked', 'unchecked'
    const search = toStr(req.query.search);
    const page = Math.max(1, parseInt(toStr(req.query.page), 10) || 1);
    const limit = Math.min(Math.max(1, parseInt(toStr(req.query.limit), 10) || 20), 100);
    const offset = (page - 1) * limit;

    let whereClauses = [];
    let params = [];

    if (status === 'checked') {
      whereClauses.push('checked_in = 1');
    } else if (status === 'unchecked') {
      whereClauses.push("checked_in = 0 AND status = 'VALID'");
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
      ORDER BY checked_at DESC, order_id ASC, code ASC
      LIMIT ? OFFSET ?
    `;
    const rows = db.prepare(dataSql).all(...params, limit, offset);

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
  const code = toStr(req.params.code).toUpperCase();
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
  } catch (e) {
    console.warn(`[TICKET DETAIL] raw_json của vé ${code} bị lỗi: ${e.message}`);
  }

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
  const code = toStr(req.params.code).toUpperCase();
  const body = req.body || {};
  const note = toStr(body.note);
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
    const { filename, content } = req.body || {};
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ success: false, message: 'File lỗi: Dữ liệu rỗng' });
    }
    const result = importTicketsData(content, toStr(filename));
    res.json(result);
  } catch (err) {
    console.error('[IMPORT ERROR]', err.message);
    res.status(400).json({ success: false, message: 'File lỗi: ' + err.message });
  }
});

// 7. API Tìm kiếm tra tay
app.get('/api/search', (req, res) => {
  const q = toStr(req.query.q);
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
  const { code, pin } = req.body || {};
  if (!pin || String(pin) !== String(ADMIN_PIN)) {
    return res.status(403).json({ status: 'FORBIDDEN', message: 'Mã PIN quản trị không chính xác' });
  }

  const cleanCode = toStr(code).toUpperCase();
  if (!cleanCode) {
    return res.status(400).json({ status: 'ERROR', message: 'Mã vé không hợp lệ' });
  }

  const now = getVietnamISOString();
  const undoResult = undoTx(cleanCode, 'ADMIN', now);

  if (undoResult.changes === 1) {
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

  const format = (toStr(req.query.format) || 'json').toLowerCase();
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
        if (err) console.error('[BACKUP DOWNLOAD] Lỗi gửi file:', err.message);
        try { fs.unlinkSync(tempBackupFile); } catch (e) {
          console.warn('[BACKUP DOWNLOAD] Không xóa được file tạm:', e.message);
        }
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

  const filter = toStr(req.query.filter) || 'all'; // all, checked, unchecked, invalid
  const search = toStr(req.query.search);
  const parsedLimit = parseInt(toStr(req.query.limit) || '100', 10);
  const parsedOffset = parseInt(toStr(req.query.offset) || '0', 10);
  const limit = Math.min(Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 100), 500);
  const offset = Math.max(0, Number.isFinite(parsedOffset) ? parsedOffset : 0);

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
  const portPart = activePort === 443 ? '' : `:${activePort}`;
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
      port: activePort,
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
  const portPart = activePort === 443 ? '' : `:${activePort}`;
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
  <title>Mã QR Soát Vé - Hùng Vương Concert: GAME ON</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #FCF1F2;
      color: #2D1618;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    header {
      background: #AF1C2B;
      color: #FFFFFF;
      padding: 16px 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: relative;
      overflow: hidden;
    }
    header::before, header::after {
      content: '';
      position: absolute;
      top: 0; bottom: 0; width: 110px;
      pointer-events: none;
      background-image:
        linear-gradient(45deg, rgba(120, 12, 24, 0.32) 25%, transparent 25%),
        linear-gradient(-45deg, rgba(120, 12, 24, 0.32) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, rgba(120, 12, 24, 0.32) 75%),
        linear-gradient(-45deg, transparent 75%, rgba(120, 12, 24, 0.32) 75%);
      background-size: 24px 24px;
      background-position: 0 0, 0 12px, 12px -12px, -12px 0;
    }
    header::before { left: 0; -webkit-mask-image: linear-gradient(to right, rgba(0,0,0,0.95), transparent); mask-image: linear-gradient(to right, rgba(0,0,0,0.95), transparent); }
    header::after { right: 0; -webkit-mask-image: linear-gradient(to left, rgba(0,0,0,0.95), transparent); mask-image: linear-gradient(to left, rgba(0,0,0,0.95), transparent); }
    .brand { position: relative; z-index: 1; }
    .brand-sub { font-size: 11px; font-weight: 600; letter-spacing: 1.4px; color: rgba(255,255,255,0.92); text-transform: uppercase; }
    .brand-main { font-size: 24px; font-weight: 900; letter-spacing: 1px; line-height: 1.1; }
    .main-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
    }
    .card {
      background: #FFFFFF;
      padding: 32px 24px;
      border-radius: 16px;
      border: 1px solid #E2C4C7;
      box-shadow: 0 8px 28px rgba(175, 28, 43, 0.08);
      max-width: 440px;
      width: 100%;
      text-align: center;
    }
    h1 {
      font-size: 20px;
      color: #AF1C2B;
      margin-bottom: 6px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    p.sub {
      font-size: 14px;
      color: #785A5E;
      margin-bottom: 20px;
    }
    .qr-box {
      background: #FCF5F6;
      padding: 16px;
      border-radius: 14px;
      border: 2px solid #F3D1D5;
      display: inline-block;
      margin-bottom: 20px;
    }
    .qr-box img {
      width: 260px;
      height: 260px;
      display: block;
    }
    .url-badge {
      background: #FCF1F2;
      border: 1px solid #E2C4C7;
      color: #AF1C2B;
      padding: 10px 16px;
      border-radius: 10px;
      font-family: monospace;
      font-size: 15px;
      font-weight: 700;
      word-break: break-all;
      margin-bottom: 16px;
    }
    .hint {
      font-size: 13px;
      color: #5A3A3E;
      line-height: 1.5;
    }
    .links {
      margin-top: 20px;
      display: flex;
      gap: 12px;
      justify-content: center;
    }
    .btn {
      color: #FFFFFF;
      background: #AF1C2B;
      text-decoration: none;
      padding: 10px 20px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
    }
    .btn:hover { background: #8F1421; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="brand-sub">HÙNG VƯƠNG CONCERT</div>
      <div class="brand-main">GAME ON</div>
    </div>
  </header>
  <div class="main-wrap">
    <div class="card">
      <h1>KẾT NỐI CỔNG SOÁT VÉ LAN</h1>
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
          } catch (e) {
            console.warn(`[BACKUP CLEAN] Không xóa được ${file.name}: ${e.message}`);
          }
        }
      }
    })
    .catch((err) => {
      console.error(`[BACKUP ERROR] Lỗi tự động sao lưu:`, err.message);
    });
}

let backupTimer = null;
const runningServers = [];

async function startServer() {
  const primaryIp = getPrimaryIp();
  const allIps = getLanIps();

  // Đảm bảo chứng chỉ SSL tương thích với IP LAN hiện tại
  ensureSslCert(primaryIp, allIps);

  // Chạy backup định kỳ mỗi 5 phút
  const BACKUP_INTERVAL_MS = 5 * 60 * 1000;
  backupTimer = setInterval(performAutoBackup, BACKUP_INTERVAL_MS);
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

  function bindHttpsWithFallback(candidates, idx = 0) {
    return new Promise((resolve, reject) => {
      if (idx >= candidates.length) {
        return reject(new Error('ALL_PORTS_FAILED'));
      }
      const tryPort = candidates[idx];
      const server = https.createServer(sslOptions, app);

      server.once('error', (err) => {
        if ((err.code === 'EADDRINUSE' || err.code === 'EACCES') && idx + 1 < candidates.length) {
          const nextLabel = candidates[idx + 1] === 0 ? 'ngẫu nhiên' : candidates[idx + 1];
          console.log(`[!] Cổng HTTPS ${tryPort} không khả dụng (${err.code}), tự động thử cổng ${nextLabel}...`);
          bindHttpsWithFallback(candidates, idx + 1).then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });

      server.listen(tryPort, '0.0.0.0', () => {
        resolve(server);
      });
    });
  }

  const candidatePorts = EXPLICIT_PORT ? [PORT] : [PORT, 8443, 9443, 3443, 0];
  let httpsServer;
  try {
    httpsServer = await bindHttpsWithFallback(candidatePorts);
  } catch (e) {
    console.error(`[!] KHÔNG MỞ ĐƯỢC CỔNG HTTPS ${PORT}: ${e.message}`);
    if (e.code === 'EADDRINUSE') console.error(`[!] Có thể server đang chạy ở cửa sổ khác. Hãy tắt cửa sổ đó rồi chạy lại.`);
    if (e.code === 'EACCES') console.error(`[!] Cần chạy với quyền Administrator/sudo để dùng cổng ${PORT}, hoặc đặt PORT=8443.`);
    return shutdown(1);
  }

  runningServers.push(httpsServer);
  httpsServer.on('error', (e) => {
    console.error(`[!] Lỗi HTTPS Server: ${e.message}`);
  });

  activePort = httpsServer.address().port;
  const portPart = activePort === 443 ? '' : `:${activePort}`;
  const primaryUrl = `https://${primaryIp}${portPart}`;
  const qrPageUrl = `https://${primaryIp}${portPart}/qr`;

  console.log(`\n=====================================================================`);
  console.log(`🎉 HÙNG VƯƠNG CONCERT: GAME ON - CỔNG SOÁT VÉ LAN ĐÃ SẴN SÀNG!`);
  console.log(`=====================================================================`);
  console.log(`[📶 MẠNG LAN TỰ ĐỘNG - KHÔNG CẦN INTERNET, KHÔNG CẦN CÀI IP TĨNH]`);
  if (activePort !== PORT) {
    console.log(`[⚡] Đã tự động chuyển sang cổng HTTPS dự phòng: ${activePort}`);
  }
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

  // Chuyển hướng HTTP sang HTTPS (nếu cổng 80 không bị chiếm)
  const httpApp = express();
  httpApp.use((req, res) => {
    const host = req.headers.host ? req.headers.host.split(':')[0] : primaryIp;
    res.redirect(301, `https://${host}${portPart}${req.url}`);
  });
  const httpServer = http.createServer(httpApp);
  runningServers.push(httpServer);
  httpServer.on('error', (e) => {
    console.log(`[NOTE] Cổng HTTP 80 không khả dụng (${e.message}), truy cập trực tiếp bằng ${primaryUrl}`);
  });
  httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`[+] HTTP Port ${HTTP_PORT} đang tự động chuyển hướng sang ${primaryUrl}`);
  });

  return { httpsServer };
}

if (require.main === module) {
  startServer();
}

// Xử lý dừng máy chủ an toàn (Ctrl+C, đóng cửa sổ, kill, tắt dịch vụ)
let shuttingDown = false;
function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[!] Đang dừng máy chủ và đóng kết nối cơ sở dữ liệu...');
  if (backupTimer) clearInterval(backupTimer);
  for (const srv of runningServers) {
    try { srv.close(); } catch (e) { /* server có thể chưa mở */ }
  }
  try {
    closeDb();
    console.log('[+] Đã đóng SQLite an toàn. Tạm biệt!');
  } catch (e) {
    console.error('[!] Lỗi khi đóng SQLite:', e.message);
  }
  process.exit(exitCode);
}

if (require.main === module) {
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  process.on('SIGHUP', () => shutdown(0)); // Đóng cửa sổ terminal / CMD
}

module.exports = { app, db, handleCheckin, startServer };
