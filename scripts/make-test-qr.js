/**
 * make-test-qr.js - Tạo mã QR thử nghiệm để in ra giấy hoặc mở trên màn hình test camera
 * Sự kiện: Hùng Vương Concert: GAME ON
 */

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const ROOT_DIR = fs.existsSync(path.join(__dirname, 'server.js')) ? __dirname : path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
// Mặc định dùng dữ liệu giả lập của bộ test; có thể truyền file khác: node scripts/make-test-qr.js <file.json>
const TICKETS_FILE = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT_DIR, 'tests', 'fixtures', 'tickets.json');
const QR_OUT_DIR = path.join(DATA_DIR, 'test_qrs');
const HTML_OUT_FILE = path.join(DATA_DIR, 'test-qr-print.html');
const PUBLIC_HTML_OUT = path.join(ROOT_DIR, 'public', 'test-qr.html');

if (!fs.existsSync(QR_OUT_DIR)) {
  fs.mkdirSync(QR_OUT_DIR, { recursive: true });
}

async function generateTestQrs() {
  console.log(`\n========================================`);
  console.log(`[*] Đang tạo mã QR kiểm thử...`);

  let tickets = {};
  const targetJsonPath = TICKETS_FILE;

  if (fs.existsSync(targetJsonPath)) {
    console.log(`[*] Đọc vé mẫu từ: ${targetJsonPath}`);
    const raw = JSON.parse(fs.readFileSync(targetJsonPath, 'utf8'));
    tickets = raw.tickets || raw;
  }

  // Danh sách các vé kiểm thử mẫu
  const testList = Object.entries(tickets).map(([code, item]) => {
    const note = item.note || item.notes || item.ghiChu || '';
    let exp = 'OK (Hợp lệ, cho vào)';
    if (item.checkedIn) {
      exp = 'DUPLICATE (Vé đã check-in sẵn)';
    } else if (item.status !== 'VALID') {
      exp = 'NOT_VALID_STATUS (Vé bị hủy)';
    } else if (note) {
      exp = `OK (Hợp lệ + Ghi chú: ${note})`;
    }
    return {
      code: item.ticketCode || code,
      name: item.customerName || 'Khách Hàng',
      label: item.ticketLabel || 'Vé 1/1',
      type: item.ticketTypeName || 'Vé thường',
      orderId: item.orderId || 'ORD-000',
      note: note,
      expected: exp
    };
  });

  // Thêm 1 vé giả lập không có trong DB
  testList.push({
    code: 'HVC-FAKE-INVALID',
    name: 'Khách Không Có Vé',
    label: 'Vé Lạ',
    type: 'Vé Giả Mạo',
    orderId: 'ORD-FAKE',
    note: '',
    expected: 'INVALID (Mã không tồn tại)'
  });

  const cardsHtml = [];

  for (const t of testList) {
    // 1. Tạo file PNG
    const pngPath = path.join(QR_OUT_DIR, `${t.code}.png`);
    await QRCode.toFile(pngPath, t.code, {
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M'
    });

    // 2. Tạo Data URL để nhúng thẳng vào file HTML
    const dataUrl = await QRCode.toDataURL(t.code, {
      width: 260,
      margin: 2,
      errorCorrectionLevel: 'M'
    });

    let badgeColor = '#059669';
    if (t.expected.startsWith('DUPLICATE')) badgeColor = '#d97706';
    if (t.expected.startsWith('NOT_VALID') || t.expected.startsWith('INVALID')) badgeColor = '#dc2626';

    cardsHtml.push(`
      <div class="qr-card">
        <div class="qr-img-box">
          <img src="${dataUrl}" alt="QR ${t.code}">
        </div>
        <div class="qr-code-text">${t.code}</div>
        <div class="qr-info">
          <strong>${t.name}</strong> • ${t.label}<br>
          <span style="font-size:12px; color:#785A5E;">${t.type} (${t.orderId})</span>
          ${t.note ? `<div style="margin-top:6px; font-weight:bold; color:#9E1C2A; background:#F9DFE2; border:1px solid #E5B4BA; padding:4px 8px; border-radius:6px; font-size:12px;">🎁 Ghi chú: ${t.note}</div>` : ''}
        </div>
        <div class="qr-expected" style="background:${badgeColor}; color:#fff;">
          Dự kiến: ${t.expected}
        </div>
      </div>
    `);
    console.log(`  [+] Đã tạo QR: ${t.code} -> ${pngPath}`);
  }

  // Tạo file HTML tổng hợp sẵn sàng in A4
  const htmlContent = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mã QR Soát Vé - Hùng Vương Concert: GAME ON</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      background: #FCF1F2;
      color: #2D1618;
      min-height: 100vh;
    }
    header {
      background: #AF1C2B;
      color: #FFFFFF;
      padding: 16px 32px;
      margin-bottom: 24px;
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
    .brand { position: relative; z-index: 1; text-align: center; }
    .brand-sub { font-size: 11px; font-weight: 600; letter-spacing: 1.4px; color: rgba(255,255,255,0.92); text-transform: uppercase; }
    h1 {
      font-size: 24px;
      font-weight: 900;
      letter-spacing: 0.8px;
      margin: 2px 0 4px;
      color: #FFFFFF;
    }
    p.subtitle {
      text-align: center;
      color: rgba(255, 255, 255, 0.9);
      font-size: 13px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 20px;
      max-width: 1080px;
      margin: 0 auto;
      padding: 0 20px 40px;
    }
    .qr-card {
      background: #FFFFFF;
      border: 1px solid #E2C4C7;
      border-radius: 14px;
      padding: 18px;
      text-align: center;
      box-shadow: 0 4px 12px rgba(175, 28, 43, 0.06);
      page-break-inside: avoid;
    }
    .qr-img-box img {
      width: 220px;
      height: 220px;
    }
    .qr-code-text {
      font-family: monospace;
      font-size: 16px;
      font-weight: bold;
      color: #AF1C2B;
      margin: 8px 0 4px 0;
    }
    .qr-info {
      font-size: 13px;
      margin-bottom: 12px;
      color: #2D1618;
    }
    .qr-expected {
      padding: 7px 10px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: bold;
    }
    @media print {
      body { background: #fff; }
      header { background: #AF1C2B !important; -webkit-print-color-adjust: exact; }
      .grid { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="brand-sub">HÙNG VƯƠNG CONCERT</div>
      <h1>GAME ON • MÃ QR KIỂM THỬ</h1>
      <p class="subtitle">Bảng Mã QR Kiểm Thử Hệ Thống Soát Vé Offline LAN</p>
    </div>
  </header>
  <div class="grid">
    ${cardsHtml.join('')}
  </div>
</body>
</html>`;

  fs.writeFileSync(HTML_OUT_FILE, htmlContent, 'utf8');
  fs.writeFileSync(PUBLIC_HTML_OUT, htmlContent, 'utf8');
  console.log(`----------------------------------------`);
  console.log(`[+] Đã tạo file HTML in ấn: ${HTML_OUT_FILE}`);
  console.log(`[+] Đã tạo file xem trên web: ${PUBLIC_HTML_OUT}`);
  console.log(`[*] Mở file này trên trình duyệt để in hoặc quét trực tiếp từ màn hình.`);
  console.log(`========================================\n`);
}

if (require.main === module) {
  generateTestQrs();
}

module.exports = { generateTestQrs };
