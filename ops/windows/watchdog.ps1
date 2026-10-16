<#
  FlowDesk 감시 스크립트 (Windows) — 백엔드(4000 /health)·프런트(3000)가 응답하지 않으면 restart.bat 으로 다시 띄운다.
  작업 스케줄러로 2분마다 실행하도록 register-autostart.ps1 이 등록한다. 직접 실행도 가능: powershell -File watchdog.ps1
  - 10분 안에 3회를 넘게 재시작해야 하는 상황이면(기동 자체가 실패하는 상태) 더 시도하지 않고 로그만 남긴다 → 수동 확인 필요
  - 로그: ops\watchdog.log (git 제외)
#>
param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [int]$MaxRestartsPer10Min = 3
)

$log = Join-Path $Root 'ops\watchdog.log'
function Log([string]$m) { "$(Get-Date -Format 's')  $m" | Add-Content -Path $log -Encoding UTF8 }
function Up([string]$url) {
  try { return ((Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5).StatusCode -lt 500) } catch { return $false }
}

$api = Up 'http://localhost:4000/health'
$web = Up 'http://localhost:3000/'
if ($api -and $web) { exit 0 }

$stamp = Join-Path $env:TEMP 'flowdesk_watchdog_restarts.txt'
$recent = @()
if (Test-Path $stamp) {
  $recent = @(Get-Content $stamp | ForEach-Object { [datetime]$_ } | Where-Object { $_ -gt (Get-Date).AddMinutes(-10) })
}
if ($recent.Count -ge $MaxRestartsPer10Min) {
  Log "재시작 횟수 초과(10분 내 $($recent.Count)회) — 수동 확인이 필요합니다. (api=$api web=$web)"
  exit 1
}

Log "다운 감지 (api=$api web=$web) — restart.bat 실행"
($recent + (Get-Date)) | ForEach-Object { $_.ToString('o') } | Set-Content -Path $stamp
# restart.bat 은 마지막에 pause 하므로 stdin 을 비워(< nul) 입력 대기 없이 끝나게 한다. 서버 프로세스는 계속 살아 있다.
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "`"$Root\restart.bat`" < nul" -WorkingDirectory $Root -WindowStyle Hidden
exit 0
