# Build a local desktop exe for SkillGov — runs tests, compiles release, copies to dist/SkillGov.exe.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/desktop/build-local-exe.ps1

$ErrorActionPreference = 'Stop'

# 1. Verify we are in the SkillGov project root
if (-not (Test-Path 'package.json') -or -not (Test-Path 'apps/desktop/src-tauri/Cargo.toml')) {
    Write-Error 'Run this script from the SkillGov project root (D:\SkillGov).'
    exit 1
}

# 2. Run Rust tests
Write-Host 'Running desktop tests...' -ForegroundColor Cyan
corepack pnpm --filter @skillgov/desktop test
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Desktop tests failed.'
    exit 1
}

# 3. Build release exe
Write-Host 'Building release exe...' -ForegroundColor Cyan
corepack pnpm --filter @skillgov/desktop build
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Release build failed.'
    exit 1
}

# 4. Copy exe to dist/
$src = 'apps/desktop/src-tauri/target/release/skillgov-desktop.exe'
$destDir = 'dist'
$dest = Join-Path $destDir 'SkillGov.exe'

if (-not (Test-Path $src)) {
    Write-Error "Build output not found: $src"
    exit 1
}

New-Item -ItemType Directory -Force -Path $destDir | Out-Null
Copy-Item $src $dest -Force

Write-Host ''
Write-Host "Done! Desktop exe ready at:" -ForegroundColor Green
Write-Host "  $((Resolve-Path $dest).Path)" -ForegroundColor Yellow
Write-Host ''
Write-Host 'Double-click SkillGov.exe to launch the desktop shell.' -ForegroundColor Green
