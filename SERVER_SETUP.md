# FlowDesk 서버 이관 가이드 (Docker · 사내 내부망)

이 프로젝트는 **Docker Compose**로 구동됩니다(db / backend / frontend). 따라서
리눅스 서버에는 **Docker만 설치**하면 되고, 별도의 Node/PostgreSQL/Nginx 수동 설치는
필요 없습니다.

- 대상: 사내 내부망 전용 서버 (예: Ubuntu 22.04 LTS)
- 시나리오: **데이터 없이 빈 상태로 새로 시작** (admin 계정은 자동 생성됨)

---

## 0. 사전 준비 (이관 전 체크리스트)

| 항목 | 내용 |
|------|------|
| 서버 IP | 사내 고정 IP 확보 (예: `192.168.1.100`) |
| 접근 | SSH 접속 가능 |
| 코드 | GitHub 저장소에 push 완료 (아래 "GitHub 연동" 참고) |
| 비밀값 | `.env` 와 `certs/` 는 git 에 안 올라감 → **서버에서 직접 생성** |

> ⚠️ `.env`(DB 비번·JWT·암호화 키)와 `certs/`(TLS 인증서)는 보안상 git 제외 대상입니다.
> 신규 서버에서 새로 만들어야 합니다(빈 시작이라 기존 키를 맞출 필요는 없습니다).

---

## 1. Ubuntu 기본 세팅 + Docker 설치

```bash
sudo apt update && sudo apt upgrade -y

# 방화벽: SSH + 앱 HTTPS 포트만 허용 (내부망)
sudo ufw allow OpenSSH
sudo ufw allow 5443/tcp
sudo ufw allow 5100/tcp
sudo ufw enable

# Docker Engine + Compose 플러그인 설치 (공식 스크립트)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker            # 또는 재로그인
docker --version
docker compose version
```

---

## 2. 소스 코드 가져오기 (GitHub clone)

```bash
sudo mkdir -p /opt/flowdesk && sudo chown $USER:$USER /opt/flowdesk
cd /opt/flowdesk
git clone <GitHub 저장소 URL> .
```

---

## 3. 환경변수(.env) 생성

```bash
cd /opt/flowdesk
cp .env.example .env
nano .env
```

다음 값을 채웁니다:

```ini
# 사내망 다른 PC에서 접속하려면 반드시 0.0.0.0
BIND_ADDR=0.0.0.0
APP_PORT=5100
APP_HTTPS_PORT=5443

# 서버 IP 로 변경 (콤마 구분)
CORS_ORIGIN=https://192.168.1.100:5443,http://192.168.1.100:5100

# DB 비밀번호 (강한 값으로)
DB_PASSWORD=<강한_DB_비밀번호>

# 아래 두 키는 명령으로 생성해 붙여넣기
JWT_SECRET=<생성값>
DATA_ENCRYPTION_KEY=<생성값>

JWT_EXPIRES_IN=8h
DISABLE_OTP=false        # 운영은 false 권장
```

키 생성:

```bash
# JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))" 2>/dev/null \
  || docker run --rm node:20-alpine node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# DATA_ENCRYPTION_KEY (64 hex, 운영 중 변경 금지)
docker run --rm node:20-alpine node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> `DATA_ENCRYPTION_KEY` 는 한번 정하면 바꾸지 마세요(바꾸면 이후 암호화된 데이터 복호화 불가).

---

## 4. TLS 인증서 생성 (내부망 자체서명)

`certs/flowdesk.crt`, `certs/flowdesk.key` 두 파일이 필요합니다(파일명 고정).

```bash
cd /opt/flowdesk
mkdir -p certs
openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
  -keyout certs/flowdesk.key -out certs/flowdesk.crt \
  -subj "/CN=192.168.1.100" \
  -addext "subjectAltName=IP:192.168.1.100"
```

> 자체서명이라 브라우저에 "안전하지 않음" 경고가 뜹니다(내부망에서는 수용 가능).
> `subjectAltName` 에 서버 IP를 넣으면 경고가 줄어듭니다.

---

## 5. 빌드 및 기동

```bash
cd /opt/flowdesk
docker compose build
docker compose up -d
docker compose ps          # 상태 확인 (db/backend/frontend)
docker compose logs -f backend   # 첫 기동: 마이그레이션→시드 로그 확인
```

백엔드 컨테이너가 시작 시 자동으로:
1. `prisma migrate deploy` (DB 스키마 생성)
2. `seed.js` 실행 → **admin / admin1234**, member1·2, 샘플 업무 생성

---

## 6. 접속 확인

브라우저: `https://192.168.1.100:5443`
- ID: `admin` / PW: `admin1234`

> `frontend` 컨테이너가 `unhealthy` 로 떠도 정상입니다(헬스체크 오탐 — nginx가
> HTTPS만 서빙). 실제 정상 여부는 위 URL 접속 200 으로 판단하세요.

---

## admin 계정 / 샘플 데이터 관련

- **기본 비번(admin1234)으로 충분**하면 추가 작업 없음 — seed가 자동 생성합니다.
- **현재 노트북 admin의 바뀐 비밀번호·표시이름·OTP**까지 유지하려면, 기동 후
  노트북에서 admin 한 행만 옮기면 됩니다:

  ```bash
  # 노트북(운영 DB가 Docker면): users 테이블의 admin 행만 덤프
  docker compose exec db pg_dump -U postgres -d task_manager \
    --data-only --table=users --column-inserts \
    | findstr /C:"admin" > admin_row.sql   # (윈도우) 또는 grep admin

  # 서버에서 적용 (기존 admin 행 갱신)
  ```
  > 정확한 1줄 SQL이 필요하면 별도 요청 주세요(스키마 컬럼명 맞춰 작성).

- **샘플 업무 5개를 원치 않으면** 기동 후 한 번 비우면 됩니다:
  ```bash
  docker compose exec db psql -U postgres -d task_manager \
    -c "TRUNCATE tasks CASCADE;"
  ```

---

## 운영 명령어

```bash
docker compose ps                 # 컨테이너 상태
docker compose logs -f backend    # 백엔드 로그
docker compose restart backend    # 재시작
docker compose down               # 중지(볼륨 유지)
docker compose up -d --build      # 코드 갱신 후 재배포

# 코드만 업데이트 (GitHub 연동 후)
cd /opt/flowdesk && git pull && docker compose up -d --build
```

## 데이터 백업 (운영 시작 후 정기적으로)

```bash
# DB 백업
docker compose exec db pg_dump -U postgres -d task_manager > backup_$(date +%F).sql

# 업로드 파일 볼륨 백업
docker run --rm -v flowdesk_uploads_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/uploads_$(date +%F).tar.gz -C /data .
```
