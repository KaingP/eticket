/**
 * db.js - Kết nối SQLite dùng chung cho server.js, import.js, export.js
 * Sự kiện: Hùng Vương Concert: GAME ON
 *
 * Đường dẫn DB mặc định: data/tickets.db
 * Có thể đổi bằng biến môi trường DB_PATH (bộ test dùng file tạm riêng,
 * KHÔNG BAO GIỜ đụng vào data/tickets.db thật).
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
const DEFAULT_DB_PATH = path.join(DATA_DIR, 'tickets.db');
const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : DEFAULT_DB_PATH;

const SCHEMA_SQL = `
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
`;

// Thêm cột còn thiếu nếu DB được tạo từ phiên bản cũ
function addColumnIfMissing(db, column, type) {
  const exists = db.prepare(`PRAGMA table_info(tickets)`).all().some(c => c.name === column);
  if (!exists) db.exec(`ALTER TABLE tickets ADD COLUMN ${column} ${type}`);
}

let instance = null;

function getDb() {
  if (instance) return instance;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  instance = new Database(DB_PATH);
  instance.pragma('journal_mode = WAL');
  instance.pragma('synchronous = NORMAL');
  instance.exec(SCHEMA_SQL);
  addColumnIfMissing(instance, 'issued_at', 'TEXT');
  addColumnIfMissing(instance, 'note', 'TEXT');
  return instance;
}

function closeDb() {
  if (instance) {
    instance.close();
    instance = null;
  }
}

module.exports = { getDb, closeDb, DB_PATH, DATA_DIR, DEFAULT_DB_PATH };
