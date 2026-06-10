# Build a local desktop exe for SkillGov; it tests, builds, compiles, and copies the release artifact.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/desktop/build-local-exe.ps1

$ErrorActionPreference = 'Stop'

# 1. Verify we are in the SkillGov project root
if (-not (Test-Path 'package.json') -or -not (Test-Path 'apps/desktop/src-tauri/Cargo.toml')) {
    Write-Error 'Run this script from the SkillGov project root (D:\SkillGov).'
    exit 1
}

# 2. Run control-panel tests (also builds SPA)
Write-Host 'Running control-panel tests...' -ForegroundColor Cyan
corepack pnpm --filter @skillgov/control-panel test
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Control-panel tests failed.'
    exit 1
}

# 3. Verify SPA build artifacts exist
$spaIndex = 'apps/control-panel/dist/spa/index.html'
$spaAssets = 'apps/control-panel/dist/spa/assets'
if (-not (Test-Path $spaIndex)) {
    Write-Error "SPA build artifact missing: $spaIndex"
    exit 1
}
if (-not (Test-Path $spaAssets)) {
    Write-Error "SPA assets directory missing: $spaAssets"
    exit 1
}
Write-Host 'SPA build artifacts verified.' -ForegroundColor Green

# 4. Run desktop Rust tests
Write-Host 'Running desktop tests...' -ForegroundColor Cyan
corepack pnpm --filter @skillgov/desktop test
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Desktop tests failed.'
    exit 1
}

# 5. Build release exe
Write-Host 'Building release exe...' -ForegroundColor Cyan
corepack pnpm --filter @skillgov/desktop build
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Release build failed.'
    exit 1
}

# 6. Copy exe to dist/
$src = 'apps/desktop/src-tauri/target/release/skillgov-desktop.exe'
$destDir = 'dist'
$dest = Join-Path $destDir 'SkillGov.exe'
$fallbackDest = Join-Path $destDir 'SkillGov-fixed.exe'

if (-not (Test-Path $src)) {
    Write-Error "Build output not found: $src"
    exit 1
}

New-Item -ItemType Directory -Force -Path $destDir | Out-Null
$outputExe = $dest
try {
    Copy-Item $src $dest -Force
} catch {
    $isIoException = $_.Exception -is [System.IO.IOException] -or $_.Exception.InnerException -is [System.IO.IOException]
    if (-not $isIoException) {
        throw
    }
    Write-Warning "Could not overwrite $dest because it is probably still running."
    Write-Warning "Writing the new build to $fallbackDest instead."
    Copy-Item $src $fallbackDest -Force
    $outputExe = $fallbackDest
}

# 7. Smoke test the exe
Write-Host 'Running smoke test...' -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File scripts/desktop/smoke-test-local-exe.ps1 -Exe $outputExe
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Smoke test failed.'
    exit 1
}

Write-Host ''
Write-Host "Done! Desktop exe ready at:" -ForegroundColor Green
Write-Host "  $((Resolve-Path $outputExe).Path)" -ForegroundColor Yellow
if ($outputExe -ne $dest) {
    Write-Host ''
    Write-Host "Close the old SkillGov window, then copy $fallbackDest over $dest when ready." -ForegroundColor Yellow
}
Write-Host ''
Write-Host "Double-click $(Split-Path $outputExe -Leaf) to launch the desktop shell." -ForegroundColor Green
