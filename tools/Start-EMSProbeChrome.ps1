param(
  [string]$ChromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe",
  [string]$ProfileDir = "$PSScriptRoot\chrome-probe-profile",
  [int]$Port = 9222,
  [string]$Url = "about:blank"
)

$resolvedProfileDir = [System.IO.Path]::GetFullPath($ProfileDir)
New-Item -ItemType Directory -Force -Path $resolvedProfileDir | Out-Null

if (-not (Test-Path $ChromePath)) {
  throw "Chrome not found at: $ChromePath"
}

$arguments = @(
  "--remote-debugging-port=$Port",
  "--user-data-dir=""$resolvedProfileDir""",
  $Url
)

$process = Start-Process -FilePath $ChromePath -ArgumentList $arguments -PassThru
Start-Sleep -Seconds 3

[pscustomobject]@{
  ChromePath = $ChromePath
  ProfileDir = $resolvedProfileDir
  Port = $Port
  ProcessId = $process.Id
  Url = $Url
} | Format-List
