# PowerShell script khởi động toàn bộ dịch vụ HomeMate
$root = Resolve-Path "$PSScriptRoot\.."
Set-Location $root

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "🚀 ĐANG KHỞI ĐỘNG TOÀN BỘ HỆ THỐNG HOMEMATE" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Cyan

# ── 0. Dọn dẹp các port và tiến trình cũ ─────────────────────────────────────
Write-Host "`n[0/5] Đang kiểm tra và giải phóng các port cũ..." -ForegroundColor Yellow

$ports = @(27017, 6379, 3000, 3001, 8081)
foreach ($port in $ports) {
    $lines = netstat -ano 2>$null | Select-String ":$port\s" | Select-String "LISTENING"
    foreach ($line in $lines) {
        $parts = ($line.ToString().Trim() -split '\s+')
        $procId = $parts[-1]
        if ($procId -match '^\d+$') {
            Write-Host "  -> Đang dừng tiến trình chiếm port $port (PID: $procId)..." -ForegroundColor DarkYellow
            Stop-Process -Id [int]$procId -Force -ErrorAction SilentlyContinue
        }
    }
}

# Dừng theo tên tiến trình nếu còn sót
Stop-Process -Name "mongod", "redis-server" -Force -ErrorAction SilentlyContinue

Write-Host "  ✅ Đã giải phóng toàn bộ port thành công!`n" -ForegroundColor Green

# ── 1. Tạo thư mục dữ liệu nếu chưa có ──────────────────────────────────────
if (-not (Test-Path "data\db")) {
    New-Item -ItemType Directory -Path "data\db" -Force | Out-Null
}
if (-not (Test-Path "data\log")) {
    New-Item -ItemType Directory -Path "data\log" -Force | Out-Null
}

# ── 2. Khởi động MongoDB 7.0 (Port 27017) ───────────────────────────────────
Write-Host "[1/5] Khởi động MongoDB (port 27017)..." -ForegroundColor Yellow
$mongoBin = "$root\tools\mongodb70\mongodb-win32-x86_64-windows-7.0.18\bin\mongod.exe"
if (Test-Path $mongoBin) {
    Start-Process -FilePath $mongoBin -ArgumentList "--dbpath `"$root\data\db`" --logpath `"$root\data\log\mongod.log`" --port 27017 --bind_ip 127.0.0.1 --setParameter diagnosticDataCollectionEnabled=false --logappend" -WindowStyle Normal
} else {
    Start-Process -FilePath "mongod.exe" -ArgumentList "--dbpath `"$root\data\db`" --port 27017" -WindowStyle Normal
}

# ── 3. Khởi động Redis 5.0 (Port 6379) ───────────────────────────────────────
Write-Host "[2/5] Khởi động Redis (port 6379)..." -ForegroundColor Yellow
$redisBin = "$root\tools\redis\redis-server.exe"
if (Test-Path $redisBin) {
    Start-Process -FilePath $redisBin -ArgumentList "--port 6379 --requirepass password --loglevel notice" -WindowStyle Normal
} else {
    Start-Process -FilePath "redis-server.exe" -ArgumentList "--port 6379 --requirepass password" -WindowStyle Normal
}

Start-Sleep -Seconds 3

# ── 4. Khởi động NestJS API Backend (Port 3000) ──────────────────────────────
Write-Host "[3/5] Khởi động NestJS API (http://localhost:3000)..." -ForegroundColor Yellow
Start-Process -FilePath "cmd.exe" -ArgumentList "/k cd /d `"$root\apps\api`" && pnpm dev" -WindowStyle Normal

# ── 5. Khởi động Admin Dashboard (Port 3001) ─────────────────────────────────
Write-Host "[4/5] Khởi động Admin Dashboard (http://localhost:3001)..." -ForegroundColor Yellow
Start-Process -FilePath "cmd.exe" -ArgumentList "/k cd /d `"$root\apps\admin`" && pnpm dev -p 3001" -WindowStyle Normal

# ── 6. Khởi động Mobile App Metro (Port 8081) ────────────────────────────────
Write-Host "[5/5] Khởi động Expo Mobile App (http://localhost:8081)..." -ForegroundColor Yellow
Start-Process -FilePath "cmd.exe" -ArgumentList "/k cd /d `"$root\apps\mobile`" && pnpm exec expo start --lan" -WindowStyle Normal

# Thiết lập adb reverse nếu có máy ảo Android
$adb = "C:\Users\Windows\AppData\Local\Android\Sdk\platform-tools\adb.exe"
if (Test-Path $adb) {
    & $adb reverse tcp:3000 tcp:3000 2>$null | Out-Null
    & $adb reverse tcp:8081 tcp:8081 2>$null | Out-Null
}

Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "✅ TẤT CẢ DỊCH VỤ ĐÃ ĐƯỢC KHỞI ĐỘNG!" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  📌 MongoDB Server : localhost:27017"
Write-Host "  📌 Redis Server   : localhost:6379 (password: password)"
Write-Host "  📌 API Backend    : http://localhost:3000/api/v1 (Swagger: /api/docs)"
Write-Host "  📌 Admin Portal   : http://localhost:3001"
Write-Host "  📌 Mobile Metro   : http://localhost:8081"
Write-Host "===================================================" -ForegroundColor Cyan
