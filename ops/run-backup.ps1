param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectPath,

  [Parameter(Mandatory = $true)]
  [string]$BackupDirectory
)

$ErrorActionPreference = 'Stop'
$project = [System.IO.Path]::GetFullPath($ProjectPath)
$destination = [System.IO.Path]::GetFullPath($BackupDirectory)

if (-not (Test-Path -LiteralPath (Join-Path $project 'package.json'))) {
  throw 'ProjectPath nu indică proiectul CRM.'
}
$projectPrefix = $project.TrimEnd(
  [System.IO.Path]::DirectorySeparatorChar,
  [System.IO.Path]::AltDirectorySeparatorChar
) + [System.IO.Path]::DirectorySeparatorChar
if (
  $destination.Equals($project, [System.StringComparison]::OrdinalIgnoreCase) -or
  $destination.StartsWith($projectPrefix, [System.StringComparison]::OrdinalIgnoreCase)
) {
  throw 'BackupDirectory trebuie să fie în afara proiectului.'
}

New-Item -ItemType Directory -Path $destination -Force | Out-Null
$logPath = Join-Path $destination 'backup-run.log'
$startedAt = Get-Date

Push-Location $project
try {
  $output = & npm.cmd run backup:create -- "--directory=$destination" 2>&1
  $exitCode = $LASTEXITCODE
  $output | ForEach-Object { "[$($startedAt.ToString('o'))] $_" } |
    Add-Content -LiteralPath $logPath -Encoding UTF8
  if ($exitCode -ne 0) {
    throw "Backupul CRM a eșuat cu codul $exitCode. Verifică $logPath."
  }
} finally {
  Pop-Location
}
