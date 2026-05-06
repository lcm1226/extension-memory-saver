param(
  [string]$ExtensionDir = "$PSScriptRoot\..\ems-extension",
  [string]$OutDir = "$PSScriptRoot\..\dist"
)

$ErrorActionPreference = "Stop"
$resolvedExtensionDir = [System.IO.Path]::GetFullPath($ExtensionDir)
$resolvedOutDir = [System.IO.Path]::GetFullPath($OutDir)
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))

function Test-IsInsideRepo([string]$Path) {
  $root = $repoRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
  $rootWithSeparator = "$root$([System.IO.Path]::DirectorySeparatorChar)"
  return $Path.Equals($root, [System.StringComparison]::OrdinalIgnoreCase) -or
    $Path.StartsWith($rootWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)
}

if (-not (Test-IsInsideRepo $resolvedExtensionDir)) {
  throw "ExtensionDir must stay inside the repo: $resolvedExtensionDir"
}
if (-not (Test-IsInsideRepo $resolvedOutDir)) {
  throw "OutDir must stay inside the repo: $resolvedOutDir"
}
if (-not (Test-Path (Join-Path $resolvedExtensionDir "manifest.json"))) {
  throw "manifest.json not found in $resolvedExtensionDir"
}

$manifest = Get-Content (Join-Path $resolvedExtensionDir "manifest.json") -Raw | ConvertFrom-Json
$nameSlug = ($manifest.name.ToLowerInvariant() -replace "[^a-z0-9]+", "-").Trim("-")
$version = $manifest.version
$stagingDir = Join-Path $resolvedOutDir "$nameSlug-$version"
$zipPath = Join-Path $resolvedOutDir "$nameSlug-$version.zip"

New-Item -ItemType Directory -Force -Path $resolvedOutDir | Out-Null
if (Test-Path $stagingDir) {
  Remove-Item -LiteralPath $stagingDir -Recurse -Force
}
if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null
Copy-Item -Path (Join-Path $resolvedExtensionDir "*") -Destination $stagingDir -Recurse -Force
Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $zipPath -Force

[pscustomobject]@{
  Name = $manifest.name
  Version = $version
  StagingDir = $stagingDir
  ZipPath = $zipPath
} | Format-List
