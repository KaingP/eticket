/**
 * make-test-qr.js - Tạo mã QR thử nghiệm để in ra giấy hoặc mở trên màn hình test camera
 * Sự kiện: Hùng Vương Concert: GAME ON
 */

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const DATA_DIR = path.join(__dirname, 'data');
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');
const QR_OUT_DIR = path.join(DATA_DIR, 'test_qrs');
const HTML_OUT_FILE = path.join(DATA_DIR, 'test-qr-print.html');

if (!fs.existsSync(QR_OUT_DIR)) {
  fs.mkdirSync(QR_OUT_DIR, { recursive: true });
}

async function generateTestQrs() {
  console.log(`\n========================================`);
  console.log(`[*] Đang tạo mã QR kiểm thử...`);

  let tickets = {};
  const samplePath = path.join(__dirname, 'tickets_sample.json');
  const targetJsonPath = fs.existsSync(samplePath) ? samplePath : TICKETS_FILE;

  if (fs.existsSync(targetJsonPath)) {
    console.log(`[*] Đọc vé mẫu từ: ${targetJsonPath}`);
    const raw = JSON.parse(fs.readFileSync(targetJsonPath, 'utf8'));
    tickets = raw.tickets || raw;
  }

  // Danh sách các vé kiểm thử mẫu
  const testList = Object.entries(tickets).map(([code, item]) => ({
    code: item.ticketCode || code,
    name: item.customerName || 'Khách Hàng',
    label: item.ticketLabel || 'Vé 1/1',
    type: item.ticketTypeName || 'Vé thường',
    orderId: item.orderId || 'ORD-000',
    expected: item.checkedIn
      ? 'DUPLICATE (Vé đã check-in sẵn)'
      : item.status !== 'VALID'
      ? 'NOT_VALID_STATUS (Vé bị hủy)'
      : 'OK (Hợp lệ, cho vào)'
  }));

  // Thêm 1 vé giả lập không có trong DB
  testList.push({
    code: 'HVC-FAKE-INVALID',
    name: 'Khách Không Có Vé',
    label: 'Vé Lạ',
    type: 'Vé Giả Mạo',
    orderId: 'ORD-FAKE',
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
          <span style="font-size:12px; color:#555;">${t.type} (${t.orderId})</span>
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
  <title>Mã QR Soát Vé - Hùng Vương Concert: GAME ON</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #f1f5f9;
      margin: 0;
      padding: 20px;
    }
    h1 {
      text-align: center;
      margin-bottom: 6px;
      color: #0f172a;
    }
    p.subtitle {
      text-align: center;
      color: #64748b;
      margin-top: 0;
      margin-bottom: 24px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 20px;
      max-width: 1000px;
      margin: 0 auto;
    }
    .qr-card {
      background: #fff;
      border: 2px solid #cbd5e1;
      border-radius: 12px;
      padding: 16px;
      text-align: center;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
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
      color: #0284c7;
      margin: 8px 0 4px 0;
    }
    .qr-info {
      font-size: 13px;
      margin-bottom: 10px;
      color: #1e293b;
    }
    .qr-expected {
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: bold;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .grid { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
  <h1>HÙNG VƯƠNG CONCERT: GAME ON</h1>
  <p class="subtitle">Bảng Mã QR Kiểm Thử Hệ Thống Soát Vé Offline</p>
  <div class="grid">
    ${cardsHtml.join('')}
  </div>
</body>
</html>`;

  fs.writeFileSync(HTML_OUT_FILE, htmlContent, 'utf8');
  console.log(`----------------------------------------`);
  console.log(`[+] Đã tạo file HTML in ấn: ${HTML_OUT_FILE}`);
  console.log(`[*] Mở file này trên trình duyệt để in hoặc quét trực tiếp từ màn hình.`);
  console.log(`========================================\n`);
}

if (require.main === module) {
  generateTestQrs();
}

module.exports = { generateTestQrs };
