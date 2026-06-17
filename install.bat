@echo off
setlocal enabledelayedexpansion
chcp 65001 > nul

echo.
echo ============================================================
echo   Task Manager - 전체 설치 및 실행 스크립트 (Windows)
echo   ver 1.0 / Docker 기반
echo ============================================================
echo.

:: ─────────────────────────────────────────────
:: 1. 관리자 권한 확인
:: ─────────────────────────────────────────────
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [경고] 관리자 권한으로 실행하면 Docker 서비스 제어가 더 안정적입니다.
    echo        계속 진행하려면 아무 키나 누르세요.
    pause > nul
    echo.
)

:: ─────────────────────────────────────────────
:: 2. Docker 설치 여부 확인
:: ─────────────────────────────────────────────
echo [1/6] Docker 설치 확인 중...

docker --version > nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [오류] Docker가 설치되어 있지 않습니다.
    echo.
    echo  Docker Desktop을 먼저 설치하세요:
    echo    https://www.docker.com/products/docker-desktop/
    echo.
    echo  설치 후 Docker Desktop을 실행한 다음 이 스크립트를 다시 실행하세요.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('docker --version') do echo   %%v

:: ─────────────────────────────────────────────
:: 3. Docker 실행 상태 확인
:: ─────────────────────────────────────────────
echo.
echo [2/6] Docker 실행 상태 확인 중...

docker info > nul 2>&1
if %errorlevel% neq 0 (
    echo   Docker Desktop이 실행 중이 아닙니다. 시작 시도 중...
    echo.

    :: Docker Desktop 시작 시도
    set "DOCKER_PATH="
    if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
        set "DOCKER_PATH=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
    ) else if exist "%LocalAppData%\Docker\Docker Desktop.exe" (
        set "DOCKER_PATH=%LocalAppData%\Docker\Docker Desktop.exe"
    )

    if defined DOCKER_PATH (
        start "" "!DOCKER_PATH!"
        echo   Docker Desktop 시작 중 (최대 60초 대기)...
        set /a wait=0
        :wait_docker
        timeout /t 5 /nobreak > nul
        set /a wait+=5
        docker info > nul 2>&1
        if !errorlevel! equ 0 goto :docker_ready
        if !wait! lss 60 (
            echo   대기 중... (!wait!/60초)
            goto :wait_docker
        )
        echo.
        echo  [오류] Docker Desktop 시작 시간 초과.
        echo         Docker Desktop을 수동으로 실행한 후 다시 시도하세요.
        pause
        exit /b 1
    ) else (
        echo.
        echo  [오류] Docker Desktop 실행 파일을 찾을 수 없습니다.
        echo         Docker Desktop을 수동으로 실행한 후 다시 시도하세요.
        pause
        exit /b 1
    )
)

:docker_ready
echo   Docker 실행 중 - OK

:: ─────────────────────────────────────────────
:: 4. 스크립트 위치 확인 (프로젝트 루트 이동)
:: ─────────────────────────────────────────────
cd /d "%~dp0"

:: ─────────────────────────────────────────────
:: 5. .env 파일 설정
:: ─────────────────────────────────────────────
echo.
echo [3/6] 환경 변수 설정 확인 중...

if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" > nul
        echo   .env.example 에서 .env 파일을 생성했습니다.
        echo.
        echo   ┌──────────────────────────────────────────────────┐
        echo   │  [권장] 보안을 위해 .env 파일의 비밀번호와        │
        echo   │  JWT_SECRET 값을 변경하시기 바랍니다.              │
        echo   │  파일 위치: %~dp0.env
        echo   └──────────────────────────────────────────────────┘
        echo.
        set /p "EDIT_ENV=지금 .env 파일을 편집하시겠습니까? (Y/N, 기본값 N): "
        if /i "!EDIT_ENV!"=="Y" (
            notepad ".env"
            echo   .env 파일 편집 완료. 계속합니다...
            echo.
        )
    ) else (
        echo   [오류] .env.example 파일을 찾을 수 없습니다.
        pause
        exit /b 1
    )
) else (
    echo   .env 파일 존재 - OK
)

:: ─────────────────────────────────────────────
:: 6. 포트 충돌 확인
:: ─────────────────────────────────────────────
echo.
echo [4/6] 포트 충돌 확인 중...

:: .env에서 APP_PORT 읽기 (기본값 80)
set "APP_PORT=80"
for /f "tokens=2 delims==" %%p in ('findstr /i "^APP_PORT=" .env 2^>nul') do set "APP_PORT=%%p"

netstat -aon 2>nul | findstr ":%APP_PORT% " | findstr "LISTENING" > nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo   [경고] 포트 %APP_PORT%이(가) 이미 사용 중입니다.
    echo          .env 파일에서 APP_PORT 값을 변경하거나
    echo          해당 포트를 사용하는 프로그램을 종료하세요.
    echo.
    set /p "CONTINUE=그래도 계속 진행하시겠습니까? (Y/N): "
    if /i "!CONTINUE!" neq "Y" (
        echo   설치를 취소합니다.
        pause
        exit /b 1
    )
) else (
    echo   포트 %APP_PORT% 사용 가능 - OK
)

:: ─────────────────────────────────────────────
:: 7. Docker 이미지 빌드 및 컨테이너 시작
:: ─────────────────────────────────────────────
echo.
echo [5/6] Docker 이미지 빌드 및 컨테이너 시작 중...
echo   (처음 실행 시 5~10분 소요될 수 있습니다)
echo.

docker compose up --build -d

if %errorlevel% neq 0 (
    echo.
    echo  [오류] Docker 컨테이너 실행에 실패했습니다.
    echo         로그를 확인하려면: docker compose logs
    pause
    exit /b 1
)

:: ─────────────────────────────────────────────
:: 8. 서비스 기동 대기
:: ─────────────────────────────────────────────
echo.
echo [6/6] 서비스 기동 대기 중...

set /a wait=0
:wait_app
timeout /t 5 /nobreak > nul
set /a wait+=5

:: 프론트엔드(nginx) 응답 확인
curl -s -o nul -w "%%{http_code}" http://localhost:%APP_PORT%/ 2>nul | findstr "200 301 302" > nul 2>&1
if %errorlevel% equ 0 (
    echo   서비스 준비 완료!
    goto :app_ready
)

if %wait% lss 120 (
    echo   대기 중... (%wait%/120초)
    goto :wait_app
)

echo   [경고] 서비스 응답 대기 시간 초과. 아직 기동 중일 수 있습니다.
echo          잠시 후 브라우저에서 직접 접속을 시도하세요.

:app_ready
echo.

:: ─────────────────────────────────────────────
:: 완료
:: ─────────────────────────────────────────────
echo ============================================================
echo   설치 및 실행 완료!
echo.
if "%APP_PORT%"=="80" (
    echo   브라우저 접속 URL: http://localhost
) else (
    echo   브라우저 접속 URL: http://localhost:%APP_PORT%
)
echo.
echo   기본 계정:
echo     관리자  - admin / admin1234
echo     팀원    - member1 / member1234
echo.
echo   유용한 명령어:
echo     컨테이너 상태: docker compose ps
echo     로그 보기    : docker compose logs -f
echo     서비스 중지  : docker-stop.bat
echo     서비스 재시작: docker-start.bat
echo ============================================================
echo.

:: 브라우저 자동 열기
set /p "OPEN_BROWSER=브라우저를 자동으로 열겠습니까? (Y/N, 기본값 Y): "
if /i "!OPEN_BROWSER!" neq "N" (
    if "%APP_PORT%"=="80" (
        start http://localhost
    ) else (
        start http://localhost:%APP_PORT%
    )
)

pause
exit /b 0
