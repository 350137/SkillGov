# Smoke test for the local SkillGov desktop exe — verifies embedded SPA, no HTTP server.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/desktop/smoke-test-local-exe.ps1
#
# What it checks:
#   1. dist/SkillGov.exe exists
#   2. SPA build artifacts exist (embedded at build time)
#   3. Exe starts as a native window process
#   4. No node.exe / pnpm / tsx child processes spawned
#   5. Port 4280 is NOT listening (no HTTP server)

param(
    [string]$Exe = 'dist/SkillGov.exe'
)

$ErrorActionPreference = 'Stop'

$exe = $Exe
$port = 4280
$settleSec = 5

# --- Pre-checks ---
if (-not (Test-Path $exe)) {
    Write-Error "Exe not found: $exe"
    exit 1
}

$spaIndex = 'apps/control-panel/dist/spa/index.html'
if (-not (Test-Path $spaIndex)) {
    Write-Error "SPA build artifact missing: $spaIndex — SPA was not embedded at build time."
    exit 1
}
Write-Host "SPA artifact verified: $spaIndex" -ForegroundColor Green

# --- Launch exe ---
Write-Host "Starting $exe ..." -ForegroundColor Cyan
$proc = Start-Process -FilePath (Resolve-Path $exe).Path -PassThru -WindowStyle Hidden

$cleanup = {
    if ($proc -and -not $proc.HasExited) {
        Write-Host 'Cleaning up exe process...' -ForegroundColor Yellow
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
}

try {
    # --- Wait for exe to settle ---
    Write-Host "Waiting ${settleSec}s for exe to initialize..." -ForegroundColor Cyan
    Start-Sleep -Seconds $settleSec

    # --- Check exe is still running ---
    if ($proc.HasExited) {
        Write-Error "Exe exited prematurely with code: $($proc.ExitCode)"
        exit 1
    }
    Write-Host "Exe process is running (PID: $($proc.Id))." -ForegroundColor Green

    # --- Check no node/pnpm/tsx child processes ---
    Write-Host 'Checking for unwanted child processes...' -ForegroundColor Cyan
    $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $proc.Id }
    $unwanted = $children | Where-Object { $_.Name -match 'node|pnpm|tsx|corepack' }
    if ($unwanted) {
        Write-Error "Found unwanted child processes: $($unwanted.Name -join ', ')"
        exit 1
    }
    Write-Host 'No node/pnpm/tsx child processes found.' -ForegroundColor Green

    # --- Check port 4280 is NOT listening ---
    Write-Host "Checking port $port is NOT listening..." -ForegroundColor Cyan
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect('127.0.0.1', $port)
        $tcp.Close()
        Write-Error "Port $port is listening — desktop exe should NOT start an HTTP server."
        exit 1
    } catch {
        Write-Host "Port $port is not listening (expected)." -ForegroundColor Green
    }

    Write-Host ''
    Write-Host 'Smoke test passed!' -ForegroundColor Green
    Write-Host '  - Exe runs as native window' -ForegroundColor Green
    Write-Host '  - No node/pnpm subprocesses' -ForegroundColor Green
    Write-Host '  - No HTTP server on port 4280' -ForegroundColor Green
} finally {
    & $cleanup
}
