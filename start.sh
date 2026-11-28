#!/usr/bin/env bash
# Khoi chay he thong soat ve offline tren Linux / macOS
cd "$(dirname "$0")" || exit 1

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [ -d "$HOME/.nvm/versions/node" ]; then
  LATEST_NVM=$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -n 1)
  [ -n "$LATEST_NVM" ] && export PATH="$HOME/.nvm/versions/node/$LATEST_NVM/bin:$PATH"
fi

echo "====================================================================="
echo " HE THONG SOAT VE OFFLINE - HUNG VUONG CONCERT: GAME ON"
echo "====================================================================="
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "[LOI] May tinh chua cai dat Node.js!"
  echo "Vui long cai Node.js LTS tu https://nodejs.org roi thu lai."
  exit 1
fi

if [ ! -d "node_modules/express" ] || [ ! -d "node_modules/better-sqlite3" ] || [ ! -d "node_modules/qrcode" ]; then
  echo "[*] Dang cai dat thu vien lan dau, vui long doi..."
  npm install --omit=dev --no-audit --no-fund || exit 1
fi

if ! node -e "require('better-sqlite3')" >/dev/null 2>&1; then
  echo "[*] Dang dong bo lai thu vien SQLite cho phien ban Node.js hien tai..."
  npm rebuild better-sqlite3 >/dev/null 2>&1 || npm install --omit=dev --no-audit --no-fund || exit 1
fi

if [ ! -f "data/tickets.db" ]; then
  echo "[!] Chua co du lieu ve. Sau khi Server chay, bam nut \"Nhap danh sach\" tren"
  echo "    trang chinh de nhap file ve that (.json / .csv), hoac chay: node import.js <file>"
  echo ""
fi

echo "[*] Dang khoi dong Server soat ve..."
node server.js
