param(
  [string]$ChromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe",
  [string]$UserDataDir = "",
  [string]$ProfileDirectory = "Default",
  [int]$Port = 9222,
  [string]$Url = "https://www.youtube.com/"
)

$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($UserDataDir)) {
  $UserDataDir = Join-Path $repoRoot ".tmp\ems-desktop-probe-user-data"
}

$resolvedUserDataDir = [System.IO.Path]::GetFullPath($UserDataDir)
New-Item -ItemType Directory -Force -Path $resolvedUserDataDir | Out-Null

if (-not (Test-Path -LiteralPath $ChromePath)) {
  $x86Path = Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"
  if (Test-Path -LiteralPath $x86Path) {
    $ChromePath = $x86Path
  } else {
    throw "Chrome not found. Pass -ChromePath explicitly."
  }
}

$arguments = @(
  "--remote-debugging-port=$Port",
  "--user-data-dir=`"$resolvedUserDataDir`"",
  "--profile-directory=`"$ProfileDirectory`"",
  "--no-first-run",
  "--no-default-browser-check",
  $Url
)

$process = Start-Process -FilePath $ChromePath -ArgumentList $arguments -PassThru
Start-Sleep -Seconds 3

[pscustomobject]@{
  ChromePath = $ChromePath
  UserDataDir = $resolvedUserDataDir
  ProfileDirectory = $ProfileDirectory
  Port = $Port
  ProcessId = $process.Id
  Url = $Url
  Note = "EMS Desktop can discover this browser with npm run desktop:list or the app Refresh Browsers button."
} | Format-List
