# Smoke test for the local SkillGov desktop exe — verifies the full launch chain.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/desktop/smoke-test-local-exe.ps1
#
# What it checks:
#   1. dist/SkillGov.exe exists
#   2. Exe starts and control-panel server becomes ready on port 4280
#   3. GET /api/status returns JSON with "app": "SkillGov"
#   4. GET / returns React SPA shell (contains <div id="root">), not legacy HTML

$ErrorActionPreference = 'Stop'

$exe = 'dist/SkillGov.exe'
$port = 4280
$maxWaitSec = 30

# --- Pre-checks ---
if (-not (Test-Path $exe)) {
    Write-Error "Exe not found: $exe"
    exit 1
}

$spaIndex = 'apps/control-panel/dist/spa/index.html'
if (-not (Test-Path $spaIndex)) {
    Write-Error "SPA build artifact missing: $spaIndex"
    exit 1
}

# --- Launch exe ---
Write-Host "Starting $exe ..." -ForegroundColor Cyan
$proc = Start-Process -FilePath (Resolve-Path $exe).Path -PassThru -WindowStyle Hidden

# Ensure we clean up the process on exit
$cleanup = {
    if ($proc -and -not $proc.HasExited) {
        Write-Host 'Cleaning up exe process...' -ForegroundColor Yellow
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
}

try {
    # --- Wait for port ---
    Write-Host "Waiting for port $port (max ${maxWaitSec}s)..." -ForegroundColor Cyan
    $deadline = (Get-Date).AddSeconds($maxWaitSec)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $tcp.Connect('127.0.0.1', $port)
            $tcp.Close()
            $ready = $true
            break
        } catch {
            Start-Sleep -Milliseconds 300
        }
    }

    if (-not $ready) {
        Write-Error "Port $port did not become ready within ${maxWaitSec}s."
        exit 1
    }
    Write-Host "Port $port is open." -ForegroundColor Green

    # --- Check /api/status ---
    Write-Host 'Checking /api/status ...' -ForegroundColor Cyan
    $statusResp = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/status" -TimeoutSec 10
    if ($statusResp.app -ne 'SkillGov') {
        Write-Error "Expected app='SkillGov', got: $($statusResp.app)"
        exit 1
    }
    Write-Host '/api/status OK: app=SkillGov' -ForegroundColor Green

    # --- Check / serves React SPA ---
    Write-Host 'Checking / serves React SPA ...' -ForegroundColor Cyan
    $html = & curl.exe -s -m 10 "http://127.0.0.1:$port/"
    if ($html -match '<div id="root">') {
        Write-Host '/ serves React SPA (<div id="root"> found).' -ForegroundColor Green
    } elseif ($html -match 'data-i18n') {
        Write-Error '/ is serving legacy HTML fallback, not React SPA.'
        exit 1
    } else {
        Write-Error '/ response does not contain expected SPA markers.'
        exit 1
    }

    Write-Host ''
    Write-Host 'Smoke test passed!' -ForegroundColor Green
} finally {
    & $cleanup
}
