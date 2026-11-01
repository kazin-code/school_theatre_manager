# School Theatre Manager Server: the background task, firewall rules and folder permissions.
# Run by the server installer (and its Start-menu shortcuts) as an administrator.
#
#   server-task.ps1 install   [-Port 8417] [-NoFirewall]   register the start-up task and start it
#   server-task.ps1 start | stop | restart
#   server-task.ps1 uninstall                              stop it and remove the task and firewall rules
param(
  [Parameter(Mandatory = $true)][ValidateSet("install", "uninstall", "start", "stop", "restart")][string]$Action,
  [string]$InstallDir = "",
  [string]$DataDir = (Join-Path $env:ProgramData "School Theatre Manager Server"),
  [int]$Port = 8417,
  [switch]$NoFirewall
)
$ErrorActionPreference = "Stop"
# this script is in <install folder>\app\tools (Windows PowerShell 5.1 has no $PSScriptRoot in param defaults)
if (-not $InstallDir) { $InstallDir = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)) }
$TaskName = "School Theatre Manager Server"
$node = Join-Path $InstallDir "node\node.exe"
$server = Join-Path $InstallDir "app\server\server.cjs"
$log = Join-Path $DataDir "logs\server.log"

function Stop-Server {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($InstallDir, [StringComparison]::OrdinalIgnoreCase) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Wait-Server {
  for ($i = 0; $i -lt 60; $i++) {
    try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://127.0.0.1:$Port/api/v1/ping"; if ($r.Content -match "school-theatre-manager") { return $true } } catch {}
    Start-Sleep -Seconds 1
  }
  return $false
}

function Start-Server {
  Start-ScheduledTask -TaskName $TaskName
  if (-not (Wait-Server)) {
    Write-Host "The server didn't start. The last lines of $log :"
    Get-Content $log -Tail 20 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $_" }
    exit 1
  }
  Write-Host "The server is running on port $Port."
}

switch ($Action) {
  "install" {
    Stop-Server
    # the data folder holds the database password (server.json) and every backup:
    # only administrators and the server itself (SYSTEM) may open it
    New-Item -ItemType Directory -Force $DataDir, (Join-Path $DataDir "logs") | Out-Null
    # (the folder gets the rule; everything inside inherits it)
    & icacls $DataDir /inheritance:r /grant:r "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" /C /Q
    if ($LASTEXITCODE) { throw "Couldn't set the permissions of $DataDir" }
    & icacls (Join-Path $DataDir "*") /reset /T /C /Q
    if ($LASTEXITCODE) { throw "Couldn't set the permissions inside $DataDir" }
    $act = New-ScheduledTaskAction -Execute $node -Argument "`"$server`" --data `"$DataDir`" --log `"$log`"" -WorkingDirectory (Join-Path $InstallDir "app")
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
      -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName $TaskName -Action $act -Trigger $trigger -Settings $settings -Principal $principal -Force `
      -Description "School Theatre Manager Server: the HTTP API on port $Port. Settings: $DataDir\server.json" | Out-Null
    Get-NetFirewallRule -DisplayName "$TaskName*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    if (-not $NoFirewall) {
      # the school network only (domain and private networks), never public ones
      New-NetFirewallRule -DisplayName "$TaskName (app, TCP $Port)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Domain, Private | Out-Null
      New-NetFirewallRule -DisplayName "$TaskName (search, UDP 8418)" -Direction Inbound -Action Allow -Protocol UDP -LocalPort 8418 -Profile Domain, Private | Out-Null
    }
    Start-Server
  }
  "start" { Start-Server }
  "stop" { Stop-Server; Write-Host "The server is stopped. It starts again when Windows starts." }
  "restart" { Stop-Server; Start-Sleep -Seconds 1; Start-Server }
  "uninstall" {
    Stop-Server
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false }
    Get-NetFirewallRule -DisplayName "$TaskName*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    Write-Host "The server task and firewall rules are removed."
  }
}
