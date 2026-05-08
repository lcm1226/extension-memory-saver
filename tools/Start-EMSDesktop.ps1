param(
  [switch]$NoBuild
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$project = Join-Path $repoRoot "ems-desktop\EmsDesktop.csproj"

if (-not $NoBuild) {
  & dotnet build $project
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

& dotnet run --project $project
exit $LASTEXITCODE
