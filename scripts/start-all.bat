@echo off
chcp 65001 >nul
title HomeMate Launcher
echo ================================================================
echo 🚀 ĐANG KHỞI ĐỘNG TOÀN BỘ HỆ THỐNG HOMEMATE
echo ================================================================

cd /d "%~dp0\.."
set ROOT_DIR=%cd%

:: 1. Tạo thư mục dữ liệu nếu chưa có
if not exist "data\db" mkdir data\db

:: 2. Khởi động MongoDB (Kiểm tra công cụ tích hợp sẵn hoặc Mongo cài trong hệ thống)
echo [1/5] Khởi động MongoDB (port 27017)...
set MONGO_BIN=tools\mongodb70\mongodb-win32-x86_64-windows-7.0.18\bin\mongod.exe
if exist "%MONGO_BIN%" (
    start "HomeMate MongoDB [27017]" "%MONGO_BIN%" --dbpath "%ROOT_DIR%\data\db" --port 27017
) else if exist "C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe" (
    start "HomeMate MongoDB [27017]" "C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe" --dbpath "%ROOT_DIR%\data\db" --port 27017
) else (
    start "HomeMate MongoDB [27017]" mongod --dbpath "%ROOT_DIR%\data\db" --port 27017
)

:: 3. Khởi động Redis (Kiểm tra công cụ tích hợp sẵn hoặc Redis trong hệ thống)
echo [2/5] Khởi động Redis (port 6379)...
set REDIS_BIN=tools\redis\redis-server.exe
if exist "%REDIS_BIN%" (
    start "HomeMate Redis [6379]" "%REDIS_BIN%" --port 6379 --requirepass password
) else (
    start "HomeMate Redis [6379]" redis-server --port 6379 --requirepass password
)

:: Đợi database sẵn sàng trong 3 giây
timeout /t 3 /nobreak >nul

:: 4. Khởi động NestJS API Backend
echo [3/5] Khởi động NestJS API (http://localhost:3000)...
start "HomeMate API [3000]" cmd /k "cd /d "%ROOT_DIR%" && pnpm --filter @homemate/api dev"

:: 5. Khởi động Admin Next.js Dashboard
echo [4/5] Khởi động Admin Dashboard (http://localhost:3001)...
start "HomeMate Admin [3001]" cmd /k "cd /d "%ROOT_DIR%" && pnpm --filter @homemate/admin dev"

:: 6. Khởi động Mobile Expo App
echo [5/5] Khởi động Mobile Expo (http://localhost:8081)...
start "HomeMate Mobile [8081]" cmd /k "cd /d "%ROOT_DIR%" && pnpm --filter @homemate/mobile dev"

echo.
echo ================================================================
echo ✅ TẤT CẢ DỊCH VỤ ĐÃ ĐƯỢC KHỞI ĐỘNG THÀNH CÔNG!
echo ================================================================
echo 📌 MongoDB Server  : localhost:27017
echo 📌 Redis Server    : localhost:6379 (password: password)
echo 📌 API Backend     : http://localhost:3000  (Swagger: http://localhost:3000/api/docs)
echo 📌 Admin Portal    : http://localhost:3001
echo 📌 Mobile Metro    : http://localhost:8081  (Quét QR Expo / chạy web / Android)
echo.
echo Để tắt toàn bộ hệ thống, hãy chạy: scripts\stop-all.bat hoặc đóng các cửa sổ.
echo ================================================================
pause
