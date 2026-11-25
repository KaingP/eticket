/**
 * export.js - Xuất kết quả soát vé ra JSON (cùng định dạng tickets.json) và CSV
 * Sự kiện: Hùng Vương Concert: GAME ON
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'tickets.db');

function getDb() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Không tìm thấy cơ sở dữ liệu: ${DB_PATH}`);
  }
  const db = new Database(DB_PATH, { readonly: true });
  return db;
}

function escapeCsvField(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function exportData(dbInstance) {
  const db = dbInstance || getDb();
  const rows = db.prepare(`SELECT * FROM tickets ORDER BY order_id ASC, code ASC`).all();

  // 1. Tạo JSON cùng cấu trúc tickets.json
  const exportJsonObj = {
    eventName: "Hùng Vương Concert: GAME ON",
    exportedAt: new Date().toISOString(),
    totalTickets: rows.length,
    tickets: {}
  };

  // 2. Tạo CSV
  const csvHeaders = [
    'Mã vé',
    'Họ tên',
    'Số điện thoại',
    'Email',
    'Mã đơn hàng',
    'Số thứ tự vé',
    'Loại vé',
    'Trạng thái',
    'Đã check-in',
    'Thời gian check-in',
    'Cổng soát vé',
    'Ghi chú'
  ];

  const csvLines = [csvHeaders.join(',')];

  for (const row of rows) {
    let originalTicket = {};
    try {
      if (row.raw_json) {
        originalTicket = JSON.parse(row.raw_json);
      }
    } catch (e) {
      originalTicket = {};
    }

    // Cập nhật trạng thái mới nhất từ DB
    const isCheckedIn = row.checked_in === 1;
    const updatedTicket = {
      ...originalTicket,
      ticketCode: row.code,
      customerName: row.name,
      phone: row.phone,
      email: row.email,
      orderId: row.order_id,
      ticketLabel: row.label,
      ticketTypeName: row.type,
      status: row.status,
      checkedIn: isCheckedIn,
      checkedInAt: row.checked_at,
      gate: row.gate,
      note: row.note || ''
    };

    exportJsonObj.tickets[row.code] = updatedTicket;

    const csvRow = [
      escapeCsvField(row.code),
      escapeCsvField(row.name),
      escapeCsvField(row.phone),
      escapeCsvField(row.email),
      escapeCsvField(row.order_id),
      escapeCsvField(row.label),
      escapeCsvField(row.type),
      escapeCsvField(row.status),
      escapeCsvField(isCheckedIn ? 'ĐÃ VÀO' : 'CHƯA VÀO'),
      escapeCsvField(row.checked_at || ''),
      escapeCsvField(row.gate || ''),
      escapeCsvField(row.note || '')
    ];
    csvLines.push(csvRow.join(','));
  }

  // Thêm UTF-8 BOM (\uFEFF) cho CSV để Excel tiếng Việt hiển thị hoàn hảo
  const csvContent = '\uFEFF' + csvLines.join('\r\n');
  const jsonContent = JSON.stringify(exportJsonObj, null, 2);

  if (!dbInstance) {
    db.close();
  }

  return {
    jsonObject: exportJsonObj,
    jsonString: jsonContent,
    csvString: csvContent,
    total: rows.length
  };
}

function runExport(outDir) {
  const targetDir = outDir || DATA_DIR;
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  console.log(`\n========================================`);
  console.log(`[*] Bắt đầu xuất dữ liệu vé...`);

  const { jsonString, csvString, total } = exportData();

  const jsonFilePath = path.join(targetDir, 'tickets_export.json');
  const csvFilePath = path.join(targetDir, 'tickets_export.csv');

  fs.writeFileSync(jsonFilePath, jsonString, 'utf8');
  fs.writeFileSync(csvFilePath, csvString, 'utf8');

  console.log(`[+] Đã xuất ${total} vé ra 2 định dạng:`);
  console.log(`  - JSON: ${jsonFilePath}`);
  console.log(`  - CSV:  ${csvFilePath}`);
  console.log(`========================================\n`);

  return { jsonFilePath, csvFilePath, total };
}

if (require.main === module) {
  const outDir = process.argv[2];
  runExport(outDir);
}

module.exports = { exportData, runExport };
