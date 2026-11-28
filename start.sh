#!/usr/bin/env bash
# Khoi chay he thong soat ve offline tren Linux / macOS

echo "====================================================================="
echo " HE THONG SOAT VE OFFLINE - HUNG VUONG CONCERT: GAME ON"
echo "====================================================================="
echo ""

# 1. Kiem tra Node.js
if ! command -v node &> /dev/null; then
    echo "[LOI] May tinh chua cai dat Node.js!"
    echo "Vui long cai dat Node.js LTS tu: https://nodejs.org"
    exit 1
fi

# 2. Tu dong cai dat thu vien neu chua co
if [ ! -d "node_modules" ]; then
    echo "[*] Dang cai dat thu vien lan dau..."
    npm install --omit=dev
fi

# 3. Nhac nhap danh sach ve neu CSDL chua co
if [ ! -f "data/tickets.db" ]; then
    echo "[!] Chua co du lieu ve. Sau khi Server chay, bam nut \"Nhap danh sach\" tren"
    echo "    trang chinh de nhap file ve that (.json / .csv), hoac chay: node import.js <file>"
    echo ""
fi

# 4. Khoi chay Server
echo "[*] Dang khoi dong Server soat ve..."
node server.js
