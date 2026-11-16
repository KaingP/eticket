/**
 * make-staff-card.js - Tạo bảng hướng dẫn kết nối & soát vé sẵn sàng in A4 dán tại bàn soát vé
 * Sự kiện: Hùng Vương Concert: GAME ON
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');

const DATA_DIR = path.join(__dirname, 'data');
const OUT_FILE = path.join(DATA_DIR, 'huong-dan-nhan-vien.html');

function getPrimaryIp() {
  const interfaces = os.networkInterfaces();
  const validIps = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const ip = iface.address;
        if (!ip.startsWith('169.254.')) {
          if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
            validIps.unshift(ip);
          } else {
            validIps.push(ip);
          }
        }
      }
    }
  }
  return validIps.length > 0 ? validIps[0] : '192.168.1.10';
}

async function generateStaffCard() {
  const primaryIp = getPrimaryIp();
  const port = process.env.PORT || '443';
  const portPart = port === '443' ? '' : `:${port}`;
  const appUrl = `https://${primaryIp}${portPart}`;

  console.log(`\n========================================`);
  console.log(`[*] Đang tạo bảng hướng dẫn nhân viên...`);
  console.log(`[*] URL ứng dụng: ${appUrl}`);

  const qrDataUrl = await QRCode.toDataURL(appUrl, {
    width: 320,
    margin: 2,
    errorCorrectionLevel: 'H'
  });

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Bảng Hướng Dẫn Nhân Viên Soát Vé - GAME ON</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      margin: 0;
      padding: 24px;
      background: #f8fafc;
      color: #0f172a;
    }
    .sheet {
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
      border: 3px solid #0284c7;
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      border-bottom: 2px dashed #cbd5e1;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 26px;
      color: #0369a1;
      margin: 0 0 6px 0;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .subtitle {
      font-size: 16px;
      font-weight: 700;
      color: #475569;
      margin: 0;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      align-items: center;
    }
    .qr-side {
      text-align: center;
      background: #f0f9ff;
      border: 2px solid #bae6fd;
      border-radius: 12px;
      padding: 20px;
    }
    .qr-side img {
      width: 240px;
      height: 240px;
      display: block;
      margin: 0 auto 12px auto;
    }
    .url-text {
      font-family: monospace;
      font-size: 15px;
      font-weight: bold;
      color: #0284c7;
      background: #fff;
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid #7dd3fc;
    }
    .steps-side {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .step-card {
      background: #f8fafc;
      border-left: 5px solid #0284c7;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
    }
    .step-title {
      font-size: 15px;
      font-weight: bold;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .step-desc {
      font-size: 13px;
      color: #475569;
      line-height: 1.4;
    }
    .status-guide {
      margin-top: 24px;
      border-top: 2px dashed #cbd5e1;
      padding-top: 20px;
    }
    .status-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      text-align: center;
      margin-top: 12px;
    }
    .badge-card {
      padding: 12px 8px;
      border-radius: 8px;
      color: #fff;
      font-weight: bold;
      font-size: 13px;
    }
    .bg-green { background: #059669; }
    .bg-orange { background: #d97706; }
    .bg-red { background: #dc2626; }
    .badge-sub {
      font-size: 11px;
      font-weight: normal;
      margin-top: 4px;
      opacity: 0.95;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .sheet { box-shadow: none; border-width: 2px; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <h1>HÙNG VƯƠNG CONCERT: GAME ON</h1>
      <p class="subtitle">HƯỚNG DẪN KẾT NỐI & SOÁT VÉ DÀNH CHO NHÂN VIÊN</p>
    </div>

    <div class="grid">
      <div class="qr-side">
        <h3 style="margin-top:0; color:#0369a1;">QUÉT MÃ MỞ APP SOÁT VÉ</h3>
        <img src="${qrDataUrl}" alt="QR Soat Ve">
        <div class="url-text">${appUrl}</div>
        <p style="font-size:12px; color:#64748b; margin-top:8px; margin-bottom:0;">
          (Dùng Camera điện thoại hoặc Zalo để quét)
        </p>
      </div>

      <div class="steps-side">
        <div class="step-card">
          <div class="step-title">BƯỚC 1: Kết nối Wi-Fi sự kiện</div>
          <div class="step-desc">
            Bật Wi-Fi trên điện thoại và kết nối vào mạng Wi-Fi nội bộ của sự kiện (hoặc Wi-Fi do Laptop phát).
          </div>
        </div>

        <div class="step-card">
          <div class="step-title">BƯỚC 2: Quét mã QR bên cạnh</div>
          <div class="step-desc">
            Bật Camera điện thoại (hoặc app Zalo) soi vào mã QR bên trái và nhấn mở liên kết. Bấm <strong>"Cho phép"</strong> khi trình duyệt hỏi quyền sử dụng Camera.
          </div>
        </div>

        <div class="step-card">
          <div class="step-title">BƯỚC 3: Bắt đầu soát vé</div>
          <div class="step-desc">
            Đưa Camera quét mã QR trên vé của khách. Nhìn màu màn hình và nghe tiếng bíp để xử lý.
          </div>
        </div>
      </div>
    </div>

    <div class="status-guide">
      <div style="font-weight:bold; font-size:14px; text-align:center; color:#1e293b;">
        QUY TẮC NHẬN DIỆN KẾT QUẢ SOÁT VÉ (CHỈ 1 GIÂY / KHÁCH)
      </div>
      <div class="status-grid">
        <div class="badge-card bg-green">
          ✔ MÀN HÌNH XANH LÁ
          <div class="badge-sub">Vé hợp lệ • Cho khách vào</div>
        </div>
        <div class="badge-card bg-orange">
          ⚠ MÀN HÌNH MÀU CAM
          <div class="badge-sub">ĐÃ VÀO RỒI • Giữ lại đối chiếu</div>
        </div>
        <div class="badge-card bg-red">
          ✖ MÀN HÌNH MÀU ĐỎ
          <div class="badge-sub">Vé bị hủy / Giả mạo • Từ chối</div>
        </div>
      </div>
      <div style="text-align:center; margin-top:14px; font-size:12px; color:#64748b;">
        * Nếu điện thoại khách bị nứt vỡ không quét được QR: Bấm <strong>"🔍 Tra cứu thủ công"</strong> ở góc dưới màn hình và gõ Số Điện Thoại của khách.
      </div>
    </div>
  </div>
</body>
</html>`;

  fs.writeFileSync(OUT_FILE, html, 'utf8');
  console.log(`[+] Đã tạo file hướng dẫn in ấn: ${OUT_FILE}`);
  console.log(`[*] In file này dán tại bàn soát vé để nhân viên quét là vào ngay!`);
  console.log(`========================================\n`);
}

if (require.main === module) {
  generateStaffCard();
}

module.exports = { generateStaffCard };
