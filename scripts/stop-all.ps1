# PowerShell script dừng toàn bộ dịch vụ HomeMate
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "🛑 ĐANG DỪNG TOÀN BỘ HỆ THỐNG HOMEMATE" -ForegroundColor Red
Write-Host "===================================================" -ForegroundColor Cyan

$ports = @(27017, 6379, 3000, 3001, 8081)
foreach ($port in $ports) {
    $lines = netstat -ano 2>$null | Select-String ":$port\s" | Select-String "LISTENING"
    foreach ($line in $lines) {
        $parts = ($line.ToString().Trim() -split '\s+')
        $procId = $parts[-1]
        if ($procId -match '^\d+$') {
            Write-Host "  -> Đang dừng tiến trình port $port (PID: $procId)..." -ForegroundColor Yellow
            Stop-Process -Id [int]$procId -Force -ErrorAction SilentlyContinue
        }
    }
}

Stop-Process -Name "mongod", "redis-server" -Force -ErrorAction SilentlyContinue

Write-Host "`n✅ ĐÃ DỪNG TOÀN BỘ CÁC DỊCH VỤ THÀNH CÔNG!" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Cyan
