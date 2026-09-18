@echo off
title HomeMate Single Launcher

cd /d "%~dp0"
set "ROOT_DIR=%cd%"

echo ================================================================
echo  HOMEMATE ALL-IN-ONE LAUNCHER
echo ================================================================

REM --- BUOC 0: GIAI PHONG TOAN BO CAC PORT CU ---
echo.
echo [0/5] Dang don dep va giai phong cac port cu (27017, 6379, 3000, 3001, 8081)...

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports = @(27017, 6379, 3000, 3001, 8081); foreach ($p in $ports) { $lines = netstat -ano 2>$null | Select-String \":$p\s\" | Select-String 'LISTENING'; foreach ($line in $lines) { $parts = ($line.ToString().Trim() -split '\s+'); $procId = $parts[-1]; if ($procId -match '^\d+$') { Stop-Process -Id [int]$procId -Force -ErrorAction SilentlyContinue } } }; Stop-Process -Name 'mongod', 'redis-server' -Force -ErrorAction SilentlyContinue" >nul 2>&1

echo   [OK] Da giai phong toan bo port cu!
echo.

REM --- BUOC 1: TAO THU MUC DU LIEU DATABASE ---
if not exist "%ROOT_DIR%\data\db" mkdir "%ROOT_DIR%\data\db"
if not exist "%ROOT_DIR%\data\log" mkdir "%ROOT_DIR%\data\log"

REM --- BUOC 2: KHOI DONG MONGODB 7.0 (PORT 27017) ---
echo [1/5] Khoi dong MongoDB 7.0 (port 27017)...
set "MONGO_BIN=%ROOT_DIR%\tools\mongodb70\mongodb-win32-x86_64-windows-7.0.18\bin\mongod.exe"
if exist "%MONGO_BIN%" (
    start "HomeMate MongoDB [27017]" "%MONGO_BIN%" --dbpath "%ROOT_DIR%\data\db" --logpath "%ROOT_DIR%\data\log\mongod.log" --port 27017 --bind_ip 127.0.0.1 --setParameter diagnosticDataCollectionEnabled=false --logappend
) else (
    start "HomeMate MongoDB [27017]" mongod --dbpath "%ROOT_DIR%\data\db" --port 27017
)
ping 127.0.0.1 -n 3 >nul

REM --- BUOC 3: KHOI DONG REDIS 5.0 (PORT 6379) ---
echo [2/5] Khoi dong Redis 5.0 (port 6379)...
set "REDIS_BIN=%ROOT_DIR%\tools\redis\redis-server.exe"
if exist "%REDIS_BIN%" (
    start "HomeMate Redis [6379]" "%REDIS_BIN%" --port 6379 --requirepass password --loglevel notice
) else (
    start "HomeMate Redis [6379]" redis-server --port 6379 --requirepass password
)
ping 127.0.0.1 -n 3 >nul

REM --- BUOC 4: KHOI DONG NESTJS API BACKEND (PORT 3000) ---
echo [3/5] Khoi dong NestJS API Backend (http://localhost:3000)...
start "HomeMate API [3000]" cmd /k "cd /d "%ROOT_DIR%\apps\api" && pnpm dev"
ping 127.0.0.1 -n 4 >nul

REM --- BUOC 5: KHOI DONG ADMIN NEXT.JS DASHBOARD (PORT 3001) ---
echo [4/5] Khoi dong Admin Dashboard (http://localhost:3001)...
start "HomeMate Admin [3001]" cmd /k "cd /d "%ROOT_DIR%\apps\admin" && pnpm dev -p 3001"
ping 127.0.0.1 -n 2 >nul

REM --- BUOC 6: KHOI DONG EXPO MOBILE METRO (PORT 8081) ---
echo [5/5] Khoi dong Expo Mobile App (http://localhost:8081)...
start "HomeMate Mobile [8081]" cmd /k "cd /d "%ROOT_DIR%\apps\mobile" && pnpm exec expo start --lan"

REM Thiet lap adb reverse neu co Android SDK / Emulator
set "ADB=C:\Users\Windows\AppData\Local\Android\Sdk\platform-tools\adb.exe"
if exist "%ADB%" (
    "%ADB%" reverse tcp:3000 tcp:3000 >nul 2>&1
    "%ADB%" reverse tcp:8081 tcp:8081 >nul 2>&1
)

echo.
echo ================================================================
echo  TAT CA 5 DICH VU DA DUOC KHOI DONG THANH CONG!
echo ================================================================
echo  * MongoDB 7.0     : localhost:27017
echo  * Redis 5.0       : localhost:6379 (pass: password)
echo  * API Backend     : http://localhost:3000/api/v1 (Swagger: /api/docs)
echo  * Admin Portal    : http://localhost:3001
echo  * Mobile Metro    : http://localhost:8081
echo ================================================================
echo.
pause
