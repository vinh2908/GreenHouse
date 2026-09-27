# PowerShell script khoi dong toan bo dich vu HomeMate
$root = "C:\HomeMate"
Set-Location $root

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "KHOI DONG DICH VU GREEN HOUSE" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Cyan

# Check ports
$ports = @(27017, 6379, 3000, 3001, 8081)
foreach ($port in $ports) {
    $lines = netstat -ano 2>$null | Select-String ":$port\s" | Select-String "LISTENING"
    foreach ($line in $lines) {
        $parts = ($line.ToString().Trim() -split '\s+')
        $procId = $parts[-1]
        if ($procId -match '^\d+$') {
            Stop-Process -Id [int]$procId -Force -ErrorAction SilentlyContinue
        }
    }
}
Stop-Process -Name "mongod", "redis-server" -Force -ErrorAction SilentlyContinue

if (-not (Test-Path "data\db")) {
    New-Item -ItemType Directory -Path "data\db" -Force | Out-Null
}
if (-not (Test-Path "data\log")) {
    New-Item -ItemType Directory -Path "data\log" -Force | Out-Null
}

# 1. MongoDB
Write-Host "[1/4] Starting MongoDB (port 27017)..." -ForegroundColor Yellow
$mongoBin = "$root\tools\mongodb70\mongodb-win32-x86_64-windows-7.0.18\bin\mongod.exe"
if (Test-Path $mongoBin) {
    Start-Process -FilePath $mongoBin -ArgumentList "--dbpath `"$root\data\db`" --logpath `"$root\data\log\mongod.log`" --port 27017 --bind_ip 127.0.0.1 --setParameter diagnosticDataCollectionEnabled=false --logappend" -WindowStyle Hidden
} else {
    Start-Process -FilePath "mongod.exe" -ArgumentList "--dbpath `"$root\data\db`" --port 27017" -WindowStyle Hidden
}

# 2. Redis
Write-Host "[2/4] Starting Redis (port 6379)..." -ForegroundColor Yellow
$redisBin = "$root\tools\redis\redis-server.exe"
if (Test-Path $redisBin) {
    Start-Process -FilePath $redisBin -ArgumentList "--port 6379 --requirepass password --loglevel notice" -WindowStyle Hidden
} else {
    Start-Process -FilePath "redis-server.exe" -ArgumentList "--port 6379 --requirepass password" -WindowStyle Hidden
}

Start-Sleep -Seconds 2

# 3. API
Write-Host "[3/4] Starting API (port 3000)..." -ForegroundColor Yellow
Start-Process -FilePath "cmd.exe" -ArgumentList "/k title Green House API && cd /d `"$root\apps\api`" && pnpm dev"

# 4. Mobile
Write-Host "[4/4] Starting Mobile Metro (port 8081)..." -ForegroundColor Yellow
Start-Process -FilePath "cmd.exe" -ArgumentList "/k title Green House Mobile && cd /d `"$root\apps\mobile`" && pnpm exec expo start --lan"

# ADB reverse
$adb = "C:\Users\Windows\AppData\Local\Android\Sdk\platform-tools\adb.exe"
if (Test-Path $adb) {
    & $adb reverse tcp:3000 tcp:3000 2>$null | Out-Null
    & $adb reverse tcp:8081 tcp:8081 2>$null | Out-Null
}

Write-Host "Services started!" -ForegroundColor Green
