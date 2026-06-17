@echo off
setlocal enabledelayedexpansion
chcp 65001 > nul

echo.
echo ============================================================
echo   Task Manager - 데이터 초기화 (완전 재설치)
echo   !! 모든 데이터(DB, 업로드 파일)가 삭제됩니다 !!
echo ============================================================
echo.
echo   이 작업은 다음을 삭제합니다:
echo     - 데이터베이스 (모든 업무, 사용자, 일정 등)
echo     - 업로드된 파일
echo     - Docker 볼륨
echo.

set /p "CONFIRM=정말로 초기화하시겠습니까? (YES 를 입력해야 진행됩니다): "
if /i "!CONFIRM!" neq "YES" (
    echo.
    echo   초기화를 취소했습니다.
    pause
    exit /b 0
)

echo.
echo   한 번 더 확인합니다.
set /p "CONFIRM2=모든 데이터가 삭제됩니다. 계속하시겠습니까? (YES/NO): "
if /i "!CONFIRM2!" neq "YES" (
    echo.
    echo   초기화를 취소했습니다.
    pause
    exit /b 0
)

cd /d "%~dp0"

echo.
echo [1/3] 컨테이너 및 볼륨 삭제 중...
docker compose down -v --remove-orphans
if %errorlevel% neq 0 (
    echo   [경고] docker compose down 실패. 수동으로 확인하세요.
)
echo   완료.

echo.
echo [2/3] 이미지 재빌드 및 컨테이너 시작 중...
echo   (수 분이 소요될 수 있습니다)
docker compose up --build -d
if %errorlevel% neq 0 (
    echo.
    echo  [오류] 컨테이너 시작 실패.
    echo         로그 확인: docker compose logs
    pause
    exit /b 1
)

echo.
echo [3/3] 서비스 기동 대기 중...

set "APP_PORT=80"
for /f "tokens=2 delims==" %%p in ('findstr /i "^APP_PORT=" .env 2^>nul') do set "APP_PORT=%%p"

set /a wait=0
:wait_reset
timeout /t 5 /nobreak > nul
set /a wait+=5
curl -s -o nul -w "%%{http_code}" http://localhost:%APP_PORT%/ 2>nul | findstr "200 301 302" > nul 2>&1
if %errorlevel% equ 0 (
    echo   서비스 준비 완료!
    goto :reset_done
)
if %wait% lss 120 (
    echo   대기 중... (%wait%/120초)
    goto :wait_reset
)
echo   [경고] 응답 대기 시간 초과. 잠시 후 직접 접속을 시도하세요.

:reset_done
echo.
echo ============================================================
echo   초기화 완료!
if "%APP_PORT%"=="80" (
    echo   브라우저 접속 URL: http://localhost
) else (
    echo   브라우저 접속 URL: http://localhost:%APP_PORT%
)
echo.
echo   기본 계정:
echo     관리자  - admin / admin1234
echo     팀원    - member1 / member1234
echo ============================================================
pause
exit /b 0
