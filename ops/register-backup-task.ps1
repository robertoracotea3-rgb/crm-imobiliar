param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectPath,

  [Parameter(Mandatory = $true)]
  [string]$BackupDirectory,

  [ValidateRange(1, 24)]
  [int]$IntervalHours = 6,

  [string]$TaskName = 'Kira CRM - Backup criptat'
)

$ErrorActionPreference = 'Stop'
$runner = Join-Path ([System.IO.Path]::GetFullPath($ProjectPath)) 'ops\run-backup.ps1'
if (-not (Test-Path -LiteralPath $runner)) {
  throw 'Nu am găsit ops\run-backup.ps1 în proiect.'
}

$arguments = @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', "`"$runner`"",
  '-ProjectPath', "`"$([System.IO.Path]::GetFullPath($ProjectPath))`"",
  '-BackupDirectory', "`"$([System.IO.Path]::GetFullPath($BackupDirectory))`""
) -join ' '

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$trigger = New-ScheduledTaskTrigger `
  -Once `
  -At ((Get-Date).AddMinutes(5)) `
  -RepetitionInterval (New-TimeSpan -Hours $IntervalHours) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$principal = New-ScheduledTaskPrincipal `
  -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Backup criptat Kira CRM la fiecare $IntervalHours ore. Nu conține secrete în definiția taskului." `
  -Force | Out-Null

Write-Host "Task creat: $TaskName"
Write-Host 'Rulează-l manual o dată și testează restaurarea înainte să îl consideri funcțional.'
