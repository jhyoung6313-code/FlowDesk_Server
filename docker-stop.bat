@echo off
chcp 65001 > nul
echo ===================================
echo   Task Manager - Docker 중지
echo ===================================

docker compose down

echo.
echo 컨테이너가 중지되었습니다.
echo (데이터는 유지됩니다)
pause
