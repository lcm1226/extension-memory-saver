param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64",
    [switch]$NoZip
)

$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
    $dir = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
    while ($dir) {
        if (Test-Path -LiteralPath (Join-Path $dir "ems-desktop\EmsDesktop.csproj")) {
            return $dir
        }
        $parent = Split-Path -Parent $dir
        if ($parent -eq $dir) { break }
        $dir = $parent
    }
    throw "Could not find repo root."
}

function Assert-UnderPath {
    param([string]$Child, [string]$Parent)
    $childFull = [System.IO.Path]::GetFullPath($Child)
    $parentFull = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
    if (-not $childFull.StartsWith($parentFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to operate outside parent path. Child=$childFull Parent=$parentFull"
    }
}

$repoRoot = Resolve-RepoRoot
$distRoot = Join-Path $repoRoot "dist"
$portableRoot = Join-Path $distRoot "EMS-Desktop-Portable"
$projectPath = Join-Path $repoRoot "ems-desktop\EmsDesktop.csproj"
$publishRoot = Join-Path $portableRoot "app"

Assert-UnderPath -Child $portableRoot -Parent $repoRoot
Assert-UnderPath -Child $publishRoot -Parent $repoRoot

if (Test-Path -LiteralPath $portableRoot) {
    Remove-Item -LiteralPath $portableRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $publishRoot | Out-Null

& dotnet publish $projectPath `
    -c $Configuration `
    -r $Runtime `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:EnableCompressionInSingleFile=true `
    -o $publishRoot

$toolsRoot = Join-Path $portableRoot "tools"
$docsRoot = Join-Path $portableRoot "docs"
$nodeRoot = Join-Path $portableRoot "runtime\node"
New-Item -ItemType Directory -Force -Path $toolsRoot, $docsRoot, $nodeRoot | Out-Null

$toolFiles = @(
    "ems-desktop-engine.mjs",
    "ems-measure.mjs",
    "Start-EMSDesktopProbeChrome.ps1"
)
foreach ($file in $toolFiles) {
    Copy-Item -LiteralPath (Join-Path $repoRoot "tools\$file") -Destination (Join-Path $toolsRoot $file) -Force
}

$docFiles = @(
    "EMS_DESKTOP_HOW_TO_USE.ko.md",
    "EMS_DESKTOP_HOW_TO_USE.en.md",
    "EMS_DESKTOP_PIVOT_ROADMAP.md"
)
foreach ($file in $docFiles) {
    Copy-Item -LiteralPath (Join-Path $repoRoot "docs\$file") -Destination (Join-Path $docsRoot $file) -Force
}

$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
Copy-Item -LiteralPath $nodeExe -Destination (Join-Path $nodeRoot "node.exe") -Force

$cmd = @'
@echo off
setlocal
cd /d "%~dp0app"
start "EMS Desktop" "%~dp0app\EmsDesktop.exe"
'@
Set-Content -LiteralPath (Join-Path $portableRoot "Start EMS Desktop.cmd") -Value $cmd -Encoding ASCII

$readme = @'
EMS Desktop Portable
====================

Start:
  Double-click "Start EMS Desktop.cmd".

What is included:
  app\EmsDesktop.exe
  tools\ems-desktop-engine.mjs
  tools\ems-measure.mjs
  tools\Start-EMSDesktopProbeChrome.ps1
  runtime\node\node.exe

How to test:
  1. Launch EMS Desktop.
  2. Click "Launch Probe Chrome".
  3. Install or enable the extensions you want in the probe Chrome profile.
  4. Open the target page in that probe Chrome.
  5. Click "Refresh Browsers" in EMS Desktop.

Notes:
  EMS clones the selected probe profile before measuring.
  It does not mutate the live selected profile.
  Values are approximate A/B measured deltas, not exact memory ownership.
'@
Set-Content -LiteralPath (Join-Path $portableRoot "README-PORTABLE.txt") -Value $readme -Encoding UTF8

if (-not $NoZip) {
    $zipPath = Join-Path $distRoot "EMS-Desktop-Portable.zip"
    Assert-UnderPath -Child $zipPath -Parent $repoRoot
    if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
    Compress-Archive -Path (Join-Path $portableRoot "*") -DestinationPath $zipPath -Force
}

Write-Host "Portable build created: $portableRoot"
if (-not $NoZip) { Write-Host "Portable zip created: $zipPath" }

