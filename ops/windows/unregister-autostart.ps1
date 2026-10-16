<#
  register-autostart.ps1 로 등록한 작업 스케줄러 작업(FlowDesk-Start, FlowDesk-Watchdog)을 제거한다.
  서버 프로세스 자체는 끄지 않는다 — 끄려면 stop.bat.
#>
foreach ($name in 'FlowDesk-Start', 'FlowDesk-Watchdog') {
  if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
    Write-Host "제거: $name"
  } else {
    Write-Host "없음: $name"
  }
}
