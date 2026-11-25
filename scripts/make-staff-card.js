/**
 * make-staff-card.js - Tạo bảng hướng dẫn kết nối & soát vé sẵn sàng in A4 dán tại bàn soát vé
 * Sự kiện: Hùng Vương Concert: GAME ON
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');

const ROOT_DIR = fs.existsSync(path.join(__dirname, 'server.js')) ? __dirname : path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');
const OUT_FILE = path.join(DOCS_DIR, 'huong-dan-nhan-vien.html');

function getPrimaryIp() {
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
  const preferred192 = ips.find(ip => ip.startsWith('192.168.') && !ip.startsWith('192.168.56.'));
  if (preferred192) return preferred192;
  const anyLan = ips.find(ip => ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.'));
  return anyLan || ips[0] || '192.168.1.10';
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
      background: #FCF1F2;
      color: #2D1618;
    }
    .sheet {
      max-width: 800px;
      margin: 0 auto;
      background: #FFFFFF;
      border: 2px solid #AF1C2B;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(175, 28, 43, 0.1);
    }
    .header {
      background: #AF1C2B;
      color: #FFFFFF;
      text-align: center;
      padding: 22px 24px;
    }
    h1 {
      font-size: 26px;
      color: #FFFFFF;
      margin: 0 0 6px 0;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .subtitle {
      font-size: 15px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.92);
      margin: 0;
    }
    .sheet-body {
      padding: 28px 32px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      align-items: center;
    }
    .qr-side {
      text-align: center;
      background: #FCF5F6;
      border: 2px solid #F3D1D5;
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
      color: #AF1C2B;
      background: #FFFFFF;
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid #E2C4C7;
    }
    .steps-side {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .step-card {
      background: #FCF5F6;
      border-left: 5px solid #AF1C2B;
      padding: 12px 16px;
      border-radius: 0 10px 10px 0;
    }
    .step-title {
      font-size: 15px;
      font-weight: bold;
      color: #AF1C2B;
      margin-bottom: 4px;
    }
    .step-desc {
      font-size: 13px;
      color: #4A2327;
      line-height: 1.4;
    }
    .status-guide {
      margin-top: 24px;
      border-top: 2px dashed #E2C4C7;
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
      border-radius: 10px;
      color: #fff;
      font-weight: bold;
      font-size: 13px;
    }
    .bg-green { background: #059669; }
    .bg-orange { background: #d97706; }
    .bg-red { background: #AF1C2B; }
    .badge-sub {
      font-size: 11px;
      font-weight: normal;
      margin-top: 4px;
      opacity: 0.95;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .sheet { box-shadow: none; border-width: 2px; }
      .header { background: #AF1C2B !important; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <h1>HÙNG VƯƠNG CONCERT: GAME ON</h1>
      <p class="subtitle">HƯỚNG DẪN KẾT NỐI & SOÁT VÉ DÀNH CHO NHÂN VIÊN</p>
    </div>

    <div class="sheet-body">
    <div class="grid">
      <div class="qr-side">
        <h3 style="margin-top:0; color:#AF1C2B;">QUÉT MÃ MỞ APP SOÁT VÉ</h3>
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
            Bật Camera điện thoại (mở bằng <strong>Safari</strong> trên iPhone hoặc <strong>Chrome</strong> trên Android). Nếu có cảnh báo bảo mật nội bộ: chọn <em>Hiển thị chi tiết → Truy cập trang web này</em> (iPhone) hoặc <em>Nâng cao → Tiếp tục</em> (Android), sau đó bấm <strong>"Cho phép"</strong> quyền Camera.
          </div>
        </div>

        <div class="step-card">
          <div class="step-title">BƯỚC 3: Bắt đầu soát vé</div>
          <div class="step-desc">
            Nhấn <strong>"Cổng soát vé"</strong> và đưa Camera quét mã QR trên vé khách (có thể bật <strong>⚡ Flash</strong> khi thiếu sáng). Nhìn màu màn hình và nghe tiếng bíp để xử lý.
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
          <div class="badge-sub">Thành công! • Cho vào (lưu ý Ghi chú nếu có)</div>
        </div>
        <div class="badge-card bg-orange">
          ⚠ ĐÃ VÀO RỒI (MÀN HÌNH ĐỎ)
          <div class="badge-sub">Báo "Vé đã được soát lúc..." • Giữ lại đối chiếu</div>
        </div>
        <div class="badge-card bg-red">
          ✖ KHÔNG HỢP LỆ (MÀN HÌNH ĐỎ)
          <div class="badge-sub">Vé bị hủy / Không tồn tại • Từ chối</div>
        </div>
      </div>
      <div style="text-align:center; margin-top:14px; font-size:12px; color:#785A5E;">
        * Nếu điện thoại khách bị nứt vỡ không quét được QR: Tìm mã vé trên bảng hoặc gõ Tên / Mã vé vào ô tìm kiếm.
      </div>
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
