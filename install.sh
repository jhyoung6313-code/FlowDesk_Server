#!/usr/bin/env bash
# ============================================================
#  Task Manager - 전체 설치 및 실행 스크립트
#  Linux / macOS / Git Bash(Windows) 공용
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 색상 코드 ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; }
step()    { echo -e "\n${BOLD}${CYAN}$*${NC}"; }

echo ""
echo "============================================================"
echo -e "   ${BOLD}Task Manager - 전체 설치 및 실행 스크립트${NC}"
echo "   Docker 기반 / Linux · macOS · Git Bash 공용"
echo "============================================================"
echo ""

# ─────────────────────────────────────────────
# 1. Docker 설치 여부 확인
# ─────────────────────────────────────────────
step "[1/6] Docker 설치 확인 중..."

if ! command -v docker &>/dev/null; then
    error "Docker가 설치되어 있지 않습니다."
    echo ""
    echo "  Docker를 먼저 설치하세요:"
    echo ""
    echo "  ▸ macOS   : https://www.docker.com/products/docker-desktop/"
    echo "  ▸ Ubuntu  : sudo apt-get install docker.io docker-compose-plugin"
    echo "  ▸ Windows : https://www.docker.com/products/docker-desktop/"
    echo ""
    exit 1
fi

DOCKER_VER=$(docker --version)
success "$DOCKER_VER"

# Docker Compose 플러그인 또는 독립 실행 확인
if docker compose version &>/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null; then
    COMPOSE_CMD="docker-compose"
else
    error "Docker Compose를 찾을 수 없습니다."
    echo "  Docker Desktop 또는 docker-compose-plugin을 설치하세요."
    exit 1
fi
success "Compose: $($COMPOSE_CMD version --short 2>/dev/null || echo 'available')"

# ─────────────────────────────────────────────
# 2. Docker 데몬 실행 확인
# ─────────────────────────────────────────────
step "[2/6] Docker 실행 상태 확인 중..."

if ! docker info &>/dev/null; then
    warn "Docker 데몬이 실행 중이 아닙니다. 시작 시도 중..."

    # macOS - Docker Desktop 시작
    if [[ "$(uname)" == "Darwin" ]]; then
        open -a Docker 2>/dev/null || true
        echo "  Docker Desktop 시작 중 (최대 60초 대기)..."
        WAIT=0
        until docker info &>/dev/null || [[ $WAIT -ge 60 ]]; do
            sleep 5; WAIT=$((WAIT+5))
            info "  대기 중... (${WAIT}/60초)"
        done
    # Linux - systemd
    elif command -v systemctl &>/dev/null; then
        sudo systemctl start docker || true
        sleep 3
    fi

    if ! docker info &>/dev/null; then
        error "Docker 데몬을 시작할 수 없습니다."
        echo "  Docker Desktop(macOS/Windows) 또는 'sudo systemctl start docker'(Linux)를 실행하세요."
        exit 1
    fi
fi

success "Docker 데몬 실행 중"

# ─────────────────────────────────────────────
# 3. .env 파일 설정
# ─────────────────────────────────────────────
step "[3/6] 환경 변수 설정 확인 중..."

if [[ ! -f ".env" ]]; then
    if [[ -f ".env.example" ]]; then
        cp ".env.example" ".env"
        success ".env.example → .env 복사 완료"
        echo ""
        warn "┌──────────────────────────────────────────────────┐"
        warn "│  [권장] 보안을 위해 .env 파일의 DB_PASSWORD 와   │"
        warn "│  JWT_SECRET 값을 변경하시기 바랍니다.             │"
        warn "│  파일 위치: $SCRIPT_DIR/.env"
        warn "└──────────────────────────────────────────────────┘"
        echo ""
        read -r -p "  지금 .env 파일을 편집하시겠습니까? (y/N): " EDIT_ENV
        if [[ "${EDIT_ENV,,}" == "y" ]]; then
            "${EDITOR:-nano}" ".env"
            success ".env 편집 완료"
        fi
    else
        error ".env.example 파일을 찾을 수 없습니다."
        exit 1
    fi
else
    success ".env 파일 존재"
fi

# .env에서 APP_PORT 읽기 (기본값 80)
APP_PORT=$(grep -E '^APP_PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d ' ' || echo "80")
APP_PORT="${APP_PORT:-80}"

# ─────────────────────────────────────────────
# 4. 포트 충돌 확인
# ─────────────────────────────────────────────
step "[4/6] 포트 충돌 확인 중..."

PORT_CONFLICT=false

check_port() {
    local port=$1
    if command -v lsof &>/dev/null; then
        lsof -iTCP:"$port" -sTCP:LISTEN &>/dev/null && return 0 || return 1
    elif command -v netstat &>/dev/null; then
        netstat -tuln 2>/dev/null | grep -q ":$port " && return 0 || return 1
    fi
    return 1
}

if check_port "$APP_PORT"; then
    warn "포트 ${APP_PORT}이(가) 이미 사용 중입니다."
    PORT_CONFLICT=true
fi

if $PORT_CONFLICT; then
    echo ""
    warn ".env 파일의 APP_PORT 값을 변경하거나 해당 포트를 사용하는 프로그램을 종료하세요."
    read -r -p "  그래도 계속 진행하시겠습니까? (y/N): " CONTINUE_INSTALL
    if [[ "${CONTINUE_INSTALL,,}" != "y" ]]; then
        echo "  설치를 취소합니다."
        exit 1
    fi
else
    success "포트 ${APP_PORT} 사용 가능"
fi

# ─────────────────────────────────────────────
# 5. Docker 이미지 빌드 및 컨테이너 시작
# ─────────────────────────────────────────────
step "[5/6] Docker 이미지 빌드 및 컨테이너 시작 중..."
echo "  (처음 실행 시 5~10분 소요될 수 있습니다)"
echo ""

if ! $COMPOSE_CMD up --build -d; then
    error "Docker 컨테이너 실행에 실패했습니다."
    echo "  로그 확인: $COMPOSE_CMD logs"
    exit 1
fi

# ─────────────────────────────────────────────
# 6. 서비스 기동 대기
# ─────────────────────────────────────────────
step "[6/6] 서비스 기동 대기 중..."

WAIT=0
APP_URL="http://localhost:${APP_PORT}"

until curl -sf -o /dev/null "$APP_URL/" || [[ $WAIT -ge 120 ]]; do
    sleep 5
    WAIT=$((WAIT+5))
    info "  대기 중... (${WAIT}/120초)"
done

if curl -sf -o /dev/null "$APP_URL/"; then
    success "서비스 준비 완료!"
else
    warn "서비스 응답 대기 시간 초과. 아직 기동 중일 수 있습니다."
    warn "잠시 후 브라우저에서 직접 접속을 시도하세요."
fi

# ─────────────────────────────────────────────
# 완료
# ─────────────────────────────────────────────
echo ""
echo "============================================================"
echo -e "   ${GREEN}${BOLD}설치 및 실행 완료!${NC}"
echo ""
echo -e "   브라우저 접속 URL: ${CYAN}${APP_URL}${NC}"
echo ""
echo "   기본 계정:"
echo "     관리자  - admin / admin1234"
echo "     팀원    - member1 / member1234"
echo ""
echo "   유용한 명령어:"
echo "     컨테이너 상태: $COMPOSE_CMD ps"
echo "     로그 보기    : $COMPOSE_CMD logs -f"
echo "     서비스 중지  : $COMPOSE_CMD down"
echo "     서비스 재시작: $COMPOSE_CMD restart"
echo "     데이터 초기화: $COMPOSE_CMD down -v && $COMPOSE_CMD up -d"
echo "============================================================"
echo ""

# 브라우저 자동 열기
read -r -p "  브라우저를 자동으로 열겠습니까? (Y/n): " OPEN_BROWSER
if [[ "${OPEN_BROWSER,,}" != "n" ]]; then
    if command -v xdg-open &>/dev/null; then
        xdg-open "$APP_URL" &>/dev/null &
    elif command -v open &>/dev/null; then
        open "$APP_URL"
    elif command -v start &>/dev/null; then
        start "$APP_URL"
    fi
fi
