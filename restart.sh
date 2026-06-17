#!/usr/bin/env bash
# ============================================================
#  Task Manager - 서버 재시작 스크립트 (bash/Git Bash용)
#  백엔드: http://localhost:4000
#  프론트엔드: http://localhost:3000
# ============================================================

set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")/backend" && pwd)"
FRONTEND_DIR="$(cd "$(dirname "$0")/frontend" && pwd)"
BACKEND_LOG="$BACKEND_DIR/backend.log"
FRONTEND_LOG="$FRONTEND_DIR/frontend.log"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; }

echo ""
echo "============================================================"
echo "   Task Manager - 서버 재시작 스크립트"
echo "   백엔드 : http://localhost:4000"
echo "   프론트 : http://localhost:3000"
echo "============================================================"
echo ""

# ─────────────────────────────────────────────
# 1. 기존 프로세스 종료
# ─────────────────────────────────────────────
info "[1/5] 기존 프로세스 종료 중..."

kill_port() {
    local port=$1
    # Windows (netstat) 방식과 Linux (lsof) 방식 모두 지원
    if command -v netstat &>/dev/null; then
        local pids
        pids=$(netstat -aon 2>/dev/null \
            | awk -v p=":$port " '$0 ~ p && /LISTENING/ {print $NF}' \
            | sort -u)
        for pid in $pids; do
            [[ -z "$pid" || "$pid" == "0" ]] && continue
            info "  포트 $port 점유 PID $pid 종료"
            taskkill //PID "$pid" //F &>/dev/null || kill -9 "$pid" &>/dev/null || true
        done
    fi
    if command -v lsof &>/dev/null; then
        local pids
        pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
        for pid in $pids; do
            info "  포트 $port 점유 PID $pid 종료"
            kill -9 "$pid" &>/dev/null || true
        done
    fi
}

kill_port 4000
kill_port 3000

# nodemon / node 프로세스 중 task-manager 경로 실행 중인 것 종료
if command -v tasklist &>/dev/null; then
    # Windows 환경
    tasklist //fi "imagename eq node.exe" //fo csv 2>/dev/null \
        | awk -F',' 'NR>1 {gsub(/"/, "", $2); print $2}' \
        | xargs -I{} taskkill //PID {} //F &>/dev/null || true
else
    pkill -f "nodemon.*app.js" &>/dev/null || true
    pkill -f "node.*task-manager" &>/dev/null || true
fi

sleep 1
success "기존 프로세스 종료 완료"
echo ""

# ─────────────────────────────────────────────
# 2. PostgreSQL 확인
# ─────────────────────────────────────────────
info "[2/5] PostgreSQL 연결 확인 중..."

PG_OK=false
if command -v psql &>/dev/null; then
    if PGPASSWORD=postgres1234 psql -U postgres -h localhost -c '\q' &>/dev/null; then
        success "PostgreSQL 연결 확인 - OK"
        PG_OK=true
    fi
fi

if ! $PG_OK; then
    # Windows 서비스 시작 시도
    for svc in "postgresql-x64-17" "postgresql-x64-16" "postgresql"; do
        if sc query "$svc" &>/dev/null 2>&1; then
            warn "PostgreSQL 서비스($svc) 시작 시도..."
            net start "$svc" &>/dev/null || true
            sleep 3
            break
        fi
    done
    warn "PostgreSQL 상태를 확인할 수 없습니다. 백엔드 실행 후 연결 오류가 발생할 수 있습니다."
fi
echo ""

# ─────────────────────────────────────────────
# 3. 백엔드 의존성 확인
# ─────────────────────────────────────────────
info "[3/5] 백엔드 의존성 확인 중..."

if [[ ! -d "$BACKEND_DIR/node_modules" ]]; then
    warn "node_modules 없음 - npm install 실행 중..."
    (cd "$BACKEND_DIR" && npm install) || { error "npm install 실패 (backend)"; exit 1; }
    success "백엔드 의존성 설치 완료"
else
    # package.json이 node_modules보다 최신이면 재설치
    if [[ "$BACKEND_DIR/package.json" -nt "$BACKEND_DIR/node_modules/.package-lock.json" ]] 2>/dev/null; then
        warn "package.json 변경 감지 - npm install 실행 중..."
        (cd "$BACKEND_DIR" && npm install) || { error "npm install 실패 (backend)"; exit 1; }
    fi
    success "백엔드 의존성 확인 - OK"
fi

# .env 파일 존재 확인
if [[ ! -f "$BACKEND_DIR/.env" ]]; then
    error ".env 파일이 없습니다: $BACKEND_DIR/.env"
    exit 1
fi
echo ""

# ─────────────────────────────────────────────
# 4. 백엔드 시작
# ─────────────────────────────────────────────
info "[4/5] 백엔드 서버 시작 중..."

(cd "$BACKEND_DIR" && npm run dev >> "$BACKEND_LOG" 2>&1) &
BACKEND_PID=$!
echo "  PID: $BACKEND_PID | 로그: $BACKEND_LOG"

# 백엔드 기동 대기 (최대 20초)
RETRIES=0
BACKEND_READY=false
while [[ $RETRIES -lt 10 ]]; do
    sleep 2
    RETRIES=$((RETRIES + 1))
    if netstat -aon 2>/dev/null | grep -q ":4000.*LISTENING"; then
        BACKEND_READY=true
        break
    fi
    # 프로세스가 죽었으면 중단
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        error "백엔드 프로세스가 비정상 종료되었습니다."
        error "로그 확인: $BACKEND_LOG"
        tail -20 "$BACKEND_LOG" 2>/dev/null || true
        exit 1
    fi
    info "  대기 중... ($RETRIES/10)"
done

if $BACKEND_READY; then
    success "백엔드 서버 준비 완료 - http://localhost:4000"
else
    warn "백엔드 응답 대기 시간 초과 (실행 중일 수 있으나 확인 필요)"
    warn "로그: $BACKEND_LOG"
fi
echo ""

# ─────────────────────────────────────────────
# 5. 프론트엔드 시작
# ─────────────────────────────────────────────
info "[5/5] 프론트엔드 서버 시작 중..."

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    warn "node_modules 없음 - npm install 실행 중..."
    (cd "$FRONTEND_DIR" && npm install) || { error "npm install 실패 (frontend)"; exit 1; }
    success "프론트엔드 의존성 설치 완료"
fi

(cd "$FRONTEND_DIR" && npm run dev >> "$FRONTEND_LOG" 2>&1) &
FRONTEND_PID=$!
echo "  PID: $FRONTEND_PID | 로그: $FRONTEND_LOG"

sleep 3
if kill -0 "$FRONTEND_PID" 2>/dev/null; then
    success "프론트엔드 서버 시작됨 - http://localhost:3000"
else
    error "프론트엔드 프로세스가 비정상 종료되었습니다."
    error "로그 확인: $FRONTEND_LOG"
    tail -20 "$FRONTEND_LOG" 2>/dev/null || true
    exit 1
fi
echo ""

# ─────────────────────────────────────────────
# 완료
# ─────────────────────────────────────────────
echo "============================================================"
echo -e "   ${GREEN}서버 시작 완료!${NC}"
echo "   프론트엔드 : http://localhost:3000"
echo "   백엔드 API  : http://localhost:4000"
echo ""
echo "   백엔드 PID  : $BACKEND_PID"
echo "   프론트 PID  : $FRONTEND_PID"
echo ""
echo "   로그 파일:"
echo "     $BACKEND_LOG"
echo "     $FRONTEND_LOG"
echo ""
echo "   서버 종료:  kill $BACKEND_PID $FRONTEND_PID"
echo "============================================================"
