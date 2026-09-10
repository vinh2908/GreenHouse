@echo off
chcp 65001 >nul
echo ===================================================
echo 🚀 ĐANG KHỞI ĐỘNG TOÀN BỘ HỆ THỐNG HOMEMATE
echo ===================================================

cd /d "%~dp0\.."

:: 1. Tạo thư mục dữ liệu nếu chưa có
if not exist "data\db" mkdir data\db

:: 2. Khởi động MongoDB
echo [1/5] Khởi động MongoDB (port 27017)...
start "HomeMate MongoDB [27017]" "tools\mongodb70\mongodb-win32-x86_64-windows-7.0.18\bin\mongod.exe" --dbpath "%cd%\data\db" --port 27017

:: 3. Khởi động Redis
echo [2/5] Khởi động Redis (port 6379)...
start "HomeMate Redis [6379]" "tools\redis\redis-server.exe" --port 6379 --requirepass password

:: Đợi database sẵn sàng trong 3 giây
timeout /t 3 /nobreak >nul

:: 4. Khởi động API Server
echo [3/5] Khởi động NestJS API (http://localhost:3000)...
start "HomeMate API [3000]" cmd /k "pnpm --filter @homemate/api dev"

:: 5. Khởi động Admin Dashboard
echo [4/5] Khởi động Admin Dashboard (http://localhost:3001)...
start "HomeMate Admin [3001]" cmd /k "pnpm --filter @homemate/admin dev"

:: 6. Khởi động Mobile App
echo [5/5] Khởi động Expo Mobile App (http://localhost:8081)...
start "HomeMate Mobile [8081]" cmd /k "pnpm --filter @homemate/mobile dev"

echo.
echo ===================================================
echo ✅ TẤT CẢ DỊCH VỤ ĐÃ ĐƯỢC KHỞI ĐỘNG THÀNH CÔNG!
echo ===================================================
echo - MongoDB Server : localhost:27017
echo - Redis Server   : localhost:6379
echo - API Backend    : http://localhost:3000 (Swagger: /api/docs)
echo - Admin Portal   : http://localhost:3001
echo - Mobile Metro   : http://localhost:8081
echo ===================================================
echo.
