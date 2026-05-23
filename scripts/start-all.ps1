$ErrorActionPreference = "Stop"

Write-Host "==> Starting backend in new PowerShell..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "scripts/start-server.ps1"

Write-Host "==> Starting frontend in current window..." -ForegroundColor Green
powershell -NoExit -ExecutionPolicy Bypass -File "scripts/start-web.ps1"
