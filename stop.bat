@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

echo [Task Manager] 서버 종료 중...

for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":4000 " ^| findstr "LISTENING"') do (
    echo   포트 4000 PID %%a 종료
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo   포트 3000 PID %%a 종료
    taskkill /PID %%a /F >nul 2>&1
)

echo 완료.
pause
