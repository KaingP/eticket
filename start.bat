@echo off
chcp 65001 >nul 2>nul
setlocal EnableExtensions
pushd "%~dp0"
title HE THONG SOAT VE - HUNG VUONG CONCERT: GAME ON

echo =====================================================================
echo  HE THONG SOAT VE OFFLINE - HUNG VUONG CONCERT: GAME ON
echo =====================================================================
echo.

if not exist "package.json" (
    echo [LOI] Khong tim thay package.json trong thu muc: %CD%
    echo Hay dam bao ban da giai nen day du thu muc du an truoc khi chay.
    popd
    pause
    exit /b 1
)

:: 1. Tu dong tim Node.js (ke ca khi moi cai xong chua khoi dong lai may)
where node >nul 2>nul
if errorlevel 1 (
    if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
)
where node >nul 2>nul
if errorlevel 1 (
    if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
)
where node >nul 2>nul
if errorlevel 1 (
    if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"
)
where node >nul 2>nul
if errorlevel 1 (
    if defined NVM_SYMLINK if exist "%NVM_SYMLINK%\node.exe" set "PATH=%NVM_SYMLINK%;%PATH%"
)
where node >nul 2>nul
if errorlevel 1 (
    echo [LOI] May tinh chua cai dat Node.js!
    echo Vui long tai va cai dat ban Node.js LTS tai: https://nodejs.org
    echo Sau khi cai xong, hay mo lai file start.bat nay.
    echo.
    popd
    pause
    exit /b 1
)

:: 2. Tu dong cai dat thu vien neu chua co node_modules
set NEED_INSTALL=0
if not exist "node_modules\express\package.json" set NEED_INSTALL=1
if not exist "node_modules\better-sqlite3\package.json" set NEED_INSTALL=1
if not exist "node_modules\qrcode\package.json" set NEED_INSTALL=1
if "%NEED_INSTALL%"=="1" (
    echo [*] Dang cai dat thu vien cho lan chay dau tien, vui long doi...
    call npm install --omit=dev --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo [LOI] Cai dat thu vien that bai!
        echo Hay kiem tra ket noi Internet o lan cai dau tien nay roi chay lai start.bat.
        popd
        pause
        exit /b 1
    )
    echo [+] Cai dat thu vien hoan tat!
    echo.
)

:: 3. Tu dong sua loi better-sqlite3 neu copy thu muc tu may khac / khac ban Node
node -e "require('better-sqlite3')" >nul 2>nul
if errorlevel 1 (
    echo [*] Phat hien thu vien SQLite chua khop phien ban Node.js tren may nay, dang tu dong sua...
    call npm rebuild better-sqlite3 >nul 2>nul
    node -e "require('better-sqlite3')" >nul 2>nul
    if errorlevel 1 (
        call npm install --omit=dev --no-audit --no-fund
    )
)

:: 4. Nhac nhap danh sach ve neu database chua ton tai
if not exist "data\tickets.db" (
    echo [!] Chua co du lieu ve. Sau khi Server chay, bam nut "Nhap danh sach" tren
    echo     trang chinh de nhap file ve that ^(.json / .csv^), hoac chay: node import.js ^<file^>
    echo.
)

:: 5. Neu dang chay quyen Administrator, tu dong mo Firewall LAN (443, 80, 8443)
net session >nul 2>nul
if not errorlevel 1 (
    netsh advfirewall firewall show rule name="SoatVe_LAN_443" >nul 2>nul || netsh advfirewall firewall add rule name="SoatVe_LAN_443" dir=in action=allow protocol=TCP localport=443 >nul 2>nul
    netsh advfirewall firewall show rule name="SoatVe_LAN_80" >nul 2>nul || netsh advfirewall firewall add rule name="SoatVe_LAN_80" dir=in action=allow protocol=TCP localport=80 >nul 2>nul
    netsh advfirewall firewall show rule name="SoatVe_LAN_8443" >nul 2>nul || netsh advfirewall firewall add rule name="SoatVe_LAN_8443" dir=in action=allow protocol=TCP localport=8443 >nul 2>nul
)

:: 6. Khoi chay Server
echo [*] Dang khoi dong Server soat ve...
echo =====================================================================
node server.js
if errorlevel 1 (
    echo.
    echo [!] Server da dung voi loi. Vui long xem thong bao chi tiet o tren.
)

popd
pause
