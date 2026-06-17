@echo off
chcp 65001 > nul
echo ===================================
echo   Task Manager - Docker 시작
echo ===================================

REM .env 파일이 없으면 .env.example에서 복사
if not exist .env (
    echo .env 파일이 없습니다. .env.example에서 복사합니다...
    copy .env.example .env
    echo .env 파일을 생성했습니다. 필요시 설정을 변경하세요.
    echo.
)

echo Docker 이미지 빌드 및 컨테이너 시작 중...
echo (처음 실행 시 수 분이 소요될 수 있습니다)
echo.

docker compose up --build -d

if %errorlevel% neq 0 (
    echo.
    echo [오류] Docker 실행에 실패했습니다.
    echo Docker Desktop이 실행 중인지 확인하세요.
    pause
    exit /b 1
)

echo.
echo ===================================
echo   실행 완료!
echo   브라우저에서 접속: http://localhost
echo.
echo   기본 계정:
echo     관리자 - admin / admin1234
echo     팀원   - member1 / member1234
echo ===================================
pause
