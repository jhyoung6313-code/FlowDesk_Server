<#
  FlowDesk 자동 시작·감시 등록 (Windows 개발/소규모 운영 PC)
   - FlowDesk-Start    : 로그온할 때 서버를 한 번 띄운다 (restart.bat)
   - FlowDesk-Watchdog : 2분마다 /health 를 확인해 죽어 있으면 다시 띄운다 (watchdog.ps1)
  관리자 권한 PowerShell 에서 실행:  powershell -ExecutionPolicy Bypass -File .\ops\windows\register-autostart.ps1
  해제: .\ops\windows\unregister-autostart.ps1
  ※ 운영 서버(Linux/Docker)에는 필요 없습니다 — docker-compose.yml 의 restart: unless-stopped + healthcheck 가 같은 역할을 합니다.
#>
param([string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path)

$ErrorActionPreference = 'Stop'
$user = "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

# 1) 로그온 시 한 번 시작 (restart.bat 의 pause 를 < nul 로 넘긴다)
$startAction = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$Root\restart.bat`" < nul" -WorkingDirectory $Root
$startTrigger = New-ScheduledTaskTrigger -AtLogOn -User $user
Register-ScheduledTask -TaskName 'FlowDesk-Start' -Action $startAction -Trigger $startTrigger -Settings $settings -User $user -RunLevel Limited -Force | Out-Null

# 2) 2분마다 감시
$wdAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Root\ops\windows\watchdog.ps1`"" -WorkingDirectory $Root
$wdTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 2)
Register-ScheduledTask -TaskName 'FlowDesk-Watchdog' -Action $wdAction -Trigger $wdTrigger -Settings $settings -User $user -RunLevel Limited -Force | Out-Null

Write-Host "등록 완료: FlowDesk-Start(로그온 시), FlowDesk-Watchdog(2분마다). 로그: $Root\ops\watchdog.log"
Get-ScheduledTask -TaskName 'FlowDesk-*' | Select-Object TaskName, State | Format-Table -AutoSize
