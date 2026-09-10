# PowerShell script khởi động toàn bộ dịch vụ HomeMate
$root = Resolve-Path "$PSScriptRoot\.."
Set-Location $root

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "🚀 ĐANG KHỞI ĐỘNG TOÀN BỘ HỆ THỐNG HOMEMATE" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Cyan

# 1. Tạo thư mục dữ liệu nếu chưa có
if (-not (Test-Path "data\db")) {
    New-Item -ItemType Directory -Path "data\db" -Force | Out-Null
}

# 2. Khởi động MongoDB
Write-Host "[1/5] Khởi động MongoDB (port 27017)..." -ForegroundColor Yellow
Start-Process -FilePath "$root\tools\mongodb70\mongodb-win32-x86_64-windows-7.0.18\bin\mongod.exe" -ArgumentList "--dbpath `"$root\data\db`" --port 27017" -WindowStyle Normal

# 3. Khởi động Redis
Write-Host "[2/5] Khởi động Redis (port 6379)..." -ForegroundColor Yellow
Start-Process -FilePath "$root\tools\redis\redis-server.exe" -ArgumentList "--port 6379 --requirepass password" -WindowStyle Normal

Start-Sleep -Seconds 3

# 4. Khởi động API
Write-Host "[3/5] Khởi động NestJS API (http://localhost:3000)..." -ForegroundColor Yellow
Start-Process -FilePath "cmd.exe" -ArgumentList "/k cd /d `"$root`" && pnpm --filter @homemate/api dev" -WindowStyle Normal

# 5. Khởi động Admin Dashboard
Write-Host "[4/5] Khởi động Admin Dashboard (http://localhost:3001)..." -ForegroundColor Yellow
Start-Process -FilePath "cmd.exe" -ArgumentList "/k cd /d `"$root`" && pnpm --filter @homemate/admin dev" -WindowStyle Normal

# 6. Khởi động Mobile App
Write-Host "[5/5] Khởi động Expo Mobile App (http://localhost:8081)..." -ForegroundColor Yellow
Start-Process -FilePath "cmd.exe" -ArgumentList "/k cd /d `"$root`" && pnpm --filter @homemate/mobile dev" -WindowStyle Normal

Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "✅ TẤT CẢ DỊCH VỤ ĐÃ ĐƯỢC KHỞI ĐỘNG!" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  - MongoDB Server : localhost:27017"
Write-Host "  - Redis Server   : localhost:6379"
Write-Host "  - API Backend    : http://localhost:3000 (Swagger: /api/docs)"
Write-Host "  - Admin Portal   : http://localhost:3001"
Write-Host "  - Mobile Metro   : http://localhost:8081"
Write-Host "===================================================" -ForegroundColor Cyan
