#!/usr/bin/env bash
# ============================================================
#  Task Manager - 데이터 초기화 (완전 재설치)
#  !! 모든 데이터(DB, 업로드 파일)가 삭제됩니다 !!
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }

echo ""
echo -e "${RED}${BOLD}============================================================${NC}"
echo -e "${RED}${BOLD}   Task Manager - 데이터 초기화 (완전 재설치)${NC}"
echo -e "${RED}${BOLD}   !! 모든 데이터(DB, 업로드 파일)가 삭제됩니다 !!${NC}"
echo -e "${RED}${BOLD}============================================================${NC}"
echo ""
echo "  이 작업은 다음을 삭제합니다:"
echo "    - 데이터베이스 (모든 업무, 사용자, 일정 등)"
echo "    - 업로드된 파일"
echo "    - Docker 볼륨"
echo ""

read -r -p "  정말로 초기화하시겠습니까? (YES 를 입력해야 진행됩니다): " CONFIRM
if [[ "$CONFIRM" != "YES" ]]; then
    echo ""
    echo "  초기화를 취소했습니다."
    exit 0
fi

echo ""
read -r -p "  모든 데이터가 삭제됩니다. 계속하시겠습니까? (YES/NO): " CONFIRM2
if [[ "$CONFIRM2" != "YES" ]]; then
    echo ""
    echo "  초기화를 취소했습니다."
    exit 0
fi

# Docker Compose 명령어 결정
if docker compose version &>/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null; then
    COMPOSE_CMD="docker-compose"
else
    error "Docker Compose를 찾을 수 없습니다."
    exit 1
fi

echo ""
echo "[1/3] 컨테이너 및 볼륨 삭제 중..."
$COMPOSE_CMD down -v --remove-orphans || warn "docker compose down 실패. 수동으로 확인하세요."
success "완료"

echo ""
echo "[2/3] 이미지 재빌드 및 컨테이너 시작 중..."
echo "  (수 분이 소요될 수 있습니다)"
if ! $COMPOSE_CMD up --build -d; then
    error "컨테이너 시작 실패."
    echo "  로그 확인: $COMPOSE_CMD logs"
    exit 1
fi

echo ""
echo "[3/3] 서비스 기동 대기 중..."

APP_PORT=$(grep -E '^APP_PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d ' ' || echo "80")
APP_PORT="${APP_PORT:-80}"
APP_URL="http://localhost:${APP_PORT}"

WAIT=0
until curl -sf -o /dev/null "$APP_URL/" || [[ $WAIT -ge 120 ]]; do
    sleep 5
    WAIT=$((WAIT+5))
    echo "  대기 중... (${WAIT}/120초)"
done

if curl -sf -o /dev/null "$APP_URL/"; then
    success "서비스 준비 완료!"
else
    warn "응답 대기 시간 초과. 잠시 후 직접 접속을 시도하세요."
fi

echo ""
echo "============================================================"
echo -e "   ${GREEN}${BOLD}초기화 완료!${NC}"
echo ""
echo "   브라우저 접속 URL: $APP_URL"
echo ""
echo "   기본 계정:"
echo "     관리자  - admin / admin1234"
echo "     팀원    - member1 / member1234"
echo "============================================================"
