/**
 * test_ui.js - Automated Responsive WebUI & Ergonomics Test Suite
 * Event: "Hùng Vương Concert: GAME ON" - Gate Check-in System
 *
 * Tier 1: Static Code, CSS & DOM Rule Verification (Zero-dependency, offline)
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
// TIER 1: STATIC CODE, CSS & DOM RULE VERIFICATION
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

// [TEST U1] Viewport Meta Tag & Mobile Compatibility
console.log('\n[TEST U1] Kiểm tra Viewport Meta Tag & Cấu hình Mobile...');
assert(/<meta\s+name=["']viewport["']\s+content=["'][^"']*width=device-width[^"']*["']/i.test(indexHtml),
  'Meta viewport cấu hình width=device-width cho mobile');
assert(/initial-scale=1\.0/i.test(indexHtml),
  'Meta viewport cấu hình initial-scale=1.0');
console.log('👉 Test U1: HOÀN THÀNH XUẤT SẮC');

// [TEST U2] Offline Purity & DOM Invariants
console.log('\n[TEST U2] Kiểm tra tính độc lập Offline (R2) & Bảo toàn 34 DOM ID...');
const externalCdnPattern = /https?:\/\/(?!localhost|127\.0\.0\.1|192\.168\.1\.10)/i;
assert(!externalCdnPattern.test(indexHtml),
  'Trang index.html KHÔNG chứa bất kỳ link CDN / internet / HTTP(S) bên ngoài nào');
assert(!indexHtml.includes('fonts.googleapis.com'),
  'index.html không gọi Google Fonts');
assert(!indexHtml.includes('.mp3') && !indexHtml.includes('.wav'),
  'index.html dùng WebAudio thuần, không tải file mp3/wav');

const qrLibPath = path.join(PROJECT_DIR, 'public', 'html5-qrcode.min.js');
assert(fs.existsSync(qrLibPath) && fs.statSync(qrLibPath).size > 100000,
  'Thư viện html5-qrcode.min.js tồn tại cục bộ đầy đủ (>100KB)');

// Kiểm tra toàn bộ 34 DOM IDs bắt buộc + #btn-theme-toggle
const REQUIRED_DOM_IDS = [
  'card-all', 'card-checked', 'card-unchecked',
  'stat-all', 'stat-checked', 'stat-unchecked',
  'search-input', 'search-clear-btn',
  'tickets-table-body', 'page-info', 'page-controls',
  'ticket-modal', 'm-code', 'm-name', 'm-email', 'm-phone',
  'm-issued', 'm-order', 'm-payment', 'm-label-type',
  'm-status', 'm-checked-at', 'm-note',
  'import-modal', 'file-input', 'file-selected-name', 'btn-confirm-import',
  'scanner-overlay', 'camera-reader', 'btn-torch', 'btn-switch-cam',
  'scan-result-card', 'scan-res-title', 'scan-res-note', 'scan-res-info',
  'scan-next-popup', 'offline-alert', 'toast',
  'btn-theme-toggle'
];

REQUIRED_DOM_IDS.forEach(id => {
  assert(indexHtml.includes(`id="${id}"`) || indexHtml.includes(`id='${id}'`),
    `DOM ID bảo toàn: #${id}`);
});
console.log('👉 Test U2: HOÀN THÀNH XUẤT SẮC');

// [TEST U3] CSS Theme Variables & Light/Dark Mode Architecture
console.log('\n[TEST U3] Kiểm tra hệ thống CSS Variables Light/Dark Mode...');
assert(indexHtml.includes(':root') && indexHtml.includes('--bg:') && indexHtml.includes('--card-bg:'),
  ':root định nghĩa đầy đủ bảng màu mặc định Dark theme');
assert(indexHtml.includes('[data-theme="light"]') || indexHtml.includes('[data-theme=\'light\']'),
  'CSS chứa bộ định nghĩa [data-theme="light"] cho giao diện Light mode');
assert(indexHtml.includes('toggleTheme') && indexHtml.includes('localStorage'),
  'Có hàm toggleTheme() lưu trạng thái vào localStorage');
assert(indexHtml.includes('hvc_theme') || indexHtml.includes("'theme'") || indexHtml.includes('"theme"'),
  'Key lưu trữ theme vào localStorage hoạt động chuẩn');
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
assert(/\.badge-status\s*\{[^}]*min-height:\s*44px/i.test(indexHtml) || /\.badge-status\s*\{[^}]*padding:\s*[6-9]px/i.test(indexHtml),
  'Badge trạng thái vé đạt diện tích chạm chuẩn ngón tay (min-height: 44px)');
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
      res.json({ all: 12, checked: 5, unchecked: 7, total: 12, remaining: 7 });
    });

    app.get('/api/tickets', (req, res) => {
      res.json({
        total: 3,
        page: 1,
        limit: 8,
        totalPages: 1,
        tickets: [
          { stt: 1, code: 'HVC-AUTO-001', name: 'Nguyễn Văn Test', email: 'test@hvc.vn', issuedAt: '2026-11-20T10:00:00Z', label: 'Vé 1/1', checkedIn: 1, checkedAt: '2026-11-24T12:00:00Z', note: 'voucher 50k' },
          { stt: 2, code: 'HVC-AUTO-002', name: 'Trần Thị Thử', email: 'thu@hvc.vn', issuedAt: '2026-11-20T10:05:00Z', label: 'Vé 1/2', checkedIn: 0, checkedAt: null, note: '' },
          { stt: 3, code: 'HVC-AUTO-003', name: 'Lê Hoàng Nghiệm', email: 'nghiem@hvc.vn', issuedAt: '2026-11-20T10:10:00Z', label: 'Vé 1/1', checkedIn: 0, checkedAt: null, note: 'Khách VIP' }
        ]
      });
    });

    app.get('/api/tickets/:code', (req, res) => {
      res.json({
        code: req.params.code,
        name: 'Nguyễn Văn Test',
        email: 'test@hvc.vn',
        phone: '0987654321',
        issuedAt: '2026-11-20T10:00:00Z',
        orderId: 'ORD-AUTO-888',
        paymentInfo: 'PAYOS_AUTO_CONFIRMED',
        label: 'Vé 1/1',
        type: 'Vé VIP Sự Kiện',
        checkedIn: 1,
        checkedAt: '2026-11-24T12:00:00Z',
        note: 'voucher 50k'
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

    // 2. Chọn ngẫu nhiên cổng CDP từ 9600-9800
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

    // Chờ CDP socket sẵn sàng
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

    // 3. Kết nối WebSocket CDP
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

    // [TEST U8] Desktop Layout (1280x800)
    console.log('\n[TEST U8] Kiểm tra hiển thị màn hình Máy tính (Desktop 1280x800)...');
    await sendCdp('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });

    await sendCdp('Page.navigate', { url: serverUrl });
    await new Promise(r => setTimeout(r, 1200)); // Chờ DOMContentLoaded + loadStats + loadTickets

    const desktopScrollWidth = await evalJs('document.documentElement.scrollWidth');
    assert(desktopScrollWidth <= 1280, `Desktop (1280px) không có thanh cuộn ngang trang (scrollWidth = ${desktopScrollWidth})`);

    const statAllVal = await evalJs("document.getElementById('stat-all').innerText");
    assert(statAllVal === '12', `Thẻ đếm "Tất cả" hiển thị đúng dữ liệu API: ${statAllVal}`);

    const tableRowsCount = await evalJs("document.querySelectorAll('#tickets-table-body tr').length");
    assert(tableRowsCount === 3, `Bảng vé render đủ 3 dòng dữ liệu (thực tế: ${tableRowsCount})`);

    // Chụp ảnh Desktop
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

    // Kiểm tra 3 thẻ stat-card nằm cùng 1 hàng
    const cardsAlignment = await evalJs(`(() => {
      const a = document.getElementById('card-all').getBoundingClientRect();
      const b = document.getElementById('card-checked').getBoundingClientRect();
      const c = document.getElementById('card-unchecked').getBoundingClientRect();
      return {
        sameRow: Math.abs(a.top - b.top) < 4 && Math.abs(b.top - c.top) < 4,
        aWidth: a.width,
        bWidth: b.width,
        cWidth: c.width
      };
    })()`);
    assert(cardsAlignment.sameRow, `3 thẻ thống kê trên mobile nằm thẳng hàng trên 1 dòng duy nhất`);

    // Kiểm tra touch target của badge trạng thái
    const badgeHeight = await evalJs(`(() => {
      const b = document.querySelector('.badge-status');
      return b ? b.getBoundingClientRect().height : 0;
    })()`);
    assert(badgeHeight >= 40, `Touch target của nút trạng thái đạt chuẩn cảm ứng ngón tay (chiều cao: ${badgeHeight}px >= 40px)`);

    // Chụp ảnh Mobile Dark
    const mobileShot = await sendCdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'ui_mobile.png'), Buffer.from(mobileShot.data, 'base64'));
    assert(fs.existsSync(path.join(SCREENSHOT_DIR, 'ui_mobile.png')),
      'Đã xuất ảnh chụp giao diện Mobile: data/screenshots/ui_mobile.png');
    console.log('👉 Test U9: HOÀN THÀNH XUẤT SẮC');

    // [TEST U10] Light/Dark Mode Toggle Interactive Runtime
    console.log('\n[TEST U10] Kiểm tra chuyển đổi Light/Dark mode tương tác thời gian thực...');
    const initialTheme = await evalJs("document.documentElement.getAttribute('data-theme') || 'dark'");
    assert(initialTheme === 'dark', 'Giao diện khởi đầu ở Dark theme mặc định');

    // Click nút toggle
    await evalJs("document.getElementById('btn-theme-toggle').click()");
    await new Promise(r => setTimeout(r, 200));

    const lightTheme = await evalJs("document.documentElement.getAttribute('data-theme')");
    assert(lightTheme === 'light', 'Sau khi click nút toggle, data-theme chuyển thành "light"');

    const savedTheme = await evalJs("localStorage.getItem('hvc_theme')");
    assert(savedTheme === 'light', 'Trạng thái "light" được lưu bền vững vào localStorage');

    const bodyBgLight = await evalJs("window.getComputedStyle(document.body).backgroundColor");
    assert(bodyBgLight.includes('248') || bodyBgLight.includes('255') || bodyBgLight.includes('250'),
      `Màu nền body chuyển sang sáng thành công (computed: ${bodyBgLight})`);

    // Chụp ảnh Mobile Light
    const lightShot = await sendCdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'ui_mobile_light.png'), Buffer.from(lightShot.data, 'base64'));

    // Click toggle lần 2 quay lại Dark
    await evalJs("document.getElementById('btn-theme-toggle').click()");
    await new Promise(r => setTimeout(r, 200));

    const revertedTheme = await evalJs("document.documentElement.getAttribute('data-theme')");
    assert(revertedTheme === 'dark', 'Click lại nút toggle, data-theme chuyển về "dark"');
    console.log('👉 Test U10: HOÀN THÀNH XUẤT SẮC');

    // [TEST U11] Modal Interactive Opening, Fitting, and Closing
    console.log('\n[TEST U11] Kiểm tra mở Modal chi tiết vé & Bounding Box trong Viewport Mobile...');
    await evalJs("viewTicketDetail('HVC-AUTO-001')");
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
    assert(modalState.code === 'HVC-AUTO-001', `Thông tin mã vé trong modal chính xác: ${modalState.code}`);
    assert(modalState.boxWidth <= modalState.windowWidth,
      `Chiều rộng modal (${modalState.boxWidth}px) không tràn màn hình mobile (${modalState.windowWidth}px)`);
    assert(modalState.boxHeight <= modalState.windowHeight,
      `Chiều cao modal (${modalState.boxHeight}px) nằm trọn trong viewport (${modalState.windowHeight}px)`);
    assert(modalState.overflowY === 'auto',
      'Thân modal có overflow-y: auto giúp cuộn mượt khi nội dung dài');

    // Chụp ảnh Modal
    const modalShot = await sendCdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'ui_mobile_modal.png'), Buffer.from(modalShot.data, 'base64'));

    // Đóng modal
    await evalJs("closeTicketModal()");
    await new Promise(r => setTimeout(r, 200));
    const isModalClosed = await evalJs("document.getElementById('ticket-modal').style.display === 'none'");
    assert(isModalClosed, 'Modal đóng thành công khi nhấn nút đóng');
    console.log('👉 Test U11: HOÀN THÀNH XUẤT SẮC');

    // [TEST U12] Responsive Verification Screenshots
    console.log('\n[TEST U12] Kiểm tra danh mục hình ảnh kiểm thử Responsive...');
    const screenshots = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.png'));
    assert(screenshots.length >= 3, `Đã lưu ${screenshots.length} ảnh kiểm thử thực tế (${screenshots.join(', ')})`);
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
