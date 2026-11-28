/**
 * setup-test-db.js - PHẢI được require ĐẦU TIÊN trong mọi file test.
 * Trỏ DB_PATH sang một file SQLite tạm để bộ test KHÔNG BAO GIỜ
 * xóa/ghi đè dữ liệu thật trong data/tickets.db.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const REAL_DB = path.resolve(__dirname, '..', 'data', 'tickets.db');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eticket-test-'));
process.env.DB_PATH = path.join(tempDir, 'tickets.db');

if (path.resolve(process.env.DB_PATH) === REAL_DB) {
  throw new Error('Bộ test không được phép chạy trên data/tickets.db thật');
}

const { DB_PATH } = require('../db');
if (path.resolve(DB_PATH) === REAL_DB) {
  throw new Error('db.js đã được nạp trước setup-test-db.js - test sẽ đụng vào DB thật. Hãy require setup-test-db.js đầu tiên.');
}

process.on('exit', () => {
  try {
    require('../db').closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (e) {
    console.warn(`[TEST] Không dọn được thư mục tạm ${tempDir}: ${e.message}`);
  }
});

module.exports = { TEST_DB_PATH: process.env.DB_PATH, TEST_TMP_DIR: tempDir };
