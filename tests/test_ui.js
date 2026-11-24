/**
 * test_ui.js - Automated Responsive WebUI & Design Consistency Test Suite
 * Event: "Hùng Vương Concert: GAME ON" - Gate Check-in System
 *
 * Tier 1: Static Code, Palette Consistency, CSS & DOM Rule Verification
 * Tier 2: Real Headless Browser Runtime Verification via Chrome DevTools Protocol (CDP)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const { spawn } = require('child_process');
const express = require('express');

const PROJECT_DIR = fs.existsSync(path.join(__dirname, 'server.js')) ? path.resolve(__dirname) : path.resolve(__dirname, '..');
const INDEX_HTML_PATH = path.join(PROJECT_DIR, 'public', 'index.html');
const ADMIN_HTML_PATH = path.join(PROJECT_DIR, 'public', 'admin.html');
const TEST_QR_HTML_PATH = path.join(PROJECT_DIR, 'public', 'test-qr.html');
const STAFF_CARD_PATH = path.join(PROJECT_DIR, 'docs', 'huong-dan-nhan-vien.html');
const SCREENSHOT_DIR = path.join(PROJECT_DIR, 'data', 'screenshots');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  ❌ THẤT BẠI: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✔ ĐẠT: ${message}`);
  passedTests++;
}

// =====================================================================
// TIER 1: STATIC CODE, DESIGN PALETTE, CSS & DOM RULE VERIFICATION
// =====================================================================

console.log('\n===============================================================');
console.log('🚀 BẮT ĐẦU CHẠY BỘ KIỂM THỬ GIAO DIỆN TỰ ĐỘNG (test_ui.js)');
console.log('Sự kiện: Hùng Vương Concert: GAME ON');
console.log('===============================================================\n');

console.log('[TIER 1] Kiểm tra phân tích tĩnh mã nguồn HTML / CSS / DOM...');

if (!fs.existsSync(INDEX_HTML_PATH)) {
  console.error('Không tìm thấy file public/index.html');
  process.exit(1);
}

const indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
const adminHtml = fs.readFileSync(ADMIN_HTML_PATH, 'utf8');
const testQrHtml = fs.readFileSync(TEST_QR_HTML_PATH, 'utf8');
const staffCardHtml = fs.readFileSync(STAFF_CARD_PATH, 'utf8');

// [TEST U1] Viewport Meta Tag & Mobile Compatibility
console.log('\n[TEST U1] Kiểm tra Viewport Meta Tag & Cấu hình Mobile...');
assert(/<meta\s+name=["']viewport["']\s+content=["'][^"']*width=device-width[^"']*["']/i.test(indexHtml),
  'Meta viewport cấu hình width=device-width cho mobile');
assert(/initial-scale=1\.0/i.test(indexHtml),
  'Meta viewport cấu hình initial-scale=1.0');
console.log('👉 Test U1: HOÀN THÀNH XUẤT SẮC');

// [TEST U2] Offline Purity & DOM Invariants
console.log('\n[TEST U2] Kiểm tra tính độc lập Offline (R2) & Bảo toàn DOM ID...');
const externalCdnPattern = /https?:\/\/(?!localhost|127\.0\.0\.1|192\.168\.1\.10)/i;
assert(!externalCdnPattern.test(indexHtml),
  'Trang index.html KHÔNG chứa bất kỳ link CDN / internet / HTTP(S) bên ngoài nào');
assert(!externalCdnPattern.test(adminHtml),
  'Trang admin.html KHÔNG chứa bất kỳ link CDN / internet / HTTP(S) bên ngoài nào');
assert(!indexHtml.includes('fonts.googleapis.com'),
  'index.html không gọi Google Fonts');
assert(!indexHtml.includes('.mp3') && !indexHtml.includes('.wav'),
  'index.html dùng WebAudio thuần, không tải file mp3/wav');

const qrLibPath = path.join(PROJECT_DIR, 'public', 'html5-qrcode.min.js');
assert(fs.existsSync(qrLibPath) && fs.statSync(qrLibPath).size > 100000,
  'Thư viện html5-qrcode.min.js tồn tại cục bộ đầy đủ (>100KB)');

const REQUIRED_DOM_IDS = [
  'card-all', 'card-checked', 'card-unchecked',
  'stat-all', 'stat-checked', 'stat-unchecked',
  'btn-open-scanner', 'search-input', 'search-clear-btn',
  'tickets-table-body', 'page-info', 'page-controls',
  'ticket-modal', 'm-code', 'm-name', 'm-email', 'm-phone',
  'm-issued', 'm-order', 'm-payment', 'm-label-type',
  'm-status', 'm-checked-at', 'm-note',
  'import-modal', 'file-input', 'file-selected-name', 'btn-confirm-import',
  'scanner-overlay', 'camera-reader', 'btn-torch', 'btn-switch-cam',
  'scan-result-card', 'scan-res-title', 'scan-res-note', 'scan-res-info',
  'scan-next-popup', 'offline-alert', 'toast'
];

REQUIRED_DOM_IDS.forEach(id => {
  assert(indexHtml.includes(`id="${id}"`) || indexHtml.includes(`id='${id}'`),
    `DOM ID bảo toàn: #${id}`);
});
console.log('👉 Test U2: HOÀN THÀNH XUẤT SẮC');

// [TEST U3] Design System Consistency (Crimson #AF1C2B & Blush #FCF1F2)
console.log('\n[TEST U3] Kiểm tra đồng bộ bộ nhận diện GAME ON (Đỏ Crimson & Hồng Blush)...');
assert(indexHtml.includes('#FCF1F2') && indexHtml.includes('#AF1C2B'),
  'Trang chính index.html sử dụng chuẩn nền #FCF1F2 và đỏ #AF1C2B');
assert(adminHtml.includes('#FCF1F2') && adminHtml.includes('#AF1C2B'),
  'Trang quản trị admin.html đồng bộ chuẩn nền #FCF1F2 và đỏ #AF1C2B');
assert(testQrHtml.includes('#FCF1F2') && testQrHtml.includes('#AF1C2B'),
  'Trang QR mẫu test-qr.html đồng bộ chuẩn nền #FCF1F2 và đỏ #AF1C2B');
assert(staffCardHtml.includes('#FCF1F2') && staffCardHtml.includes('#AF1C2B'),
  'Tài liệu hướng dẫn nhân viên đồng bộ chuẩn nền #FCF1F2 và đỏ #AF1C2B');
assert(indexHtml.includes('Cổng soát vé') && indexHtml.includes('Nhập danh sách'),
  'Nhãn nút trang chính khớp thiết kế ("Cổng soát vé", "Nhập danh sách")');
console.log('👉 Test U3: HOÀN THÀNH XUẤT SẮC');

// [TEST U4] Responsive CSS Media Queries & Mobile Layout
console.log('\n[TEST U4] Kiểm tra Responsive Media Queries & Layout Mobile...');
assert(/@media\s*\([^)]*max-width:\s*768px[^)]*\)/i.test(indexHtml),
  'CSS chứa @media query cho Tablet/Mobile (<= 768px)');
assert(/grid-template-columns:\s*repeat\(3,\s*1fr\)/i.test(indexHtml),
  'Thẻ thống kê trên Mobile dùng 3-column equal grid (repeat(3, 1fr)) nằm gọn 1 hàng');
assert(indexHtml.includes('-webkit-overflow-scrolling: touch') || indexHtml.includes('overflow-x: auto'),
  'Bảng vé hỗ trợ cuộn mượt không vỡ layout trên mobile');
console.log('👉 Test U4: HOÀN THÀNH XUẤT SẮC');

// [TEST U5] Modal Dialog Responsive Rules & Viewport Fit
console.log('\n[TEST U5] Kiểm tra Viewport-Fitted Modals...');
assert(/max-height:\s*calc\(100vh\s*-\s*\d+px\)/i.test(indexHtml),
  'Modal box giới hạn max-height tính theo 100vh tránh tràn màn hình điện thoại');
assert(/\.modal-body\s*\{[^}]*overflow-y:\s*auto/i.test(indexHtml),
  '.modal-body kích hoạt cuộn dọc nội bộ (overflow-y: auto) để bảo vệ header/footer không bị che');
assert(/\.modal-box\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/i.test(indexHtml),
  '.modal-box dùng layout flex column chuẩn');
console.log('👉 Test U5: HOÀN THÀNH XUẤT SẮC');

// [TEST U6] Touch Target Ergonomics & Camera Overlay Styles
console.log('\n[TEST U6] Kiểm tra Touch Target (>=44px) & Scanner Ergonomics...');
assert(/@media\s*\([^)]*max-width:\s*768px[^)]*\)[\s\S]*\.badge-status\s*\{[^}]*min-height:\s*44px/i.test(indexHtml),
  'Badge trạng thái vé trên Mobile đạt diện tích chạm chuẩn ngón tay (min-height: 44px)');
assert(indexHtml.includes('scanner-controls-bar') || indexHtml.includes('btn-scanner-btn'),
  'Giao diện Scanner có thanh điều khiển ngón cái (Thumb-zone control bar)');
assert(indexHtml.includes('env(safe-area-inset-bottom') || indexHtml.includes('safe-area'),
  'Giao diện Scanner và màn hình hỗ trợ vùng an toàn safe-area-inset');
console.log('👉 Test U6: HOÀN THÀNH XUẤT SẮC');

// =====================================================================
// TIER 2: REAL HEADLESS BROWSER RUNTIME VERIFICATION (CDP)
// =====================================================================

console.log('\n===============================================================');
console.log('[TIER 2] Kiểm thử giao diện thực tế qua Headless Chromium (CDP)...');
console.log('===============================================================');

function findBrowserBinary() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const browserPath = findBrowserBinary();

if (!browserPath) {
  console.warn('⚠ Không tìm thấy binary Chrome hoặc Edge trên hệ thống host. Bỏ qua Tier 2 runtime.');
  finishSuite();
} else {
  runTier2CDP(browserPath);
}

async function runTier2CDP(binPath) {
  let serverInstance = null;
  let browserProcess = null;
  let wsClient = null;
  const tmpUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hvc_cdp_ui_'));

  try {
    // 1. Khởi chạy Mock Express Server trên cổng tự do (Port 0)
    console.log('\n[TEST U7] Khởi động Server thử nghiệm & Trình duyệt Headless...');
    const app = express();
    app.use(express.static(path.join(PROJECT_DIR, 'public')));
    app.use(express.json());

    // Mock endpoints cho test UI
    app.get('/api/stats', (req, res) => {
      res.json({
        all: 5, checked: 2, unchecked: 3, total: 5, totalAll: 5, remaining: 3,
        by_gate: { 'Cổng chính': 2 },
        recent_scans: [
          { at: '2026-11-25T00:31:44+07:00', code: 'HVC-K2MJ8D-U754', name: 'Nguyễn Đức Trung', gate: 'Cổng chính', result: 'OK' }
        ]
      });
    });

    app.get('/api/tickets', (req, res) => {
      res.json({
        total: 5,
        page: 1,
        limit: 8,
        totalPages: 1,
        tickets: [
          { stt: 1, code: 'HVC-K2MJ8D-U754', name: 'Nguyễn Đức Trung', email: 'dctrng.work@gmail.com', issuedAt: '2026-11-09T11:10:25+07:00', label: 'Vé 1/2', checkedIn: 1, checkedAt: '2026-11-25T00:31:44+07:00', note: 'voucher' },
          { stt: 2, code: 'HVC-6CJZG2-EE5C', name: 'Lê Phạm Gia Hân', email: 'giahan.lepham@gmail.com', issuedAt: '2026-11-11T09:20:45+07:00', label: 'Vé 1/1', checkedIn: 1, checkedAt: '2026-11-14T18:05:30+07:00', note: 'khách VIP' },
          { stt: 3, code: 'HVC-K4YGBF-70EB', name: 'Nguyễn Hoàng Bảo Thy', email: 'bbaothy2204@gmail.com', issuedAt: '2026-11-05T21:19:08+07:00', label: 'Vé 1/1', checkedIn: 0, checkedAt: null, note: 'voucher nước' },
          { stt: 4, code: 'HVC-50P368-F4F8', name: 'Nguyễn Đức Trung', email: 'dctrng.work@gmail.com', issuedAt: '2026-11-09T11:10:25+07:00', label: 'Vé 2/2', checkedIn: 0, checkedAt: null, note: 'quà tặng áo' },
          { stt: 5, code: 'HVC-5NS9YA-B711', name: 'Trần Minh Khôi', email: 'minhkhoi.tran26@gmail.com', issuedAt: '2026-11-10T14:35:12+07:00', label: 'Vé 1/1', checkedIn: 0, checkedAt: null, note: '' }
        ]
      });
    });

    app.get('/api/admin/tickets', (req, res) => {
      res.json({
        total: 2,
        items: [
          { code: 'HVC-K2MJ8D-U754', name: 'Nguyễn Đức Trung', phone: '0868037559', order_id: 'ORD-739734074', label: 'Vé 1/2', type: 'Vé Điện Tử', status: 'VALID', checked_in: 1, gate: 'Cổng chính', checked_at: '2026-11-25T00:31:44+07:00' },
          { code: 'HVC-50P368-F4F8', name: 'Nguyễn Đức Trung', phone: '0868037559', order_id: 'ORD-739734074', label: 'Vé 2/2', type: 'Vé Điện Tử', status: 'VALID', checked_in: 0, gate: null, checked_at: null }
        ]
      });
    });

    app.get('/api/tickets/:code', (req, res) => {
      res.json({
        code: req.params.code,
        name: 'Nguyễn Đức Trung',
        email: 'dctrng.work@gmail.com',
        phone: '0868037559',
        issuedAt: '2026-11-09T11:10:25+07:00',
        orderId: 'ORD-739734074',
        paymentInfo: 'PAYOS_AUTO',
        label: 'Vé 1/2',
        type: 'Vé Điện Tử (Player Pass QR)',
        checkedIn: 1,
        checkedAt: '2026-11-25T00:31:44+07:00',
        note: 'voucher'
      });
    });

    app.post('/api/manual-checkin', (req, res) => {
      res.json({ status: 'OK', message: 'Cập nhật thành công' });
    });

    serverInstance = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const serverPort = serverInstance.address().port;
    const serverUrl = `http://127.0.0.1:${serverPort}/`;
    assert(serverPort > 0, `Server test Express khởi chạy thành công tại ${serverUrl}`);

    const cdpPort = 9600 + Math.floor(Math.random() * 200);
    browserProcess = spawn(binPath, [
      '--headless=new',
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${tmpUserDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      'about:blank'
    ]);

    let pageTarget = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const resp = await fetch(`http://127.0.0.1:${cdpPort}/json`);
        if (resp.ok) {
          const pages = await resp.json();
          if (pages && pages.length > 0 && pages[0].webSocketDebuggerUrl) {
            pageTarget = pages[0];
            break;
          }
        }
      } catch (e) {}
    }
    assert(pageTarget !== null, `Trình duyệt headless (${path.basename(binPath)}) sẵn sàng kết nối CDP`);

    wsClient = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      wsClient.onopen = resolve;
      wsClient.onerror = reject;
    });

    let msgId = 1;
    function sendCdp(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        const handler = (evt) => {
          try {
            const data = JSON.parse(evt.data);
            if (data.id === id) {
              wsClient.removeEventListener('message', handler);
              if (data.error) reject(data.error);
              else resolve(data.result);
            }
          } catch (e) {}
        };
        wsClient.addEventListener('message', handler);
        wsClient.send(JSON.stringify({ id, method, params }));
      });
    }

    async function evalJs(expr) {
      const res = await sendCdp('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true
      });
      if (res.exceptionDetails) {
        throw new Error(res.exceptionDetails.text || 'JS Evaluation Exception');
      }
      return res.result ? res.result.value : undefined;
    }

    await sendCdp('Page.enable');
    await sendCdp('Runtime.enable');
    await sendCdp('DOM.enable');

    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    console.log('👉 Test U7: HOÀN THÀNH XUẤT SẮC');

    // [TEST U8] Desktop Layout (1280x800) - Crimson & Blush Mockup Fidelity
    console.log('\n[TEST U8] Kiểm tra hiển thị trang chính trên Máy tính (Desktop 1280x800)...');
    await sendCdp('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });

    await sendCdp('Page.navigate', { url: serverUrl });
    await new Promise(r => setTimeout(r, 1200));

    const desktopScrollWidth = await evalJs('document.documentElement.scrollWidth');
    assert(desktopScrollWidth <= 1280, `Desktop (1280px) không có thanh cuộn ngang trang (scrollWidth = ${desktopScrollWidth})`);

    const paletteCheck = await evalJs(`(() => {
      const bodyBg = window.getComputedStyle(document.body).backgroundColor;
      const headerBg = window.getComputedStyle(document.querySelector('header')).backgroundColor;
      const thBg = window.getComputedStyle(document.querySelector('th')).backgroundColor;
      const thCount = document.querySelectorAll('thead th').length;
      return { bodyBg, headerBg, thBg, thCount };
    })()`);
    assert(paletteCheck.bodyBg === 'rgb(252, 241, 242)', `Màu nền trang khớp mockup #FCF1F2 (${paletteCheck.bodyBg})`);
    assert(paletteCheck.headerBg === 'rgb(175, 28, 43)', `Màu banner header khớp mockup #AF1C2B (${paletteCheck.headerBg})`);
    assert(paletteCheck.thBg === 'rgb(175, 28, 43)', `Màu header bảng khớp mockup #AF1C2B (${paletteCheck.thBg})`);
    assert(paletteCheck.thCount === 8, `Bảng vé hiển thị đúng 8 cột chuẩn mockup (thực tế: ${paletteCheck.thCount})`);

    const statAllVal = await evalJs("document.getElementById('stat-all').innerText");
    assert(statAllVal === '05', `Thẻ đếm "Tất cả" hiển thị đúng dữ liệu API: ${statAllVal}`);

    const tableRowsCount = await evalJs("document.querySelectorAll('#tickets-table-body tr').length");
    assert(tableRowsCount === 5, `Bảng vé render đủ 5 dòng dữ liệu (thực tế: ${tableRowsCount})`);

    const desktopShot = await sendCdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'ui_desktop.png'), Buffer.from(desktopShot.data, 'base64'));
    assert(fs.existsSync(path.join(SCREENSHOT_DIR, 'ui_desktop.png')),
      'Đã xuất ảnh chụp giao diện Desktop: data/screenshots/ui_desktop.png');
    console.log('👉 Test U8: HOÀN THÀNH XUẤT SẮC');

    // [TEST U9] Mobile Layout (375x667)
    console.log('\n[TEST U9] Kiểm tra hiển thị màn hình Điện thoại (Mobile 375x667)...');
    await sendCdp('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 667,
      deviceScaleFactor: 2,
      mobile: true
    });
    await new Promise(r => setTimeout(r, 600));

    const mobileScrollWidth = await evalJs('document.documentElement.scrollWidth');
    assert(mobileScrollWidth <= 375, `Mobile (375px) hoàn toàn KHÔNG bị tràn ngang vỡ layout (scrollWidth = ${mobileScrollWidth})`);

    const cardsAlignment = await evalJs(`(() => {
      const a = document.getElementById('card-all').getBoundingClientRect();
      const b = document.getElementById('card-checked').getBoundingClientRect();
      const c = document.getElementById('card-unchecked').getBoundingClientRect();
      return {
        sameRow: Math.abs(a.top - b.top) < 4 && Math.abs(b.top - c.top) < 4
      };
    })()`);
    assert(cardsAlignment.sameRow, `3 thẻ thống kê trên mobile nằm thẳng hàng trên 1 dòng duy nhất`);

    const badgeHeight = await evalJs(`(() => {
      const b = document.querySelector('.badge-status');
      return b ? b.getBoundingClientRect().height : 0;
    })()`);
    assert(badgeHeight >= 40, `Touch target của nút trạng thái đạt chuẩn cảm ứng ngón tay (chiều cao: ${badgeHeight}px >= 40px)`);

    const mobileShot = await sendCdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'ui_mobile.png'), Buffer.from(mobileShot.data, 'base64'));
    assert(fs.existsSync(path.join(SCREENSHOT_DIR, 'ui_mobile.png')),
      'Đã xuất ảnh chụp giao diện Mobile: data/screenshots/ui_mobile.png');
    console.log('👉 Test U9: HOÀN THÀNH XUẤT SẮC');

    // [TEST U10] Modal Interactive Opening, Fitting, and Closing on Mobile
    console.log('\n[TEST U10] Kiểm tra mở Modal chi tiết vé & Bounding Box trong Viewport Mobile...');
    await evalJs("viewTicketDetail('HVC-K2MJ8D-U754')");
    await new Promise(r => setTimeout(r, 400));

    const modalState = await evalJs(`(() => {
      const modal = document.getElementById('ticket-modal');
      const box = modal.querySelector('.modal-box');
      const body = modal.querySelector('.modal-body');
      const rect = box.getBoundingClientRect();
      const bodyComputed = window.getComputedStyle(body);
      return {
        display: window.getComputedStyle(modal).display,
        boxWidth: rect.width,
        boxHeight: rect.height,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        overflowY: bodyComputed.overflowY,
        code: document.getElementById('m-code').innerText
      };
    })()`);

    assert(modalState.display === 'flex', 'Modal chi tiết hiển thị (display: flex)');
    assert(modalState.code === 'HVC-K2MJ8D-U754', `Thông tin mã vé trong modal chính xác: ${modalState.code}`);
    assert(modalState.boxWidth <= modalState.windowWidth,
      `Chiều rộng modal (${modalState.boxWidth}px) không tràn màn hình mobile (${modalState.windowWidth}px)`);
    assert(modalState.boxHeight <= modalState.windowHeight,
      `Chiều cao modal (${modalState.boxHeight}px) nằm trọn trong viewport (${modalState.windowHeight}px)`);
    assert(modalState.overflowY === 'auto',
      'Thân modal có overflow-y: auto giúp cuộn mượt khi nội dung dài');

    const modalShot = await sendCdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'ui_mobile_modal.png'), Buffer.from(modalShot.data, 'base64'));

    await evalJs("closeTicketModal()");
    await new Promise(r => setTimeout(r, 200));
    const isModalClosed = await evalJs("document.getElementById('ticket-modal').style.display === 'none'");
    assert(isModalClosed, 'Modal đóng thành công khi nhấn nút đóng');
    console.log('👉 Test U10: HOÀN THÀNH XUẤT SẮC');

    // [TEST U11] Kiểm tra các trang phụ (Admin & Test QR)
    console.log('\n[TEST U11] Kiểm tra đồng bộ giao diện trên trang Quản trị (admin.html) & Trang QR (test-qr.html)...');
    await sendCdp('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sendCdp('Page.navigate', { url: `${serverUrl}admin.html` });
    await new Promise(r => setTimeout(r, 800));
    await evalJs("sessionStorage.setItem('soatve_admin_pin', '123456'); location.reload();");
    await new Promise(r => setTimeout(r, 1000));

    const adminCheck = await evalJs(`(() => {
      return {
        bodyBg: window.getComputedStyle(document.body).backgroundColor,
        headerBg: window.getComputedStyle(document.querySelector('header')).backgroundColor,
        scrollWidth: document.documentElement.scrollWidth
      };
    })()`);
    assert(adminCheck.bodyBg === 'rgb(252, 241, 242)', `Admin background khớp chuẩn #FCF1F2 (${adminCheck.bodyBg})`);
    assert(adminCheck.headerBg === 'rgb(175, 28, 43)', `Admin header khớp chuẩn #AF1C2B (${adminCheck.headerBg})`);
    assert(adminCheck.scrollWidth <= 1280, `Admin Desktop không tràn ngang (scrollWidth = ${adminCheck.scrollWidth})`);

    const adminShot = await sendCdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'ui_admin.png'), Buffer.from(adminShot.data, 'base64'));

    await sendCdp('Page.navigate', { url: `${serverUrl}test-qr.html` });
    await new Promise(r => setTimeout(r, 600));
    const qrCheck = await evalJs(`(() => {
      return {
        bodyBg: window.getComputedStyle(document.body).backgroundColor,
        headerBg: window.getComputedStyle(document.querySelector('header')).backgroundColor
      };
    })()`);
    assert(qrCheck.bodyBg === 'rgb(252, 241, 242)', `Trang test-qr background khớp chuẩn #FCF1F2 (${qrCheck.bodyBg})`);
    assert(qrCheck.headerBg === 'rgb(175, 28, 43)', `Trang test-qr header khớp chuẩn #AF1C2B (${qrCheck.headerBg})`);
    const qrShot = await sendCdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'ui_test_qr.png'), Buffer.from(qrShot.data, 'base64'));

    console.log('👉 Test U11: HOÀN THÀNH XUẤT SẮC');

    // [TEST U12] Responsive Verification Screenshots
    console.log('\n[TEST U12] Kiểm tra danh mục hình ảnh kiểm thử thực tế...');
    const screenshots = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.png'));
    assert(screenshots.length >= 4, `Đã lưu ${screenshots.length} ảnh kiểm thử thực tế (${screenshots.join(', ')})`);
    console.log('👉 Test U12: HOÀN THÀNH XUẤT SẮC');

  } catch (err) {
    console.error('❌ Lỗi trong quá trình chạy Tier 2 CDP:', err);
    process.exit(1);
  } finally {
    if (wsClient) {
      try { wsClient.close(); } catch (e) {}
    }
    if (browserProcess) {
      try { browserProcess.kill(); } catch (e) {}
    }
    if (serverInstance) {
      try { serverInstance.close(); } catch (e) {}
    }
    try {
      fs.rmSync(tmpUserDataDir, { recursive: true, force: true });
    } catch (e) {}
    finishSuite();
  }
}

function finishSuite() {
  console.log('\n===============================================================');
  console.log(`🎉 KẾT QUẢ KIỂM THỬ UI: ĐÃ ĐẠT ${passedTests}/${totalTests} BÀI TEST!`);
  console.log('===============================================================\n');
  process.exit(0);
}
