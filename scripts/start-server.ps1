$ErrorActionPreference = "Stop"

try {
  $repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
  Set-Location -LiteralPath $repoRoot

  Write-Host "==> Starting backend with DB migration..." -ForegroundColor Cyan

  $serverDir = "apps/server"
  $envFile = Join-Path $serverDir ".env"

  if (-not (Test-Path -LiteralPath $envFile)) {
    throw "apps/server/.env not found. Please create it from apps/server/.env.example first."
  }

  Write-Host "==> Running Prisma migrate..." -ForegroundColor Yellow
  npm run prisma:migrate -w apps/server
  if (-not $?) { throw "Prisma migrate failed." }

  Write-Host "==> Generating Prisma client..." -ForegroundColor Yellow
  npm run prisma:generate -w apps/server
  if (-not $?) { throw "Prisma generate failed." }

  Write-Host "==> Starting backend dev server..." -ForegroundColor Green
  npm run dev:server
}
catch {
  Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Press Enter to close..." -ForegroundColor Yellow
  Read-Host
  exit 1
}
