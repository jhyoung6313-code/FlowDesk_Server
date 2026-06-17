@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

echo ============================================================
echo   Task Manager - 서버 재시작 스크립트
echo   백엔드: http://localhost:4000
echo   프론트엔드: http://localhost:3000
echo ============================================================
echo.

:: ─────────────────────────────────────────────
:: 1. 기존 프로세스 종료 (포트 3000, 4000 점유 프로세스)
:: ─────────────────────────────────────────────
echo [1/5] 기존 프로세스 종료 중...

for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":4000 " ^| findstr "LISTENING"') do (
    echo   - 포트 4000 점유 PID: %%a 종료
    taskkill /PID %%a /F >nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo   - 포트 3000 점유 PID: %%a 종료
    taskkill /PID %%a /F >nul 2>&1
)

:: node.exe 프로세스 중 task-manager 관련 종료 (nodemon 포함)
for /f "tokens=2" %%a in ('tasklist /fi "imagename eq node.exe" /fo list 2^>nul ^| findstr "PID:"') do (
    taskkill /PID %%a /F >nul 2>&1
)

timeout /t 2 /nobreak >nul
echo   완료.
echo.

:: ─────────────────────────────────────────────
:: 2. PostgreSQL 서비스 확인
:: ─────────────────────────────────────────────
echo [2/5] PostgreSQL 서비스 확인 중...

sc query postgresql* >nul 2>&1
if %errorlevel% neq 0 (
    :: 일반적인 서비스명 시도
    sc query "postgresql-x64-17" >nul 2>&1
    if %errorlevel% neq 0 (
        sc query "postgresql-x64-16" >nul 2>&1
        if %errorlevel% neq 0 (
            echo   [경고] PostgreSQL 서비스를 찾을 수 없습니다.
            echo          수동으로 PostgreSQL이 실행 중인지 확인하세요.
            goto :skip_pg
        )
    )
)

:: PostgreSQL 서비스 상태 확인 및 시작
for %%s in (postgresql-x64-17 postgresql-x64-16 postgresql postgresql-17) do (
    sc query "%%s" >nul 2>&1
    if !errorlevel! equ 0 (
        sc query "%%s" | findstr "RUNNING" >nul 2>&1
        if !errorlevel! neq 0 (
            echo   PostgreSQL 서비스(%%s) 시작 중...
            net start "%%s" >nul 2>&1
            timeout /t 3 /nobreak >nul
        ) else (
            echo   PostgreSQL 서비스(%%s) 실행 중 - OK
        )
        goto :skip_pg
    )
)

:skip_pg
echo.

:: ─────────────────────────────────────────────
:: 3. 백엔드 의존성 확인
:: ─────────────────────────────────────────────
echo [3/5] 백엔드 의존성 확인 중...

if not exist "c:\Users\jhyou\task-manager\backend\node_modules" (
    echo   node_modules 없음 - npm install 실행 중...
    pushd c:\Users\jhyou\task-manager\backend
    call npm install
    if %errorlevel% neq 0 (
        echo   [오류] npm install 실패
        popd
        goto :error
    )
    popd
    echo   의존성 설치 완료.
) else (
    echo   의존성 확인 - OK
)
echo.

:: ─────────────────────────────────────────────
:: 4. 백엔드 시작
:: ─────────────────────────────────────────────
echo [4/5] 백엔드 서버 시작 중...

start "Task Manager Backend" /min cmd /c "cd /d c:\Users\jhyou\task-manager\backend && npm run dev 2>&1 | tee backend.log"

:: 백엔드 기동 대기 (최대 15초)
set /a retries=0
:wait_backend
timeout /t 2 /nobreak >nul
set /a retries+=1
curl -s http://localhost:4000/api/health >nul 2>&1
if %errorlevel% equ 0 (
    echo   백엔드 서버 준비 완료 - http://localhost:4000
    goto :backend_ok
)
if %retries% lss 7 (
    echo   대기 중... (%retries%/7^)
    goto :wait_backend
)
echo   [경고] 백엔드 응답 없음 (포트가 열릴 때까지 잠시 더 기다리세요)

:backend_ok
echo.

:: ─────────────────────────────────────────────
:: 5. 프론트엔드 시작
:: ─────────────────────────────────────────────
echo [5/5] 프론트엔드 서버 시작 중...

if not exist "c:\Users\jhyou\task-manager\frontend\node_modules" (
    echo   node_modules 없음 - npm install 실행 중...
    pushd c:\Users\jhyou\task-manager\frontend
    call npm install
    if %errorlevel% neq 0 (
        echo   [오류] npm install 실패
        popd
        goto :error
    )
    popd
)

start "Task Manager Frontend" /min cmd /c "cd /d c:\Users\jhyou\task-manager\frontend && npm run dev 2>&1 | tee frontend.log"

timeout /t 4 /nobreak >nul
echo   프론트엔드 서버 시작됨 - http://localhost:3000
echo.

:: ─────────────────────────────────────────────
:: 완료
:: ─────────────────────────────────────────────
echo ============================================================
echo   서버 시작 완료!
echo   프론트엔드: http://localhost:3000
echo   백엔드 API: http://localhost:4000
echo   로그 파일:
echo     backend\backend.log
echo     frontend\frontend.log
echo ============================================================
echo.
echo 창을 닫아도 서버는 계속 실행됩니다.
pause
exit /b 0

:error
echo.
echo [오류] 스크립트 실행 중 문제가 발생했습니다.
pause
exit /b 1
