@echo off
chcp 65001 >nul
title HE THONG SOAT VE - HUNG VUONG CONCERT: GAME ON

echo =====================================================================
echo  HỆ THỐNG SOÁT VÉ OFFLINE - HÙNG VƯƠNG CONCERT: GAME ON
echo =====================================================================
echo.

:: 1. Kiem tra Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [LOI] May tinh chua cai dat Node.js!
    echo Vui long tai va cai dat Node.js LTS tu: https://nodejs.org
    echo Sau khi cai xong, mo lai file nay.
    echo.
    pause
    exit /b 1
)

:: 2. Tu dong cai dat thu vien neu chua co node_modules
if not exist "node_modules\" (
    echo [*] Dang cai dat thu vien lan dau (vui long doi 30 giay)...
    call npm install --omit=dev
    if %errorlevel% neq 0 (
        echo [LOI] Cai dat thu vien that bai! Vui long kiem tra ket noi mang.
        pause
        exit /b 1
    )
    echo [+] Cai dat thu vien hoan tat!
    echo.
)

:: 3. Nhap du lieu ve mau neu database chua ton tai
if not exist "data\tickets.db" (
    if exist "tickets_sample.json" (
        echo [*] Dang khoi tao CSDL tu tickets_sample.json...
        call node import.js tickets_sample.json
        echo.
    )
)

:: 4. Khoi chay Server
echo [*] Dang khoi dong Server soat ve...
echo =====================================================================
node server.js

pause
