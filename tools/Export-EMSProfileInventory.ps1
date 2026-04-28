param(
  [Parameter(Mandatory = $true)]
  [string]$ProfileDir,

  [string]$Out
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$MeasureCli = Join-Path $PSScriptRoot 'ems-measure.mjs'

if (-not (Test-Path -LiteralPath $ProfileDir -PathType Container)) {
  throw "Chrome profile directory not found: $ProfileDir"
}

if (-not (Test-Path -LiteralPath $MeasureCli -PathType Leaf)) {
  throw "Measurement CLI not found: $MeasureCli"
}

if (-not $Out) {
  $Out = Join-Path $RepoRoot 'test-results\profile-inventory.json'
}

$OutParent = Split-Path -Parent $Out
if ($OutParent -and -not (Test-Path -LiteralPath $OutParent -PathType Container)) {
  New-Item -ItemType Directory -Path $OutParent | Out-Null
}

node $MeasureCli profile-inventory --profile-dir $ProfileDir --out $Out

Write-Host ''
Write-Host "Profile inventory written to: $Out"
Write-Host 'Next: open the EMS popup in the same test profile, click Import JSON, and select this file.'
